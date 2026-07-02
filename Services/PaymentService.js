import mongoose from "mongoose";
import Payment from "../Models/Payment.js";
import Order from "../Models/Order.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";

const VALID_METHODS = ["cash", "easypaisa", "jazzcash", "bank_transfer", "cheque", "other"];
const VALID_PAYMENT_TYPES = ["advance", "partial", "final"];

const recalculateOrderPaymentStatus = async (tenantId, orderId, session) => {
  const payments = await Payment.find({ orderId, tenantId }).session(session);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
  if (!order) throw new AppError("Order not found", 404);

  if (totalPaid <= 0) order.paymentStatus = "unpaid";
  else if (totalPaid >= order.total) order.paymentStatus = "paid";
  else order.paymentStatus = "partial";

  await order.save({ session });
};

export const listPayments = async (tenantId, orderId) => {
  const filter = { tenantId };
  if (orderId) filter.orderId = orderId;
  return Payment.find(filter).sort({ paymentDate: -1 });
};

export const getPaymentById = async (tenantId, id) => {
  const payment = await Payment.findOne({ _id: id, tenantId });
  if (!payment) throw new AppError("Payment not found", 404);
  return payment;
};

export const createPayment = async (tenantId, data, userId) => {
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

export const updatePayment = async (tenantId, id, data, userId) => {
  const { amount, method, paymentType, paymentDate, notes } = data;

  if (amount !== undefined && amount <= 0) {
    throw new AppError("amount must be greater than 0", 400);
  }
  if (method !== undefined && !VALID_METHODS.includes(method)) {
    throw new AppError(`Invalid method. Must be one of: ${VALID_METHODS.join(", ")}`, 400);
  }
  if (paymentType !== undefined && !VALID_PAYMENT_TYPES.includes(paymentType)) {
    throw new AppError(
      `Invalid paymentType. Must be one of: ${VALID_PAYMENT_TYPES.join(", ")}`,
      400,
    );
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const payment = await Payment.findOne({ _id: id, tenantId }).session(session);
    if (!payment) throw new AppError("Payment not found", 404);

    if (amount !== undefined) payment.amount = amount;
    if (method !== undefined) payment.method = method;
    if (paymentType !== undefined) payment.paymentType = paymentType;
    if (paymentDate !== undefined) payment.paymentDate = paymentDate;
    if (notes !== undefined) payment.notes = notes;
    payment.updatedBy = userId;

    await payment.save({ session });
    await recalculateOrderPaymentStatus(tenantId, payment.orderId, session);

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const deletePayment = async (tenantId, id) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const payment = await Payment.findOne({ _id: id, tenantId }).session(session);
    if (!payment) throw new AppError("Payment not found", 404);

    await Payment.deleteOne({ _id: id, tenantId }, { session });
    await recalculateOrderPaymentStatus(tenantId, payment.orderId, session);

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
