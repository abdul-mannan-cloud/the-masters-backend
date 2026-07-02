import mongoose from "mongoose";
import Order from "../Models/Order.js";
import OrderItem from "../Models/OrderItem.js";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import Payment from "../Models/Payment.js";
import Customer from "../Models/Customer.js";
import Settings from "../Models/Settings.js";
import AppError from "../utils/AppError.js";

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

const generateOrderNumber = async (tenantId) => {
  const settings = await Settings.findOne({ tenantId });
  const prefix = settings?.invoice?.orderNumberPrefix || "ORD";
  const count = await Order.countDocuments({ tenantId });
  const sequence = String(count + 1).padStart(4, "0");
  return `${prefix}-${sequence}`;
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

  const orderNumber = await generateOrderNumber(tenantId);

  // Order starts empty — subtotal/total are recalculated as OrderItems are
  // added via OrderItemService. See claude.md: "totals are snapshots".
  return Order.create({
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
  });
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

  if (discount !== undefined) order.discount = discount;
  if (discountType !== undefined) order.discountType = discountType;
  if (discount !== undefined || discountType !== undefined) {
    order.total = computeTotal(order.subtotal, order.discount, order.discountType);
  }

  order.updatedBy = userId;
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

export { computeTotal, VALID_PRODUCTION_STATUSES };
