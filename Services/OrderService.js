import mongoose from "mongoose";
import Order from "../Models/Order.js";
import OrderItem from "../Models/OrderItem.js";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import Payment from "../Models/Payment.js";
import Customer from "../Models/Customer.js";
import Measurement from "../Models/Measurement.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";
import { getNextSequence } from "../utils/counter.js";
import {
  calculatePaymentStatus,
  calculateRemainingBalance,
  getPaymentHistory,
} from "./PaymentService.js";

const VALID_DISCOUNT_TYPES = ["fixed", "percentage"];
const VALID_PRODUCTION_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "delivered",
  "cancelled",
];
const VALID_PAYMENT_STATUSES = ["unpaid", "partial", "paid"];

const computeTotal = (subtotal, discount, discountType) => {
  const raw =
    discountType === "percentage"
      ? subtotal - (subtotal * discount) / 100
      : subtotal - discount;
  return Math.max(0, Math.round(raw * 100) / 100);
};

// Order number = the customer's number + that customer's own order sequence,
// e.g. "cust0001-1", then "cust0001-2" for their next order. The sequence is
// scoped per customer (not per tenant), so each customer's orders count from 1.
const generateOrderNumber = async (tenantId, customer, session) => {
  const sequence = await getNextSequence(tenantId, `order:${customer._id}`, session);
  return `${customer.customerNumber}-${sequence}`;
};

export const listOrders = async (tenantId, filters = {}) => {
  const query = { tenantId };
  if (filters.productionStatus) query.productionStatus = filters.productionStatus;
  if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
  if (filters.customerId) query.customerId = filters.customerId;
  return Order.find(query).sort({ createdAt: -1 });
};

export const getOrderById = async (tenantId, id) => {
  const order = await Order.findOne({ _id: id, tenantId });
  if (!order) throw new AppError("Order not found", 404);
  return order;
};

