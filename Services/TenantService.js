import mongoose from "mongoose";
import Tenant from "../Models/Tenant.js";
import Employee from "../Models/Employee.js";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
import Payment from "../Models/Payment.js";
import AppError from "../utils/AppError.js";
import { seedRolesForTenant } from "../utils/seedDefaultRoles.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLANS = ["free", "basic", "pro", "enterprise"];
const VALID_STATUSES = ["active", "suspended", "cancelled"];

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listTenants = async (filters = {}) => {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.max(parseInt(filters.limit, 10) || 10, 1);

  const query = { isDeleted: false };

  if (filters.search) {
    const pattern = { $regex: escapeRegex(filters.search.trim()), $options: "i" };
    query.$or = [{ businessName: pattern }, { slug: pattern }, { contactEmail: pattern }];
  }
  if (filters.status && VALID_STATUSES.includes(filters.status)) {
    query.status = filters.status;
  }
  if (filters.plan && VALID_PLANS.includes(filters.plan)) {
    query.plan = filters.plan;
  }

  const [data, total] = await Promise.all([
    Tenant.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Tenant.countDocuments(query),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
};

export const getTenantById = async (id) => {
  const tenant = await Tenant.findOne({ _id: id, isDeleted: false });
  if (!tenant) throw new AppError("Tenant not found", 404);
  return tenant;
};

export const createTenant = async (data, userId) => {
  const { businessName, slug, contactEmail, contactPhone, address, plan } =
    data;

  if (!businessName || !slug || !contactEmail) {
    throw new AppError(
      "businessName, slug, and contactEmail are required",
      400,
    );
  }

  if (!EMAIL_REGEX.test(contactEmail)) {
    throw new AppError("Invalid contactEmail format", 400);
  }

  if (plan && !VALID_PLANS.includes(plan)) {
    throw new AppError(`Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}`, 400);
  }

  const existing = await Tenant.findOne({ slug: slug.toLowerCase() });
  if (existing) {
    throw new AppError("A tenant with this slug already exists", 409);
  }

  const tenant = await Tenant.create({
    businessName,
    slug,
    contactEmail,
    contactPhone,
    address,
    ...(plan && { plan }),
    createdBy: userId,
    updatedBy: userId,
  });

  await seedRolesForTenant(tenant._id, userId);

  return tenant;
};

export const updateTenant = async (id, data, userId) => {
  const allowedFields = [
    "businessName",
    "contactEmail",
    "contactPhone",
    "address",
    "plan",
    "status",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (updates.contactEmail && !EMAIL_REGEX.test(updates.contactEmail)) {
    throw new AppError("Invalid contactEmail format", 400);
  }

  if (updates.plan && !VALID_PLANS.includes(updates.plan)) {
    throw new AppError(`Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}`, 400);
  }

  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    throw new AppError(
      `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      400,
    );
  }

  updates.updatedBy = userId;

  const tenant = await Tenant.findOneAndUpdate(
    { _id: id, isDeleted: false },
    updates,
    { new: true, runValidators: true },
  );
  if (!tenant) throw new AppError("Tenant not found", 404);
  return tenant;
};

export const setTenantStatus = async (id, status, userId) => {
  const tenant = await Tenant.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { status, updatedBy: userId },
    { new: true },
  );
  if (!tenant) throw new AppError("Tenant not found", 404);
  return tenant;
};

export const suspendTenant = (id, userId) => setTenantStatus(id, "suspended", userId);
export const activateTenant = (id, userId) => setTenantStatus(id, "active", userId);

// Soft delete — a tenant's historical data (orders, payments) must survive
// even after the business itself is deactivated, per CLAUDE.md's soft-delete rule.
export const deleteTenant = async (id, userId) => {
  const tenant = await Tenant.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
    { new: true },
  );
  if (!tenant) throw new AppError("Tenant not found", 404);
  return tenant;
};

export const getTenantStats = async (id) => {
  await getTenantById(id);

  const [totalEmployees, totalCustomers, totalOrders, revenueResult] = await Promise.all([
    Employee.countDocuments({ tenantId: id, isDeleted: false }),
    Customer.countDocuments({ tenantId: id, isDeleted: false }),
    Order.countDocuments({ tenantId: id }),
    Payment.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return {
    totalEmployees,
    totalCustomers,
    totalOrders,
    totalRevenue: revenueResult[0]?.total ?? 0,
  };
};
