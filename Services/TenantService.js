import Tenant from "../Models/Tenant.js";
import AppError from "../utils/AppError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLANS = ["free", "basic", "pro", "enterprise"];
const VALID_STATUSES = ["active", "suspended", "cancelled"];

export const listTenants = async () => {
  return Tenant.find().sort({ createdAt: -1 });
};

export const getTenantById = async (id) => {
  const tenant = await Tenant.findById(id);
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

  return Tenant.create({
    businessName,
    slug,
    contactEmail,
    contactPhone,
    address,
    ...(plan && { plan }),
    createdBy: userId,
    updatedBy: userId,
  });
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

  const tenant = await Tenant.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!tenant) throw new AppError("Tenant not found", 404);
  return tenant;
};

export const deleteTenant = async (id) => {
  const tenant = await Tenant.findByIdAndDelete(id);
  if (!tenant) throw new AppError("Tenant not found", 404);
  return tenant;
};
