import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Tenant from "../Models/Tenant.js";
import User from "../Models/User.js";
import Employee from "../Models/Employee.js";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
import Payment from "../Models/Payment.js";
import Settings from "../Models/Settings.js";
import AppError from "../utils/AppError.js";
import { seedRolesForTenant } from "../utils/seedDefaultRoles.js";
import { seedProductTypesForTenant } from "../utils/seedDefaultProductTypes.js";
import { seedInventoryForTenant } from "../utils/seedDefaultInventory.js";
import { normalizeDigits, isValidPhone, isValidEmail } from "../utils/validators.js";

const VALID_PLANS = ["free", "basic", "pro", "enterprise"];
const VALID_STATUSES = ["active", "suspended", "cancelled"];

// Mirror of SettingsService's BUSINESS_TO_TENANT_FIELD, reversed — Tenant's
// own copy of the business profile is edited here (super_admin's Tenant
// form), Settings.business is edited from the tenant's own Business Info
// page. Both write paths must keep the other collection in sync or one of
// the two screens goes stale. See SettingsService.js for the other half.
const TENANT_TO_BUSINESS_FIELD = {
  businessName: "name",
  logo: "logo",
  contactEmail: "email",
  contactPhone: "phone",
  address: "address",
};

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

// Creates a Tenant together with its first tenant_admin User in one
// transaction (super-admin panel equivalent of the self-service /admin/signup
// flow) — a tenant created here must be able to log in immediately, so the
// admin's password is required, not optional.
export const createTenant = async (data, userId) => {
  const {
    businessName,
    slug,
    contactEmail,
    contactPhone,
    address,
    plan,
    logo,
    password,
  } = data;

  if (!businessName || !slug || !contactEmail || !password) {
    throw new AppError(
      "businessName, slug, contactEmail, and password are required",
      400,
    );
  }

  if (!isValidEmail(contactEmail)) {
    throw new AppError("Invalid contactEmail format", 400);
  }

  let contactPhoneDigits;
  if (contactPhone) {
    contactPhoneDigits = normalizeDigits(contactPhone);
    if (!isValidPhone(contactPhoneDigits)) {
      throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
    }
  }

  if (password.length < 8) {
    throw new AppError("Password must be at least 8 characters", 400);
  }

  if (plan && !VALID_PLANS.includes(plan)) {
    throw new AppError(`Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}`, 400);
  }

  const existing = await Tenant.findOne({ slug: slug.toLowerCase() });
  if (existing) {
    throw new AppError("A tenant with this slug already exists", 409);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const [tenant] = await Tenant.create(
      [
        {
          businessName,
          slug,
          contactEmail,
          contactPhone: contactPhoneDigits,
          address,
          logo: logo || null,
          ...(plan && { plan }),
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    const hashedPassword = await bcrypt.hash(password, 10);
    const [admin] = await User.create(
      [
        {
          email: contactEmail,
          password: hashedPassword,
          role: "tenant_admin",
          tenantId: tenant._id,
        },
      ],
      { session },
    );

    await seedRolesForTenant(tenant._id, admin._id, session);
    await seedProductTypesForTenant(tenant._id, admin._id, session);
    await seedInventoryForTenant(tenant._id, admin._id, session);

    await session.commitTransaction();

    return {
      tenant,
      admin: { id: admin._id, email: admin.email, role: admin.role },
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const updateTenant = async (id, data, userId) => {
  const allowedFields = [
    "businessName",
    "contactEmail",
    "contactPhone",
    "address",
    "plan",
    "status",
    "logo",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (updates.contactEmail && !isValidEmail(updates.contactEmail)) {
    throw new AppError("Invalid contactEmail format", 400);
  }

  if (updates.contactPhone) {
    updates.contactPhone = normalizeDigits(updates.contactPhone);
    if (!isValidPhone(updates.contactPhone)) {
      throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
    }
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

  // Mirror whichever fields changed onto Settings.business.* — see
  // TENANT_TO_BUSINESS_FIELD above. Settings may not exist yet for this
  // tenant (created lazily on first Business Info visit), so upsert.
  const businessMirror = {};
  for (const [tenantField, businessKey] of Object.entries(TENANT_TO_BUSINESS_FIELD)) {
    if (updates[tenantField] !== undefined) {
      businessMirror[`business.${businessKey}`] = updates[tenantField];
    }
  }
  const hasBusinessMirror = Object.keys(businessMirror).length > 0;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const [tenant] = await Promise.all([
      Tenant.findOneAndUpdate({ _id: id, isDeleted: false }, updates, {
        new: true,
        runValidators: true,
        session,
      }),
      hasBusinessMirror
        ? Settings.findOneAndUpdate(
            { tenantId: id },
            { $set: { ...businessMirror, updatedBy: userId } },
            { upsert: true, session },
          )
        : Promise.resolve(null),
    ]);
    if (!tenant) throw new AppError("Tenant not found", 404);

    await session.commitTransaction();
    return tenant;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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
