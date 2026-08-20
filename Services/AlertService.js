import Alert from "../Models/Alert.js";
import Inventory from "../Models/Inventory.js";
import Order from "../Models/Order.js";
import Customer from "../Models/Customer.js";
import Payment from "../Models/Payment.js";
import OrderItem from "../Models/OrderItem.js";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";
import { checkLowStock } from "./InventoryService.js";
import { calculateRemainingBalance } from "./PaymentService.js";

const ACTIVE_DELIVERY_STATUSES = ["pending", "in_progress"]; // never completed/delivered/cancelled
const sumPayments = (payments) =>
  payments.reduce((sum, p) => sum + (p.paymentType === "refund" ? -p.amount : p.amount), 0);

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// Upserts one Alert row per still-true condition, keyed by the natural
// (tenantId, type, relatedEntityType, relatedEntityId) index — recomputing
// the same live condition twice updates the same row instead of creating a
// duplicate. Any existing alert whose condition no longer holds (restocked,
// order delivered/cancelled, payment settled) is deleted, which is how an
// alert "resolves". Runs lazily on every GET /alert rather than on a
// schedule — always fresh, no background worker needed.
export const generateAlerts = async (tenantId) => {
  await Promise.all([
    generateLowInventoryAlerts(tenantId),
    generateDeliveryAlerts(tenantId),
    generatePaymentAlerts(tenantId),
    generateUnassignedOrderAlerts(tenantId),
  ]);
};

const generateLowInventoryAlerts = async (tenantId) => {
  const items = await Inventory.find({ tenantId, isDeleted: false, isActive: true });
  const lowStockIds = new Set();

  for (const item of items) {
    if (!checkLowStock(item)) continue;
    lowStockIds.add(String(item._id));

    await Alert.findOneAndUpdate(
      { tenantId, type: "inventory", relatedEntityType: "Inventory", relatedEntityId: item._id },
      {
        $set: {
          title: "Low Inventory",
          message: `${item.fabricName} has only ${item.availableQuantity} ${item.unit} remaining (minimum ${item.minimumStockLevel} ${item.unit}).`,
          priority: item.availableQuantity <= 0 ? "high" : "medium",
        },
        $setOnInsert: { tenantId, type: "inventory", relatedEntityType: "Inventory", relatedEntityId: item._id, isRead: false },
      },
      { upsert: true },
    );
  }

  // Resolve: any existing inventory alert for an item that's no longer low
  // (restocked, deactivated, or deleted) gets removed.
  const existing = await Alert.find({ tenantId, type: "inventory" }).select("relatedEntityId");
  const staleIds = existing
    .map((a) => String(a.relatedEntityId))
    .filter((id) => !lowStockIds.has(id));
  if (staleIds.length) {
    await Alert.deleteMany({ tenantId, type: "inventory", relatedEntityId: { $in: staleIds } });
  }
};

const generateDeliveryAlerts = async (tenantId) => {
  const tomorrowStart = addDays(startOfDay(new Date()), 1);
  const tomorrowEnd = addDays(tomorrowStart, 1);

  const orders = await Order.find({
    tenantId,
    productionStatus: { $in: ACTIVE_DELIVERY_STATUSES },
    deliveryDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
  });
  const dueTomorrowIds = new Set();

  if (orders.length) {
    const customers = await Customer.find({
      _id: { $in: orders.map((o) => o.customerId) },
      tenantId,
    }).select("name");
    const customerNameById = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));

    for (const order of orders) {
      dueTomorrowIds.add(String(order._id));
      await Alert.findOneAndUpdate(
        { tenantId, type: "delivery", relatedEntityType: "Order", relatedEntityId: order._id },
        {
          $set: {
            title: "Delivery Tomorrow",
            message: `Order #${order.orderNumber} for ${customerNameById[String(order.customerId)] || "a customer"} is due for delivery tomorrow.`,
            priority: "high",
          },
          $setOnInsert: { tenantId, type: "delivery", relatedEntityType: "Order", relatedEntityId: order._id, isRead: false },
        },
        { upsert: true },
      );
    }
  }

  const existing = await Alert.find({ tenantId, type: "delivery" }).select("relatedEntityId");
  const staleIds = existing
    .map((a) => String(a.relatedEntityId))
    .filter((id) => !dueTomorrowIds.has(id));
  if (staleIds.length) {
    await Alert.deleteMany({ tenantId, type: "delivery", relatedEntityId: { $in: staleIds } });
  }
};

