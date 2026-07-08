import mongoose from "mongoose";
import Tenant from "../Models/Tenant.js";
import User from "../Models/User.js";
import Employee from "../Models/Employee.js";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
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

  const [pendingCount, inProgressCount, completedCount, todaysWork] = await Promise.all([
    OrderItemAssignment.countDocuments({ tenantId, employeeId, status: "pending" }),
    OrderItemAssignment.countDocuments({ tenantId, employeeId, status: "in_progress" }),
    OrderItemAssignment.countDocuments({ tenantId, employeeId, status: "completed" }),
    OrderItemAssignment.find({
      tenantId,
      employeeId,
      assignedAt: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ assignedAt: -1 }),
  ]);

  return {
    pendingCount,
    inProgressCount,
    completedCount,
    todaysWork,
  };
};
