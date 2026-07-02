import Customer from "../Models/Customer.js";
import AppError from "../utils/AppError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GENDERS = ["male", "female"];

export const listCustomers = async (tenantId) => {
  return Customer.find({ tenantId, isDeleted: false }).sort({ createdAt: -1 });
};

export const getCustomerById = async (tenantId, id) => {
  const customer = await Customer.findOne({
    _id: id,
    tenantId,
    isDeleted: false,
  });
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};

export const createCustomer = async (tenantId, data, userId) => {
  const { name, phone, address, email, gender, notes } = data;

  if (!name || !phone) {
    throw new AppError("name and phone are required", 400);
  }
  if (email && !EMAIL_REGEX.test(email)) {
    throw new AppError("Invalid email format", 400);
  }
  if (gender && !VALID_GENDERS.includes(gender)) {
    throw new AppError(`Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}`, 400);
  }

  // Phone uniqueness is scoped per tenant — see unique index on { tenantId, phone }
  const existing = await Customer.findOne({ tenantId, phone });
  if (existing) {
    throw new AppError("A customer with this phone number already exists", 409);
  }

  return Customer.create({
    tenantId,
    name,
    phone,
    address,
    email,
    gender,
    notes,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const updateCustomer = async (tenantId, id, data, userId) => {
  const allowedFields = ["name", "phone", "address", "email", "gender", "notes"];

  if (data.email && !EMAIL_REGEX.test(data.email)) {
    throw new AppError("Invalid email format", 400);
  }
  if (data.gender && !VALID_GENDERS.includes(data.gender)) {
    throw new AppError(`Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}`, 400);
  }

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  updates.updatedBy = userId;

  const customer = await Customer.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    updates,
    { new: true, runValidators: true },
  );
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};

export const deleteCustomer = async (tenantId, id, userId) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
    { new: true },
  );
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
};