const generatePaymentAlerts = async (tenantId) => {
  // Cancelled orders are excluded — no one is owed a payment on an order
  // that never happened. Delivered orders are intentionally still included
  // (a final/COD balance can still be outstanding after delivery).
  const orders = await Order.find({ tenantId, productionStatus: { $ne: "cancelled" } });
  const owingIds = new Set();

  if (orders.length) {
    const payments = await Payment.find({ tenantId, orderId: { $in: orders.map((o) => o._id) } });
    const paymentsByOrderId = new Map();
    for (const p of payments) {
      const key = String(p.orderId);
      if (!paymentsByOrderId.has(key)) paymentsByOrderId.set(key, []);
      paymentsByOrderId.get(key).push(p);
    }

    const customers = await Customer.find({
      _id: { $in: orders.map((o) => o.customerId) },
      tenantId,
    }).select("name");
    const customerNameById = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));

    for (const order of orders) {
      const totalPaid = sumPayments(paymentsByOrderId.get(String(order._id)) || []);
      const remaining = calculateRemainingBalance(order.total, totalPaid);
      if (remaining <= 0) continue;
      owingIds.add(String(order._id));

      await Alert.findOneAndUpdate(
        { tenantId, type: "payment", relatedEntityType: "Order", relatedEntityId: order._id },
        {
          $set: {
            title: "Payment Remaining",
            message: `Payment of Rs. ${remaining.toLocaleString()} remains for Order #${order.orderNumber} (${customerNameById[String(order.customerId)] || "customer"}).`,
            priority: remaining >= order.total ? "high" : "medium",
          },
          $setOnInsert: { tenantId, type: "payment", relatedEntityType: "Order", relatedEntityId: order._id, isRead: false },
        },
        { upsert: true },
      );
    }
  }

  const existing = await Alert.find({ tenantId, type: "payment" }).select("relatedEntityId");
  const staleIds = existing
    .map((a) => String(a.relatedEntityId))
    .filter((id) => !owingIds.has(id));
  if (staleIds.length) {
    await Alert.deleteMany({ tenantId, type: "payment", relatedEntityId: { $in: staleIds } });
  }
};

// An order with nobody assigned can't actually go into production — the
// owner needs to know it's stuck. Covers both a brand-new pending order
// (the normal starting state, before anyone's had a chance to staff it) and
// the less obvious case of an in_progress order that had every employee
// removed via the Assign Employees modal (status intentionally doesn't
// revert to pending when that happens — see
// OrderItemAssignmentService.maybeAdvanceToInProgress — so this alert is the
// only place that gap becomes visible again).
const generateUnassignedOrderAlerts = async (tenantId) => {
  const orders = await Order.find({
    tenantId,
    productionStatus: { $in: ACTIVE_DELIVERY_STATUSES },
  });
  const unassignedIds = new Set();

  if (orders.length) {
    const orderIds = orders.map((o) => o._id);
    const items = await OrderItem.find({ tenantId, orderId: { $in: orderIds } }).select(
      "_id orderId",
    );
    const orderIdByItemId = new Map(items.map((i) => [String(i._id), String(i.orderId)]));
    const itemIds = items.map((i) => i._id);
    const assignments = itemIds.length
      ? await OrderItemAssignment.find({
          tenantId,
          orderItemId: { $in: itemIds },
          status: { $ne: "reassigned" },
        }).select("orderItemId")
      : [];
    const assignedOrderIds = new Set(
      assignments.map((a) => orderIdByItemId.get(String(a.orderItemId))).filter(Boolean),
    );

    const customers = await Customer.find({
      _id: { $in: orders.map((o) => o.customerId) },
      tenantId,
    }).select("name");
    const customerNameById = Object.fromEntries(customers.map((c) => [String(c._id), c.name]));

    for (const order of orders) {
      if (assignedOrderIds.has(String(order._id))) continue;
      unassignedIds.add(String(order._id));

      await Alert.findOneAndUpdate(
        { tenantId, type: "assignment", relatedEntityType: "Order", relatedEntityId: order._id },
        {
          $set: {
            title: "Unassigned Order",
            message: `Order #${order.orderNumber} for ${customerNameById[String(order.customerId)] || "a customer"} has no employee assigned.`,
            priority: order.productionStatus === "in_progress" ? "high" : "medium",
          },
          $setOnInsert: { tenantId, type: "assignment", relatedEntityType: "Order", relatedEntityId: order._id, isRead: false },
        },
        { upsert: true },
      );
    }
  }

  const existing = await Alert.find({ tenantId, type: "assignment" }).select("relatedEntityId");
  const staleIds = existing
    .map((a) => String(a.relatedEntityId))
    .filter((id) => !unassignedIds.has(id));
  if (staleIds.length) {
    await Alert.deleteMany({ tenantId, type: "assignment", relatedEntityId: { $in: staleIds } });
  }
};