export const createOrder = async (tenantId, data, userId) => {
  const { customerId, deliveryDate, discount = 0, discountType = "fixed", notes } =
    data;

  if (!customerId) {
    throw new AppError("customerId is required", 400);
  }
  if (discountType && !VALID_DISCOUNT_TYPES.includes(discountType)) {
    throw new AppError(
      `Invalid discountType. Must be one of: ${VALID_DISCOUNT_TYPES.join(", ")}`,
      400,
    );
  }
  if (discount < 0) {
    throw new AppError("discount cannot be negative", 400);
  }

  const customer = await Customer.findOne({
    _id: customerId,
    tenantId,
    isDeleted: false,
  });
  if (!customer) throw new AppError("Customer not found for this tenant", 404);

  // Order starts empty — subtotal/total are recalculated as OrderItems are
  // added via OrderItemService. See claude.md: "totals are snapshots".
  // The order-number counter and the order document are two collections, so
  // this is one transaction — a failed create must not burn a sequence number.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const orderNumber = await generateOrderNumber(tenantId, customer, session);
    const [order] = await Order.create(
      [
        {
          tenantId,
          customerId,
          orderNumber,
          deliveryDate,
          subtotal: 0,
          discount,
          discountType,
          total: computeTotal(0, discount, discountType),
          notes,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const updateOrder = async (tenantId, id, data, userId) => {
  const order = await Order.findOne({ _id: id, tenantId });
  if (!order) throw new AppError("Order not found", 404);

  if (["completed", "delivered", "cancelled"].includes(order.productionStatus)) {
    throw new AppError(
      `Order is already ${order.productionStatus} and cannot be modified`,
      409,
    );
  }

  const { deliveryDate, discount, discountType, paymentStatus, productionStatus, notes } =
    data;

  if (discountType !== undefined && !VALID_DISCOUNT_TYPES.includes(discountType)) {
    throw new AppError(
      `Invalid discountType. Must be one of: ${VALID_DISCOUNT_TYPES.join(", ")}`,
      400,
    );
  }
  if (discount !== undefined && discount < 0) {
    throw new AppError("discount cannot be negative", 400);
  }
  if (paymentStatus !== undefined && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
    throw new AppError(
      `Invalid paymentStatus. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`,
      400,
    );
  }
  if (
    productionStatus !== undefined &&
    !VALID_PRODUCTION_STATUSES.includes(productionStatus)
  ) {
    throw new AppError(
      `Invalid productionStatus. Must be one of: ${VALID_PRODUCTION_STATUSES.join(", ")}`,
      400,
    );
  }

  if (deliveryDate !== undefined) order.deliveryDate = deliveryDate;
  if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;
  if (productionStatus !== undefined) order.productionStatus = productionStatus;
  if (notes !== undefined) order.notes = notes;
  order.updatedBy = userId;
  await order.save();

  // Discount changes go through the dedicated helper so "change discount →
  // recalc total → leave Payment history untouched" stays a single code path
  // regardless of whether it's called from here or the Checkout page directly.
  if (discount !== undefined || discountType !== undefined) {
    return applyDiscount(
      tenantId,
      id,
      {
        discount: discount !== undefined ? discount : order.discount,
        discountType: discountType !== undefined ? discountType : order.discountType,
      },
      userId,
    );
  }

  return order;
};

// Discount is an Order-level concern only — Payment records never carry one
// (see PaymentService). Changing it recalculates Order.total from the
// existing OrderItem subtotal; it never touches Payment history, so
// Remaining Balance simply falls out of (new total − existing totalPaid).
export const applyDiscount = async (tenantId, orderId, data, userId) => {
  const { discount, discountType } = data;

  if (discountType !== undefined && !VALID_DISCOUNT_TYPES.includes(discountType)) {
    throw new AppError(
      `Invalid discountType. Must be one of: ${VALID_DISCOUNT_TYPES.join(", ")}`,
      400,
    );
  }
  if (discount !== undefined && discount < 0) {
    throw new AppError("discount cannot be negative", 400);
  }

  const order = await Order.findOne({ _id: orderId, tenantId });
  if (!order) throw new AppError("Order not found", 404);
  if (["completed", "delivered", "cancelled"].includes(order.productionStatus)) {
    throw new AppError(
      `Order is already ${order.productionStatus} and cannot be modified`,
      409,
    );
  }

  if (discount !== undefined) order.discount = discount;
  if (discountType !== undefined) order.discountType = discountType;
  order.total = computeTotal(order.subtotal, order.discount, order.discountType);
  order.updatedBy = userId;
  await order.save();

  // Discount changed → Remaining Balance / paymentStatus must reflect the
  // new total against whatever has already been paid.
  const payments = await Payment.find({ orderId, tenantId });
  order.paymentStatus = calculatePaymentStatus(order.total, sumPayments(payments));
  await order.save();

  return order;
};

export const deleteOrder = async (tenantId, id) => {
  const order = await Order.findOne({ _id: id, tenantId });
  if (!order) throw new AppError("Order not found", 404);

  // Deleting an order cascades to its items, their workflow assignments, and
  // its payments — four collections, so this must be one atomic transaction.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const items = await OrderItem.find({ orderId: id, tenantId }).session(session);
    const itemIds = items.map((item) => item._id);

    if (itemIds.length) {
      await OrderItemAssignment.deleteMany(
        { orderItemId: { $in: itemIds }, tenantId },
        { session },
      );
      await OrderItem.deleteMany({ orderId: id, tenantId }, { session });
    }
    await Payment.deleteMany({ orderId: id, tenantId }, { session });
    await Order.deleteOne({ _id: id, tenantId }, { session });

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return order;
};

export const recalculateOrderTotals = async (tenantId, orderId, session) => {
  const items = await OrderItem.find({ orderId, tenantId, status: { $ne: "cancelled" } }).session(
    session,
  );
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
  if (!order) throw new AppError("Order not found", 404);

  order.subtotal = subtotal;
  order.total = computeTotal(subtotal, order.discount, order.discountType);
  await order.save({ session });
  return order;
};

// Named to match the spec's Order.calculateTotals() — same function, kept
// under both names since OrderItemService already calls it as
// recalculateOrderTotals on every item add/update/delete.
export const calculateTotals = recalculateOrderTotals;

// Itemized bill only — OrderItems as actually billed (snapshotted
// name/price/options), never recomputed from the live ProductType.
export const getBill = async (tenantId, orderId) => {
  const order = await getOrderById(tenantId, orderId);
  const items = await OrderItem.find({ orderId, tenantId }).sort({ createdAt: 1 });

  return {
    order,
    items: items.map((item) => ({
      _id: item._id,
      garmentType: item.garmentType,
      selectedOptions: item.selectedOptions,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.unitPrice * item.quantity,
      instructions: item.instructions,
      status: item.status,
    })),
  };
};

// Full checkout view shown right after an order is created, before any
// payment exists — customer + itemized bill + totals in one call so the
// Checkout page doesn't need three separate round trips.
export const getCheckout = async (tenantId, orderId) => {
  const { order, items } = await getBill(tenantId, orderId);
  const customer = await Customer.findOne({ _id: order.customerId, tenantId, isDeleted: false });
  if (!customer) throw new AppError("Customer not found for this tenant", 404);

  const payments = await getPaymentHistory(tenantId, orderId);
  const totalPaid = sumPayments(payments);

  return {
    order,
    customer,
    items,
    totalPaid,
    remainingBalance: calculateRemainingBalance(order.total, totalPaid),
  };
};

// Sum of payments received minus any refunds — the one place "how much has
// actually been paid" is computed, shared by applyDiscount/getCheckout so it
// can never drift from what PaymentService itself uses to set paymentStatus.
const sumPayments = (payments) =>
  payments.reduce((sum, p) => sum + (p.paymentType === "refund" ? -p.amount : p.amount), 0);

// The complete Order Details view — Customer, Order, every OrderItem with its
// exact historical Measurement document, selected options, assigned
// employees, and a Payment Summary — in one call. Powers both the standalone
// Order page and the Customer Details "Order History" tab.
//
// HISTORICAL ACCURACY: each item's measurement is fetched by the fixed
// measurementId it was created with (never re-resolved from "the customer's
// current measurements"), and that document is immutable once
// lockedForOrder is set — so this always reflects what the order was
// actually built from, even after the customer has newer measurement
// versions on file.
export const getOrderDetails = async (tenantId, orderId) => {
  const order = await getOrderById(tenantId, orderId);
  // Not filtered by isDeleted — a historical order must still show who the
  // customer was even if their profile has since been removed.
  const customer = await Customer.findOne({ _id: order.customerId, tenantId });
  if (!customer) throw new AppError("Customer not found for this tenant", 404);

  const items = await OrderItem.find({ orderId, tenantId }).sort({ createdAt: 1 });
  const itemIds = items.map((item) => item._id);
  const measurementIds = items.map((item) => item.measurementId);

  const [measurements, assignments] = await Promise.all([
    Measurement.find({ _id: { $in: measurementIds }, tenantId }),
    OrderItemAssignment.find({ orderItemId: { $in: itemIds }, tenantId }).sort({
      "workflowStep.sequence": 1,
    }),
  ]);
  const measurementById = Object.fromEntries(measurements.map((m) => [String(m._id), m]));

  const employeeIds = [...new Set(assignments.map((a) => String(a.employeeId)))];
  const employees = employeeIds.length
    ? await Employee.find({ _id: { $in: employeeIds }, tenantId }).select("name")
    : [];
  const employeeNameById = Object.fromEntries(employees.map((e) => [String(e._id), e.name]));

  const detailedItems = items.map((item) => ({
    _id: item._id,
    garmentType: item.garmentType,
    productTypeId: item.productTypeId,
    selectedOptions: item.selectedOptions,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.unitPrice * item.quantity,
    instructions: item.instructions,
    status: item.status,
    measurement: measurementById[String(item.measurementId)] || null,
    assignedEmployees: assignments
      .filter((a) => String(a.orderItemId) === String(item._id))
      .map((a) => ({
        _id: a._id,
        employeeId: a.employeeId,
        employeeName: employeeNameById[String(a.employeeId)] || null,
        workflowStep: a.workflowStep,
        status: a.status,
        assignedAt: a.assignedAt,
        completedAt: a.completedAt,
      })),
  }));

  const payments = await getPaymentHistory(tenantId, orderId);
  const totalPaid = sumPayments(payments);

  return {
    order,
    customer,
    items: detailedItems,
    paymentSummary: {
      totalPaid,
      remainingBalance: calculateRemainingBalance(order.total, totalPaid),
      paymentStatus: order.paymentStatus,
    },
  };
};

export { computeTotal, generateOrderNumber, VALID_PRODUCTION_STATUSES };
