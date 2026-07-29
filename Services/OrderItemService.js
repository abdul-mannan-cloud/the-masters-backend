import mongoose from "mongoose";
import OrderItem from "../Models/OrderItem.js";
import Order from "../Models/Order.js";
import Customer from "../Models/Customer.js";
import ProductType from "../Models/ProductType.js";
import Measurement from "../Models/Measurement.js";
import Inventory from "../Models/Inventory.js";
import AppError from "../utils/AppError.js";
import { recalculateOrderTotals, computeTotal, generateOrderNumber } from "./OrderService.js";
import * as MeasurementService from "./MeasurementService.js";
import { validateStock } from "./InventoryService.js";

const VALID_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
const VALID_DISCOUNT_TYPES = ["fixed", "percentage"];

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

// Fabric is optional. Checked against Inventory here (tenant-scoped, not
// deleted, and — as of this pass — enough availableQuantity for THIS item on
// its own) but never deducted here — stock is only touched when the Order is
// confirmed (see OrderService.confirmOrder). This is a single-item check;
// createOrderWithItems additionally runs an aggregate validateStock pass
// across the whole item list before creating anything, since two items in
// the same request can each look fine alone but overrun the same fabric
// together. fabricUnit is a snapshot of Inventory.unit at pick time so a
// later unit change can't alter this item.
export const resolveFabricSnapshot = async (
  tenantId,
  fabricId,
  requiredFabricLength,
  quantity,
  session,
) => {
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

  const needed = requiredFabricLength * (quantity || 1);
  if (inventory.availableQuantity < needed) {
    throw new AppError(
      `Insufficient inventory for ${inventory.fabricName}: needs ${needed} ${inventory.unit}, only ${inventory.availableQuantity} ${inventory.unit} available`,
      400,
    );
  }

  return { fabricId, requiredFabricLength, fabricUnit: inventory.unit };
};

// Each selected option must name a real option on the ProductType, with a
// value from that option's own list — otherwise a garment could be billed
// for a customization that was never actually offered. Distinct from the
// shape-only validateSelectedOptions above, which doesn't have a ProductType
// to check against yet at the point it runs.
const validateOptionsAgainstProductType = (productType, selectedOptions) => {
  if (!selectedOptions || selectedOptions.length === 0) return;
  for (const { name, value } of selectedOptions) {
    const option = productType.options.find((o) => o.name === name);
    if (!option) {
      throw new AppError(`"${name}" is not a valid option for ${productType.name}`, 400);
    }
    if (!option.values.includes(value)) {
      throw new AppError(`"${value}" is not a valid value for option "${name}"`, 400);
    }
  }
};