// Owner/tenant_admin see every alert. An employee only sees a category if
// they hold the matching existing permission (inventory.view, payments.view)
// — reusing the existing Role permission grid rather than inventing an
// "alerts" module — and, for delivery specifically, only for orders they are
// actually assigned to (see claude.md: "employees involved with the relevant
// order can see it"), narrower than a blanket orders.view. Permissions are
// re-resolved from the Employee's Role here (same as permissionMiddleware's
// authorize()) rather than trusted from the JWT — the token only carries
// role/tenantId/employeeId, never the live permission grid.
const filterForEmployee = async (tenantId, employeeId, alerts) => {
  if (!employeeId) return [];
  const employee = await Employee.findOne({
    _id: employeeId,
    tenantId,
    isDeleted: false,
  }).populate("roleId");
  const permissions = employee?.roleId?.permissions;

  const canSee = {
    inventory: permissions?.inventory?.view === true,
    payment: permissions?.payments?.view === true,
    delivery: permissions?.orders?.view === true,
    // Staffing is a management concern — only shown to an employee who could
    // actually act on it (the same permission the Assign Employees action
    // itself requires), not every employee with plain view access.
    assignment: permissions?.orders?.update === true,
  };

  const deliveryAlerts = alerts.filter((a) => a.type === "delivery" && canSee.delivery);
  let assignedOrderIds = new Set();
  if (deliveryAlerts.length && employeeId) {
    const orderIds = deliveryAlerts.map((a) => a.relatedEntityId);
    const items = await OrderItem.find({ tenantId, orderId: { $in: orderIds } }).select(
      "_id orderId",
    );
    const itemIdsByOrder = new Map();
    for (const item of items) {
      const key = String(item.orderId);
      if (!itemIdsByOrder.has(key)) itemIdsByOrder.set(key, []);
      itemIdsByOrder.get(key).push(item._id);
    }
    const allItemIds = items.map((i) => i._id);
    const assignments = allItemIds.length
      ? await OrderItemAssignment.find({ tenantId, employeeId, orderItemId: { $in: allItemIds } }).select(
          "orderItemId",
        )
      : [];
    const assignedItemIds = new Set(assignments.map((a) => String(a.orderItemId)));
    for (const [orderId, itemIds] of itemIdsByOrder) {
      if (itemIds.some((id) => assignedItemIds.has(String(id)))) assignedOrderIds.add(orderId);
    }
  }

  return alerts.filter((a) => {
    if (a.type === "inventory") return canSee.inventory;
    if (a.type === "payment") return canSee.payment;
    if (a.type === "delivery") return canSee.delivery && assignedOrderIds.has(String(a.relatedEntityId));
    if (a.type === "assignment") return canSee.assignment;
    return false;
  });
};

// `user` is the authenticated req.user — role/tenantId/employeeId come from
// the verified JWT, never from a query param, so tenant isolation and
// visibility can't be spoofed by the caller.
export const listAlerts = async (user, filters = {}) => {
  const tenantId = user.tenantId;
  await generateAlerts(tenantId);

  const query = { tenantId };
  if (filters.type) query.type = filters.type;
  if (filters.isRead !== undefined) query.isRead = filters.isRead === "true" || filters.isRead === true;

  let alerts = await Alert.find(query).sort({ isRead: 1, priority: -1, createdAt: -1 });

  if (user.role !== "super_admin" && user.role !== "tenant_admin") {
    alerts = await filterForEmployee(tenantId, user.employeeId, alerts);
  }

  return alerts;
};

export const getUnreadCount = async (user) => {
  const alerts = await listAlerts(user, { isRead: "false" });
  return alerts.length;
};

export const markAsRead = async (tenantId, id) => {
  const alert = await Alert.findOneAndUpdate(
    { _id: id, tenantId },
    { isRead: true, readAt: new Date() },
    { new: true },
  );
  if (!alert) throw new AppError("Alert not found", 404);
  return alert;
};

// `isRead` is a single shared flag per alert (not per-user) — these are
// tenant-wide business facts (low stock, a due date, an owed balance), not
// personal messages, so a shared "seen" state is the simpler and correct
// model here rather than a separate per-user read-receipt collection.
// "Mark all" is still scoped to what THIS caller can currently see, though —
// an employee's bulk action must never touch alerts outside their own
// filtered view, even though the flag itself is shared once set.
export const markAllAsRead = async (user) => {
  if (user.role === "super_admin" || user.role === "tenant_admin") {
    await Alert.updateMany({ tenantId: user.tenantId, isRead: false }, { isRead: true, readAt: new Date() });
    return;
  }
  const visible = await listAlerts(user, { isRead: "false" });
  const ids = visible.map((a) => a._id);
  if (ids.length) {
    await Alert.updateMany({ _id: { $in: ids } }, { isRead: true, readAt: new Date() });
  }
};
