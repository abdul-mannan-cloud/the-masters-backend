import Customer from "../Models/Customer.js";
import AppError from "../utils/AppError.js";
import { getNextSequence } from "../utils/counter.js";
import { normalizeDigits, isValidPhone, isValidCnic, isValidEmail } from "../utils/validators.js";

const VALID_GENDERS = ["male", "female", "other"];
const CUSTOMER_NUMBER_PREFIX = "cust";

// e.g. "cust0001" — sequence is per tenant, never reused, never renumbered
const generateCustomerNumber = async (tenantId, session) => {
  const seq = await getNextSequence(tenantId, "customer", session);
  return `${CUSTOMER_NUMBER_PREFIX}${String(seq).padStart(4, "0")}`;
};

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

// The Customer module only ever manages customer information — measurements
// and orders are created later, as part of the Order workflow (see
// OrderItemService.createOrderForCustomer), never here. Kept a plain
// single-collection insert on purpose: nothing else is written alongside a
// customer anymore, so there's nothing to wrap in a transaction.
export const createCustomer = async (tenantId, data, userId) => {
  const { name, phone, cnic, address, email, gender, notes } = data;

  if (!name || !phone || !gender) {
    throw new AppError("name, phone, and gender are required", 400);
  }
  const phoneDigits = normalizeDigits(phone);
  if (!isValidPhone(phoneDigits)) {
    throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
  }
  let cnicDigits;
  if (cnic) {
    cnicDigits = normalizeDigits(cnic);
    if (!isValidCnic(cnicDigits)) {
      throw new AppError("Enter a valid 13-digit CNIC", 400);
    }
  }
  if (email && !isValidEmail(email)) {
    throw new AppError("Invalid email format", 400);
  }
  if (!VALID_GENDERS.includes(gender)) {
    throw new AppError(`Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}`, 400);
  }

  // Phone uniqueness is scoped per tenant — see unique index on { tenantId, phone }
  const existingPhone = await Customer.findOne({ tenantId, phone: phoneDigits });
  if (existingPhone) {
    throw new AppError("A customer with this phone number already exists", 409);
  }
  if (cnicDigits) {
    const existingCnic = await Customer.findOne({ tenantId, cnic: cnicDigits });
    if (existingCnic) {
      throw new AppError("A customer with this CNIC already exists", 409);
    }
  }

  const customerNumber = await generateCustomerNumber(tenantId);
  const customer = await Customer.create({
    tenantId,
    customerNumber,
    name,
    phone: phoneDigits,
    cnic: cnicDigits || undefined,
    address,
    email,
    gender: gender || undefined, // "" from an unselected dropdown must stay unset, not an invalid enum value
    notes,
    createdBy: userId,
    updatedBy: userId,
  });
  return { customer };
};

export const updateCustomer = async (tenantId, id, data, userId) => {
  const allowedFields = ["name", "phone", "cnic", "address", "email", "gender", "notes"];

  if (data.phone) {
    data.phone = normalizeDigits(data.phone);
    if (!isValidPhone(data.phone)) {
      throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
    }
  }
  if (data.cnic) {
    data.cnic = normalizeDigits(data.cnic);
    if (!isValidCnic(data.cnic)) {
      throw new AppError("Enter a valid 13-digit CNIC", 400);
    }
  }
  if (data.email && !isValidEmail(data.email)) {
    throw new AppError("Invalid email format", 400);
  }
  if (data.gender && !VALID_GENDERS.includes(data.gender)) {
    throw new AppError(`Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}`, 400);
  }

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  if (updates.gender === "") updates.gender = undefined; // clearing the dropdown must unset, not set an invalid enum value
  if (updates.cnic === "") updates.cnic = undefined; // same rule as gender — clearing must unset, not write ""
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
