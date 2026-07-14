import mongoose from "mongoose";
import OrderItem from "../Models/OrderItem.js";
import Order from "../Models/Order.js";
import ProductType from "../Models/ProductType.js";
import Measurement from "../Models/Measurement.js";
import Inventory from "../Models/Inventory.js";
import AppError from "../utils/AppError.js";
import { recalculateOrderTotals } from "./OrderService.js";

const VALID_STATUSES = ["pending", "in_progress", "completed", "cancelled"];

const assertOrderIsEditable = (order) => {
  if (!order) throw new AppError("Order not found", 404);
  if (["completed", "delivered", "cancelled"].includes(order.productionStatus)) {
    throw new AppError(
      `Order is already ${order.productionStatus} — items can no longer be modified`,
      409,
    );
  }
};

const validateSelectedOptions = (selectedOptions) => {
  if (selectedOptions === undefined) return;
  if (!Array.isArray(selectedOptions)) {
    throw new AppError("selectedOptions must be an array", 400);
  }
  for (const option of selectedOptions) {
    if (!option.name || !option.value) {
      throw new AppError("Each selected option requires name and value", 400);
    }
  }
};

export const listOrderItems = async (tenantId, orderId) => {
  const filter = { tenantId };
  if (orderId) filter.orderId = orderId;
  return OrderItem.find(filter).sort({ createdAt: -1 });
};

export const getOrderItemById = async (tenantId, id) => {
  const item = await OrderItem.findOne({ _id: id, tenantId });
  if (!item) throw new AppError("Order item not found", 404);
  return item;
};

// Fabric is optional. Validated against Inventory here (tenant-scoped, not
// deleted) but never deducted here — stock is only touched when the Order is
// confirmed (see OrderService.confirmOrder). fabricUnit is a snapshot of
// Inventory.unit at pick time so a later unit change can't alter this item.
export const resolveFabricSnapshot = async (tenantId, fabricId, requiredFabricLength, session) => {
  if (!fabricId) return { fabricId: null, requiredFabricLength: null, fabricUnit: null };
  if (!requiredFabricLength || requiredFabricLength <= 0) {
    throw new AppError("requiredFabricLength must be greater than 0 when fabricId is set", 400);
  }

  const inventory = await Inventory.findOne({
    _id: fabricId,
    tenantId,
    isDeleted: false,
  }).session(session);
  if (!inventory) throw new AppError("Inventory item not found for this tenant", 404);

  return { fabricId, requiredFabricLength, fabricUnit: inventory.unit };
};

export const createOrderItem = async (tenantId, data, userId) => {
  const {
    orderId,
    productTypeId,
    measurementId,
    selectedOptions,
    quantity = 1,
    instructions,
    fabricId,
    requiredFabricLength,
  } = data;

  if (!orderId || !productTypeId || !measurementId) {
    throw new AppError("orderId, productTypeId, and measurementId are required", 400);
  }
  if (quantity < 1) {
    throw new AppError("quantity must be at least 1", 400);
  }
  validateSelectedOptions(selectedOptions);

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const order = await Order.findOne({ _id: orderId, tenantId }).session(session);
    assertOrderIsEditable(order);

    const productType = await ProductType.findOne({
      _id: productTypeId,
      tenantId,
      isDeleted: false,
    }).session(session);
    if (!productType) throw new AppError("Product type not found for this tenant", 404);

    const measurement = await Measurement.findOne({
      _id: measurementId,
      tenantId,
    }).session(session);
    if (!measurement) throw new AppError("Measurement not found for this tenant", 404);

    const fabricSnapshot = await resolveFabricSnapshot(
      tenantId,
      fabricId,
      requiredFabricLength,
      session,
    );

    // SNAPSHOT — copy the price and name now; ProductType changes later must not affect this item
    const [item] = await OrderItem.create(
      [
        {
          tenantId,
          orderId,
          productTypeId,
          garmentType: productType.name,
          measurementId,
          selectedOptions,
          quantity,
          unitPrice: productType.basePrice,
          instructions,
          ...fabricSnapshot,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    // Lock the measurement so it can never be edited once attached to an order
    measurement.lockedForOrder = true;
    await measurement.save({ session });

    await recalculateOrderTotals(tenantId, orderId, session);

    await session.commitTransaction();
    return item;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const updateOrderItem = async (tenantId, id, data, userId) => {
  const { selectedOptions, quantity, instructions, status, fabricId, requiredFabricLength } =
    data;

  if (quantity !== undefined && quantity < 1) {
    throw new AppError("quantity must be at least 1", 400);
  }
  validateSelectedOptions(selectedOptions);
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const item = await OrderItem.findOne({ _id: id, tenantId }).session(session);
    if (!item) throw new AppError("Order item not found", 404);

    const order = await Order.findOne({ _id: item.orderId, tenantId }).session(session);
    assertOrderIsEditable(order);

    // NOTE: unitPrice is never editable here — it is a snapshot taken at creation time
    if (selectedOptions !== undefined) item.selectedOptions = selectedOptions;
    if (quantity !== undefined) item.quantity = quantity;
    if (instructions !== undefined) item.instructions = instructions;
    if (status !== undefined) item.status = status;

    // Fabric can only be changed before the order is confirmed — once
    // confirmed, stock has already been deducted against the original pick.
    if (fabricId !== undefined || requiredFabricLength !== undefined) {
      if (order.confirmedAt) {
        throw new AppError(
          "Order has already been confirmed — fabric selection can no longer be changed",
          409,
        );
      }
      const fabricSnapshot = await resolveFabricSnapshot(
        tenantId,
        fabricId !== undefined ? fabricId : item.fabricId,
        requiredFabricLength !== undefined ? requiredFabricLength : item.requiredFabricLength,
        session,
      );
      item.fabricId = fabricSnapshot.fabricId;
      item.requiredFabricLength = fabricSnapshot.requiredFabricLength;
      item.fabricUnit = fabricSnapshot.fabricUnit;
    }

    item.updatedBy = userId;

    await item.save({ session });
    await recalculateOrderTotals(tenantId, item.orderId, session);

    await session.commitTransaction();
    return item;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const deleteOrderItem = async (tenantId, id) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const item = await OrderItem.findOne({ _id: id, tenantId }).session(session);
    if (!item) throw new AppError("Order item not found", 404);

    const order = await Order.findOne({ _id: item.orderId, tenantId }).session(session);
    assertOrderIsEditable(order);

    await OrderItem.deleteOne({ _id: id, tenantId }, { session });
    await recalculateOrderTotals(tenantId, item.orderId, session);

    await session.commitTransaction();
    return item;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
