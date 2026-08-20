import mongoose from "mongoose";
import Order from "../Models/Order.js";
import OrderItem from "../Models/OrderItem.js";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import Payment from "../Models/Payment.js";
import Customer from "../Models/Customer.js";
import Measurement from "../Models/Measurement.js";
import Employee from "../Models/Employee.js";
import Inventory from "../Models/Inventory.js";
import InventoryTransaction from "../Models/InventoryTransaction.js";
import AppError from "../utils/AppError.js";
import { getNextSequence } from "../utils/counter.js";
import {
  calculatePaymentStatus,
  calculateRemainingBalance,
  getPaymentHistory,
} from "./PaymentService.js";
import { validateStock, deductInventory, restoreInventory } from "./InventoryService.js";

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

// Attaches an `assignedEmployees` summary ([{employeeId, employeeName,
// role}]) to each of the given orders — one batched query across every
// OrderItem/OrderItemAssignment for the whole list, not one per order, so
// this stays cheap regardless of how many orders are passed in. Shared by
// listOrders (Orders list page) and DashboardService.getTenantOwnerStats
// (Owner Dashboard's Recent Orders), so both read the exact same "who's
// assigned" data and can never drift out of sync with each other.
export const attachAssignedEmployees = async (tenantId, orders) => {
  if (orders.length === 0) return orders;

  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({ orderId: { $in: orderIds }, tenantId }).select(
    "orderId",
  );
  const orderIdByItemId = new Map(items.map((i) => [String(i._id), String(i.orderId)]));

  const itemIds = items.map((i) => i._id);
  const assignments = itemIds.length
    ? await OrderItemAssignment.find({
        orderItemId: { $in: itemIds },
        tenantId,
        status: { $ne: "reassigned" },
      }).select("orderItemId employeeId workflowStep")
    : [];
  const employeeIds = [...new Set(assignments.map((a) => String(a.employeeId)))];
  const employees = employeeIds.length
    ? await Employee.find({ _id: { $in: employeeIds }, tenantId }).select("name")
    : [];
  const employeeNameById = Object.fromEntries(employees.map((e) => [String(e._id), e.name]));

  const assignedEmployeesByOrderId = new Map();
  for (const a of assignments) {
    const orderId = orderIdByItemId.get(String(a.orderItemId));
    if (!orderId) continue;
    if (!assignedEmployeesByOrderId.has(orderId)) assignedEmployeesByOrderId.set(orderId, []);
    assignedEmployeesByOrderId.get(orderId).push({
      employeeId: a.employeeId,
      employeeName: employeeNameById[String(a.employeeId)] || null,
      role: a.workflowStep?.step,
    });
  }

  return orders.map((order) => ({
    ...order,
    assignedEmployees: assignedEmployeesByOrderId.get(String(order._id)) || [],
  }));
};

// Each order comes back with a lightweight `items` summary (just garment
// names) for the Orders list page's "Ordered Items" column — one extra
// batched query for every OrderItem across the whole result page, not one
// query per order, so this stays cheap regardless of how many orders match.
export const listOrders = async (tenantId, filters = {}) => {
  const query = { tenantId };
  if (filters.productionStatus) query.productionStatus = filters.productionStatus;
  if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
  if (filters.customerId) query.customerId = filters.customerId;

  const orders = await Order.find(query).sort({ createdAt: -1 }).lean();
  if (orders.length === 0) return orders;

  const orderIds = orders.map((o) => o._id);
  const items = await OrderItem.find({ orderId: { $in: orderIds }, tenantId })
    .select("orderId garmentType")
    .sort({ createdAt: 1 });

  const itemsByOrderId = new Map();
  for (const item of items) {
    const key = String(item.orderId);
    if (!itemsByOrderId.has(key)) itemsByOrderId.set(key, []);
    itemsByOrderId.get(key).push({ _id: item._id, garmentType: item.garmentType });
  }

  const ordersWithItems = orders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(String(order._id)) || [],
  }));

  return attachAssignedEmployees(tenantId, ordersWithItems);
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

  // Cancelling an order that was already confirmed (fabric deducted) but
  // whose production had not yet started must give the fabric back.
  // Cancelling after production has started is still allowed — it just
  // skips the restore, since the fabric may already be cut/consumed.
  const needsInventoryRestore =
    productionStatus === "cancelled" &&
    order.productionStatus === "pending" &&
    !!order.confirmedAt;

  if (needsInventoryRestore) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      if (deliveryDate !== undefined) order.deliveryDate = deliveryDate;
      if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;
      order.productionStatus = productionStatus;
      if (notes !== undefined) order.notes = notes;
      order.updatedBy = userId;
      await order.save({ session });

      const items = await OrderItem.find({
        orderId: id,
        tenantId,
        $or: [{ fabricId: { $ne: null } }, { "materials.0": { $exists: true } }],
      }).session(session);
      const customer = await Customer.findOne({ _id: order.customerId, tenantId }).session(
        session,
      );
      await restoreInventory(tenantId, items, id, userId, session, {
        orderNumber: order.orderNumber,
        customerName: customer?.name || null,
      });

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } else {
    if (deliveryDate !== undefined) order.deliveryDate = deliveryDate;
    if (paymentStatus !== undefined) order.paymentStatus = paymentStatus;
    if (productionStatus !== undefined) order.productionStatus = productionStatus;
    if (notes !== undefined) order.notes = notes;
    order.updatedBy = userId;
    await order.save();
  }

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

