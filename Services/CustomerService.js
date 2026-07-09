import mongoose from "mongoose";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
import OrderItem from "../Models/OrderItem.js";
import ProductType from "../Models/ProductType.js";
import AppError from "../utils/AppError.js";
import * as MeasurementService from "./MeasurementService.js";
import { computeTotal, generateOrderNumber } from "./OrderService.js";
import { getNextSequence } from "../utils/counter.js";
import { normalizeDigits, isValidPhone, isValidEmail } from "../utils/validators.js";

const VALID_GENDERS = ["male", "female"];
const VALID_DISCOUNT_TYPES = ["fixed", "percentage"];
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

// Places the customer's very first order in the same transaction as their
// creation. Every item references one of the measurements just captured (by
// its index in that array) — a brand-new customer can't have any other
// measurements on file yet. This mirrors OrderService.createOrder +
// OrderItemService.createOrderItem, inlined here so "add customer + take
// measurement + place order" is one atomic write instead of three requests.
const createOrderForNewCustomer = async (
  tenantId,
  customer,
  createdMeasurements,
  orderData,
  userId,
  session,
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
    const { measurementIndex, productTypeId, selectedOptions, quantity = 1, instructions } = rawItem;

    const measurement = createdMeasurements[measurementIndex];
    if (!measurement) {
      throw new AppError(
        `Order item references an unknown measurement (index ${measurementIndex})`,
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

    // SNAPSHOT — copy the price now; ProductType.basePrice changes later must not affect this item
    await OrderItem.create(
      [
        {
          tenantId,
          orderId: order._id,
          productTypeId,
          measurementId: measurement._id,
          selectedOptions,
          quantity,
          unitPrice: productType.basePrice,
          instructions,
          createdBy: userId,
          updatedBy: userId,
        },
      ],
      { session },
    );

    // Lock the measurement so it can never be edited once attached to an order
    measurement.lockedForOrder = true;
    await measurement.save({ session });

    subtotal += productType.basePrice * quantity;
  }

  order.subtotal = subtotal;
  order.total = computeTotal(subtotal, discount, discountType);
  await order.save({ session });

  return order;
};

export const createCustomer = async (tenantId, data, userId) => {
  const { name, phone, address, email, gender, notes, measurements, order } = data;

  if (!name || !phone) {
    throw new AppError("name and phone are required", 400);
  }
  const phoneDigits = normalizeDigits(phone);
  if (!isValidPhone(phoneDigits)) {
    throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
  }
  if (email && !isValidEmail(email)) {
    throw new AppError("Invalid email format", 400);
  }
  if (gender && !VALID_GENDERS.includes(gender)) {
    throw new AppError(`Invalid gender. Must be one of: ${VALID_GENDERS.join(", ")}`, 400);
  }
  if (measurements !== undefined && !Array.isArray(measurements)) {
    throw new AppError("measurements must be an array", 400);
  }
  if (order !== undefined && (!measurements || measurements.length === 0)) {
    throw new AppError("At least one measurement is required to place an order", 400);
  }

  // Phone uniqueness is scoped per tenant — see unique index on { tenantId, phone }
  const existing = await Customer.findOne({ tenantId, phone: phoneDigits });
  if (existing) {
    throw new AppError("A customer with this phone number already exists", 409);
  }

  const customerFields = {
    tenantId,
    name,
    phone: phoneDigits,
    address,
    email,
    gender: gender || undefined, // "" from an unselected dropdown must stay unset, not an invalid enum value
    notes,
    createdBy: userId,
    updatedBy: userId,
  };

  if ((!measurements || measurements.length === 0) && order === undefined) {
    const customerNumber = await generateCustomerNumber(tenantId);
    const customer = await Customer.create({ ...customerFields, customerNumber });
    return { customer, measurements: [], order: null };
  }

  // Customer + their initial garment measurements + their first order (if any)
  // are created together — a customer left in a half-saved state would be
  // confusing, so this is one transaction.
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const customerNumber = await generateCustomerNumber(tenantId, session);
    const [customer] = await Customer.create(
      [{ ...customerFields, customerNumber }],
      { session },
    );

    const createdMeasurements = [];
    for (const measurementData of measurements || []) {
      const measurement = await MeasurementService.createMeasurement(
        tenantId,
        { ...measurementData, customerId: customer._id },
        userId,
        session,
      );
      createdMeasurements.push(measurement);
    }

    let createdOrder = null;
    if (order !== undefined) {
      createdOrder = await createOrderForNewCustomer(
        tenantId,
        customer,
        createdMeasurements,
        order,
        userId,
        session,
      );
    }

    await session.commitTransaction();
    return { customer, measurements: createdMeasurements, order: createdOrder };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const updateCustomer = async (tenantId, id, data, userId) => {
  const allowedFields = ["name", "phone", "address", "email", "gender", "notes"];

  if (data.phone) {
    data.phone = normalizeDigits(data.phone);
    if (!isValidPhone(data.phone)) {
      throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
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
