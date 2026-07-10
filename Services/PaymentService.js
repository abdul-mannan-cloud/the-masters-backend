import mongoose from "mongoose";
import Payment from "../Models/Payment.js";
import Order from "../Models/Order.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";

const VALID_METHODS = ["cash", "easypaisa", "jazzcash", "bank_transfer", "cheque", "other"];
// "refund" is never chosen directly by the caller — it only ever exists as
// the record reversePayment() creates.
const VALID_PAYMENT_TYPES = ["advance", "partial", "final"];

// Money actually received so far — refunds subtract. This is the single
// place that definition lives; Order.getCheckout mirrors it via its own
// local copy for a display-only view (see OrderService.js), but paymentStatus
// itself is only ever set from here.
const sumPayments = (payments) =>
  payments.reduce((sum, p) => sum + (p.paymentType === "refund" ? -p.amount : p.amount), 0);

// Pure — Total Order Amount minus Total Payments, floored at 0 (a customer
// can't owe a negative amount even if they were briefly overpaid).
export const calculateRemainingBalance = (orderTotal, totalPaid) =>
  Math.max(0, Math.round((orderTotal - totalPaid) * 100) / 100);

// Pure — never set by hand anywhere in the app; always derived from money in
// vs. Order.total.
export const calculatePaymentStatus = (orderTotal, totalPaid) => {
  if (totalPaid <= 0) return "unpaid";
  if (totalPaid >= orderTotal) return "paid";
  return "partial";
};

const recalculateOrderPaymentStatus = async (tenantId, orderId, session) => {
  const payments = await Payment.find({ orderId, tenantId }).session(session);
  const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
  if (!order) throw new AppError("Order not found", 404);

  order.paymentStatus = calculatePaymentStatus(order.total, sumPayments(payments));
  await order.save({ session });
};

export const getPayments = async (tenantId, orderId) => {
  const filter = { tenantId };
  if (orderId) filter.orderId = orderId;
  return Payment.find(filter).sort({ paymentDate: -1 });
};

// Same records as getPayments, but resolves recordedBy into a display name —
// this is what the Payment History table actually renders.
export const getPaymentHistory = async (tenantId, orderId) => {
  const payments = await getPayments(tenantId, orderId);
  const employeeIds = [...new Set(payments.filter((p) => p.recordedBy).map((p) => String(p.recordedBy)))];
  const employees = employeeIds.length
    ? await Employee.find({ _id: { $in: employeeIds }, tenantId }).select("name")
    : [];
  const nameById = Object.fromEntries(employees.map((e) => [String(e._id), e.name]));
  const reversedIds = new Set(
    payments.filter((p) => p.reversalOf).map((p) => String(p.reversalOf)),
  );

  return payments.map((p) => ({
    ...p.toObject(),
    recordedByName: p.recordedBy ? nameById[String(p.recordedBy)] || null : null,
    isReversed: reversedIds.has(String(p._id)),
  }));
};

export const getPaymentById = async (tenantId, id) => {
  const payment = await Payment.findOne({ _id: id, tenantId });
  if (!payment) throw new AppError("Payment not found", 404);
  return payment;
};

// Records money received — advance/partial/final. Never touches Order
// totals/discount, only recomputes the derived paymentStatus.
export const addPayment = async (tenantId, data, userId) => {
  const { orderId, amount, method, paymentType, paymentDate, notes, recordedBy } = data;

  if (!orderId || amount === undefined || !method || !paymentType) {
    throw new AppError("orderId, amount, method, and paymentType are required", 400);
  }
  if (amount <= 0) {
    throw new AppError("amount must be greater than 0", 400);
  }
  if (!VALID_METHODS.includes(method)) {
    throw new AppError(`Invalid method. Must be one of: ${VALID_METHODS.join(", ")}`, 400);
  }
  if (!VALID_PAYMENT_TYPES.includes(paymentType)) {
    throw new AppError(
      `Invalid paymentType. Must be one of: ${VALID_PAYMENT_TYPES.join(", ")}`,
      400,
    );
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
    if (!order) throw new AppError("Order not found for this tenant", 404);

    if (recordedBy) {
      const employee = await Employee.findOne({
        _id: recordedBy,
        tenantId,
        isDeleted: false,
      }).session(session);
      if (!employee) throw new AppError("Employee not found for this tenant", 404);
    }

    const [payment] = await Payment.create(
      [
        {
          tenantId,
          orderId,
          amount,
          method,
          paymentType,
          paymentDate,
          notes,
          recordedBy,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    await recalculateOrderPaymentStatus(tenantId, orderId, session);

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// Payment history is append-only — amount/method/paymentType/paymentDate can
// never be changed once recorded (see reversePayment for how a mistake gets
// corrected instead). Only the note is editable, e.g. to fix a typo.
export const updatePayment = async (tenantId, id, data, userId) => {
  const immutableFields = ["amount", "method", "paymentType", "paymentDate", "orderId"];
  const attemptedImmutableChange = immutableFields.some((f) => data[f] !== undefined);
  if (attemptedImmutableChange) {
    throw new AppError(
      "Payments are immutable once recorded — only notes can be edited. Record a reversal instead of changing amount/method/type/date.",
      409,
    );
  }

  const payment = await Payment.findOne({ _id: id, tenantId });
  if (!payment) throw new AppError("Payment not found", 404);

  if (data.notes !== undefined) payment.notes = data.notes;
  payment.updatedBy = userId;
  await payment.save();
  return payment;
};

// The only sanctioned way to "undo" a payment: creates a brand-new "refund"
// record for the same amount, linked back to the original. The original
// stays exactly as recorded — history is never rewritten.
export const reversePayment = async (tenantId, id, data, userId) => {
  const original = await Payment.findOne({ _id: id, tenantId });
  if (!original) throw new AppError("Payment not found", 404);
  if (original.paymentType === "refund") {
    throw new AppError("A refund record cannot itself be reversed", 400);
  }
  const alreadyReversed = await Payment.findOne({ tenantId, reversalOf: original._id });
  if (alreadyReversed) {
    throw new AppError("This payment has already been reversed", 409);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const [reversal] = await Payment.create(
      [
        {
          tenantId,
          orderId: original.orderId,
          amount: original.amount,
          method: original.method,
          paymentType: "refund",
          reversalOf: original._id,
          notes: data?.reason || `Reversal of payment ${original._id}`,
          recordedBy: data?.recordedBy,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    await recalculateOrderPaymentStatus(tenantId, original.orderId, session);

    await session.commitTransaction();
    return reversal;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