// Creates an Order + all of its OrderItems for one customer, inside a
// caller-supplied session. Each item's measurement is resolved one of two
// ways: `measurementIndex` looks it up in `createdMeasurements` (freshly
// created earlier in the same transaction — used when the customer is brand
// new, or when new measurements are being taken as part of this order), or
// `measurementId` looks up an existing, already-on-file Measurement owned by
// this customer (used when reordering the same garment measurement again).
// Both forms may be mixed within the same order.
//
// Shared by CustomerService.createCustomer (new customer, order optional)
// and createOrderForCustomer below (existing customer) — this is the single
// place "build an order from a list of garment picks" is implemented, so the
// two call sites can never drift out of sync with each other.
//
// `canAdjustPrice` gates whether an item's `unitPrice` override (if sent) is
// honored — anyone without it always gets the ProductType's basePrice.
export const createOrderWithItems = async (
  tenantId,
  customer,
  createdMeasurements,
  orderData,
  userId,
  session,
  canAdjustPrice,
) => {
  const { deliveryDate, discount = 0, discountType = "fixed", notes, items } = orderData;

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("order.items must be a non-empty array", 400);
  }
  if (discountType && !VALID_DISCOUNT_TYPES.includes(discountType)) {
    throw new AppError(`Invalid discountType. Must be one of: ${VALID_DISCOUNT_TYPES.join(", ")}`, 400);
  }
  if (discount < 0) {
    throw new AppError("discount cannot be negative", 400);
  }

  // Aggregate stock check across the WHOLE item list before creating
  // anything. resolveFabricSnapshot (below, per item) only checks one item
  // at a time — two items in this same order that each need part of the
  // same fabric can individually look fine but together overrun it, so this
  // aggregate pass (same logic Confirm Order uses) runs first and blocks the
  // entire order if any fabric is short, before the Order document exists.
  await validateStock(
    tenantId,
    items.map((i) => ({
      fabricId: i.fabricId || null,
      requiredFabricLength: i.requiredFabricLength || 0,
      quantity: i.quantity || 1,
    })),
    session,
  );

  const orderNumber = await generateOrderNumber(tenantId, customer, session);
  const [order] = await Order.create(
    [
      {
        tenantId,
        customerId: customer._id,
        orderNumber,
        deliveryDate,
        subtotal: 0,
        discount,
        discountType,
        total: 0,
        notes,
        createdBy: userId,
        updatedBy: userId,
      },
    ],
    { session },
  );

  let subtotal = 0;
  for (const rawItem of items) {
    const {
      measurementIndex,
      measurementId,
      productTypeId,
      selectedOptions,
      quantity = 1,
      instructions,
      unitPrice: requestedUnitPrice,
      fabricId,
      requiredFabricLength,
    } = rawItem;

    let measurement;
    if (measurementIndex !== undefined) {
      measurement = createdMeasurements[measurementIndex];
      if (!measurement) {
        throw new AppError(
          `Order item references an unknown measurement (index ${measurementIndex})`,
          400,
        );
      }
    } else if (measurementId) {
      measurement = await Measurement.findOne({
        _id: measurementId,
        tenantId,
        customerId: customer._id,
      }).session(session);
      if (!measurement) {
        throw new AppError("Measurement not found for this customer", 404);
      }
    } else {
      throw new AppError(
        "Each order item requires either measurementIndex or measurementId",
        400,
      );
    }

    if (!productTypeId) {
      throw new AppError("productTypeId is required for each order item", 400);
    }
    if (quantity < 1) {
      throw new AppError("quantity must be at least 1", 400);
    }

    const productType = await ProductType.findOne({
      _id: productTypeId,
      tenantId,
      isDeleted: false,
    }).session(session);
    if (!productType) throw new AppError("Product type not found for this tenant", 404);

    validateOptionsAgainstProductType(productType, selectedOptions);
    const fabricSnapshot = await resolveFabricSnapshot(
      tenantId,
      fabricId,
      requiredFabricLength,
      quantity,
      session,
    );

    // Default price always comes from the ProductType; an adjusted price is
    // only ever honored if the caller was found permitted (see canAdjustPrice
    // above) — otherwise a client-sent unitPrice is silently ignored.
    let unitPrice = productType.basePrice;
    if (canAdjustPrice && requestedUnitPrice !== undefined) {
      if (requestedUnitPrice < 0) {
        throw new AppError("unitPrice cannot be negative", 400);
      }
      unitPrice = requestedUnitPrice;
    }

    // SNAPSHOT — copy the price/name now; ProductType changes later must not affect this item
    await OrderItem.create(
      [
        {
          tenantId,
          orderId: order._id,
          productTypeId,
          garmentType: productType.name,
          measurementId: measurement._id,
          selectedOptions,
          quantity,
          unitPrice,
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

    subtotal += unitPrice * quantity;
  }

  order.subtotal = subtotal;
  order.total = computeTotal(subtotal, discount, discountType);
  await order.save({ session });

  return order;
};

// Public entry point for placing a new order for an EXISTING customer (the
// "New Order" page) — owns its own transaction, optionally captures fresh
// measurements first (same shape as CustomerService.createCustomer's
// `measurements[]`), then delegates to createOrderWithItems above. This is
// what makes "select products, take measurements, pick fabric, order is
// created automatically" work for a returning customer too, not just at
// registration time.
export const createOrderForCustomer = async (
  tenantId,
  customerId,
  data,
  userId,
  canAdjustPrice = false,
) => {
  const { measurements: measurementsData, ...orderData } = data;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const customer = await Customer.findOne({
      _id: customerId,
      tenantId,
      isDeleted: false,
    }).session(session);
    if (!customer) throw new AppError("Customer not found for this tenant", 404);

    const createdMeasurements = [];
    for (const measurementData of measurementsData || []) {
      const measurement = await MeasurementService.createMeasurement(
        tenantId,
        { ...measurementData, customerId: customer._id },
        userId,
        session,
      );
      createdMeasurements.push(measurement);
    }

    const order = await createOrderWithItems(
      tenantId,
      customer,
      createdMeasurements,
      orderData,
      userId,
      session,
      canAdjustPrice,
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
      quantity,
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
        item.quantity,
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