// "Confirm Order" — the point at which fabric is actually deducted from
// Inventory. Validates every fabric-tracked item has enough stock first
// (all-or-nothing: a single short fabric blocks the whole confirmation),
// then deducts and writes an InventoryTransaction per item, atomically.
export const confirmOrder = async (tenantId, orderId, userId) => {
  const order = await Order.findOne({ _id: orderId, tenantId });
  if (!order) throw new AppError("Order not found", 404);
  if (["completed", "delivered", "cancelled"].includes(order.productionStatus)) {
    throw new AppError(
      `Order is already ${order.productionStatus} and cannot be confirmed`,
      409,
    );
  }
  if (order.confirmedAt) {
    throw new AppError("Order has already been confirmed", 409);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Items with only materials (no fabricId) still need to be considered —
    // validateStock/deductInventory already skip whichever half (fabric or
    // materials) an item doesn't use, see InventoryService.itemConsumptions.
    const items = await OrderItem.find({
      orderId,
      tenantId,
      status: { $ne: "cancelled" },
      $or: [{ fabricId: { $ne: null } }, { "materials.0": { $exists: true } }],
    }).session(session);

    if (items.length) {
      await validateStock(tenantId, items, session);
      const customer = await Customer.findOne({ _id: order.customerId, tenantId }).session(
        session,
      );
      await deductInventory(tenantId, items, orderId, userId, session, {
        orderNumber: order.orderNumber,
        customerName: customer?.name || null,
      });
    }

    order.confirmedAt = new Date();
    order.updatedBy = userId;
    await order.save({ session });

    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const deleteOrder = async (tenantId, id, userId) => {
  const order = await Order.findOne({ _id: id, tenantId });
  if (!order) throw new AppError("Order not found", 404);

  // Deleting an order cascades to its items, their workflow assignments, and
  // its payments — four collections, so this must be one atomic transaction.
  // A confirmed order has already had its fabric deducted; deleting it must
  // give that stock back first, same as cancelling would (see updateOrder's
  // needsInventoryRestore above) — otherwise fabric vanishes from the ledger
  // with no order left to explain where it went.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const items = await OrderItem.find({ orderId: id, tenantId }).session(session);
    const itemIds = items.map((item) => item._id);

    // confirmedAt is never cleared by a cancel (see updateOrder), so a
    // confirmed order that was already cancelled-and-restored still looks
    // "confirmed" here — restoring again would double-credit stock. A prior
    // Return transaction is proof the restore already happened.
    if (order.confirmedAt) {
      const alreadyRestored = await InventoryTransaction.exists({
        tenantId,
        orderId: id,
        transactionType: "Return",
      }).session(session);

      const fabricItems = items.filter((item) => item.fabricId || item.materials?.length);
      if (!alreadyRestored && fabricItems.length) {
        const customer = await Customer.findOne({ _id: order.customerId, tenantId }).session(
          session,
        );
        await restoreInventory(tenantId, fabricItems, id, userId, session, {
          orderNumber: order.orderNumber,
          customerName: customer?.name || null,
          remarks: "Restored — order deleted",
        });
      }
    }

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
      measurementId: item.measurementId,
      fabricId: item.fabricId,
      requiredFabricLength: item.requiredFabricLength,
      fabricUnit: item.fabricUnit,
      materials: item.materials,
    })),
  };
};

