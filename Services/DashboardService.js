import mongoose from "mongoose";
import Tenant from "../Models/Tenant.js";
import User from "../Models/User.js";
import Employee from "../Models/Employee.js";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
import OrderItem from "../Models/OrderItem.js";
import Payment from "../Models/Payment.js";
import OrderItemAssignment from "../Models/OrderItemAssignment.js";

export const getSuperAdminStats = async () => {
  const [
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalUsers,
    totalEmployees,
    totalCustomers,
    totalOrders,
    recentTenants,
  ] = await Promise.all([
    Tenant.countDocuments({ isDeleted: false }),
    Tenant.countDocuments({ isDeleted: false, status: "active" }),
    Tenant.countDocuments({ isDeleted: false, status: "suspended" }),
    User.countDocuments({}),
    Employee.countDocuments({ isDeleted: false }),
    Customer.countDocuments({ isDeleted: false }),
    Order.countDocuments({}),
    Tenant.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(10),
  ]);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalUsers,
    totalEmployees,
    totalCustomers,
    totalOrders,
    recentTenants,
  };
};

export const getTenantOwnerStats = async (tenantId) => {
  const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalEmployees,
    totalCustomers,
    activeOrders,
    completedOrders,
    pendingOrders,
    revenueResult,
    recentOrders,
  ] = await Promise.all([
    Employee.countDocuments({ tenantId, isDeleted: false }),
    Customer.countDocuments({ tenantId, isDeleted: false }),
    Order.countDocuments({ tenantId, productionStatus: { $in: ["pending", "in_progress"] } }),
    Order.countDocuments({ tenantId, productionStatus: { $in: ["completed", "delivered"] } }),
    Order.countDocuments({ tenantId, productionStatus: "pending" }),
    Payment.aggregate([
      { $match: { tenantId: tenantObjectId, paymentDate: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Order.find({ tenantId }).sort({ createdAt: -1 }).limit(10).populate("customerId", "name phone"),
  ]);

  return {
    totalEmployees,
    totalCustomers,
    activeOrders,
    completedOrders,
    pendingOrders,
    monthlyRevenue: revenueResult[0]?.total ?? 0,
    recentOrders,
  };
};

export const getEmployeeStats = async (tenantId, employeeId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [pendingCount, inProgressCount, completedCount, todaysWork, assignedWork] =
    await Promise.all([
      OrderItemAssignment.countDocuments({ tenantId, employeeId, status: "pending" }),
      OrderItemAssignment.countDocuments({ tenantId, employeeId, status: "in_progress" }),
      OrderItemAssignment.countDocuments({ tenantId, employeeId, status: "completed" }),
      OrderItemAssignment.find({
        tenantId,
        employeeId,
        assignedAt: { $gte: startOfDay, $lte: endOfDay },
      }).sort({ assignedAt: -1 }),
      getMyAssignedWork(tenantId, employeeId),
    ]);

  return {
    pendingCount,
    inProgressCount,
    completedCount,
    todaysWork,
    assignedWork,
  };
};

// "My Assigned Work" — every OrderItemAssignment for this employee, enriched
// with exactly what they need to do the job and nothing more: which order,
// which customer, which garment, their own role on it, the order's overall
// status, and the delivery date. Deliberately does NOT return the customer's
// phone/address or the order's full payment history — an employee doing
// production work has no need for that, even though they're allowed to see
// the order itself (see claude.md: "do not expose sensitive information
// unnecessarily"). Determined entirely from `employeeId` off the verified
// JWT — never trusts a client-supplied id, so one employee can never pull
// another's work queue.
export const getMyAssignedWork = async (tenantId, employeeId) => {
  const assignments = await OrderItemAssignment.find({ tenantId, employeeId })
    .sort({ status: 1, assignedAt: -1 })
    .lean();
  if (assignments.length === 0) return [];

  const itemIds = assignments.map((a) => a.orderItemId);
  const items = await OrderItem.find({ _id: { $in: itemIds }, tenantId }).lean();
  const itemById = new Map(items.map((i) => [String(i._id), i]));

  const orderIds = [...new Set(items.map((i) => String(i.orderId)))];
  const orders = await Order.find({ _id: { $in: orderIds }, tenantId }).lean();
  const orderById = new Map(orders.map((o) => [String(o._id), o]));

  const customerIds = [...new Set(orders.map((o) => String(o.customerId)))];
  const customers = customerIds.length
    ? await Customer.find({ _id: { $in: customerIds }, tenantId }).select("name phone").lean()
    : [];
  const customerById = new Map(customers.map((c) => [String(c._id), c]));

  return assignments
    .map((assignment) => {
      const item = itemById.get(String(assignment.orderItemId));
      if (!item) return null; // orphaned assignment — item since deleted
      const order = orderById.get(String(item.orderId));
      if (!order) return null;
      const customer = customerById.get(String(order.customerId));

      return {
        assignmentId: assignment._id,
        assignmentStatus: assignment.status,
        assignedAt: assignment.assignedAt,
        completedAt: assignment.completedAt,
        workflowStep: assignment.workflowStep,
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.productionStatus,
        deliveryDate: order.deliveryDate,
        customerName: customer?.name || null,
        garmentType: item.garmentType,
        orderItemId: item._id,
      };
    })
    .filter(Boolean);
};