// Attaches the actual Measurement document and a display-friendly fabric
// summary ({ fabricName, color }) to each already-billed item — shared by
// getCheckout and getOrderDetails so a garment's fabric/measurement always
// reads the same way wherever it's shown (Checkout page, Order History tab).
const attachMeasurementAndFabric = async (tenantId, items) => {
  const measurementIds = items.map((i) => i.measurementId).filter(Boolean);
  const fabricIds = items.map((i) => i.fabricId).filter(Boolean);

  const [measurements, fabrics] = await Promise.all([
    measurementIds.length
      ? Measurement.find({ _id: { $in: measurementIds }, tenantId })
      : [],
    fabricIds.length ? Inventory.find({ _id: { $in: fabricIds }, tenantId }) : [],
  ]);
  const measurementById = Object.fromEntries(measurements.map((m) => [String(m._id), m]));
  const fabricById = Object.fromEntries(fabrics.map((f) => [String(f._id), f]));

  return items.map((item) => ({
    ...item,
    measurement: item.measurementId ? measurementById[String(item.measurementId)] || null : null,
    fabric: item.fabricId
      ? {
          _id: item.fabricId,
          fabricName: fabricById[String(item.fabricId)]?.fabricName || null,
          color: fabricById[String(item.fabricId)]?.color || null,
        }
      : null,
  }));
};

// Full checkout view shown right after an order is created, before any
// payment exists — customer + itemized bill + totals in one call so the
// Checkout page doesn't need three separate round trips.
export const getCheckout = async (tenantId, orderId) => {
  const { order, items } = await getBill(tenantId, orderId);
  const customer = await Customer.findOne({ _id: order.customerId, tenantId, isDeleted: false });
  if (!customer) throw new AppError("Customer not found for this tenant", 404);

  const enrichedItems = await attachMeasurementAndFabric(tenantId, items);

  const payments = await getPaymentHistory(tenantId, orderId);
  const totalPaid = sumPayments(payments);

  return {
    order,
    customer,
    items: enrichedItems,
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
  const fabricIds = items.map((item) => item.fabricId).filter(Boolean);
  const materialIds = items.flatMap((item) => item.materials.map((m) => m.inventoryId));
  const inventoryIds = [...new Set([...fabricIds, ...materialIds].map(String))];

  const [measurements, assignments, inventoryItems, inventoryTransactions] = await Promise.all([
    Measurement.find({ _id: { $in: measurementIds }, tenantId }),
    OrderItemAssignment.find({ orderItemId: { $in: itemIds }, tenantId }).sort({
      "workflowStep.sequence": 1,
    }),
    inventoryIds.length ? Inventory.find({ _id: { $in: inventoryIds }, tenantId }) : [],
    // The deduction record per item, if the order has been confirmed — lets
    // Order Details show exactly which ledger entry consumed this item's
    // fabric (see inventory/View.jsx for the other side of that same row).
    InventoryTransaction.find({
      tenantId,
      orderItemId: { $in: itemIds },
      transactionType: "Order Consumption",
    }),
  ]);
  const measurementById = Object.fromEntries(measurements.map((m) => [String(m._id), m]));
  const fabricById = Object.fromEntries(inventoryItems.map((f) => [String(f._id), f]));
  // Grouped, not a single value per item — an item's fabric AND each of its
  // materials[] each write their own "Order Consumption" row (see
  // InventoryService.deductInventory), so more than one can exist per item.
  const inventoryTransactionsByItemId = new Map();
  for (const t of inventoryTransactions) {
    const key = String(t.orderItemId);
    if (!inventoryTransactionsByItemId.has(key)) inventoryTransactionsByItemId.set(key, []);
    inventoryTransactionsByItemId.get(key).push(t);
  }

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
    fabricId: item.fabricId,
    requiredFabricLength: item.requiredFabricLength,
    fabricUnit: item.fabricUnit,
    fabric: item.fabricId
      ? {
          _id: item.fabricId,
          fabricName: fabricById[String(item.fabricId)]?.fabricName || null,
          color: fabricById[String(item.fabricId)]?.color || null,
        }
      : null,
    materials: item.materials.map((m) => ({
      inventoryId: m.inventoryId,
      quantity: m.quantity,
      unit: m.unit,
      fabricName: fabricById[String(m.inventoryId)]?.fabricName || null,
    })),
    // One entry per inventory item this OrderItem actually consumed (fabric
    // and/or each material), so Order Details can show exactly which ledger
    // row backs each line — not just the first one.
    inventoryTransactions: (inventoryTransactionsByItemId.get(String(item._id)) || []).map(
      (t) => ({
        _id: t._id,
        inventoryId: t.inventoryId,
        quantity: t.quantity,
        previousStock: t.previousStock,
        newStock: t.newStock,
        createdAt: t.createdAt,
      }),
    ),
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
