import Measurement from "../Models/Measurement.js";
import Customer from "../Models/Customer.js";
import ProductType from "../Models/ProductType.js";
import AppError from "../utils/AppError.js";

const VALID_UNITS = ["inch", "cm", "mm"];

const validateValues = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new AppError("values must be a non-empty array", 400);
  }
  for (const v of values) {
    if (!v.fieldId || !v.label || typeof v.value !== "number") {
      throw new AppError(
        "Each measurement value requires fieldId, label, and a numeric value",
        400,
      );
    }
    if (v.unit && !VALID_UNITS.includes(v.unit)) {
      throw new AppError(`Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`, 400);
    }
  }
};

// Guard against a client passing a customerId/productTypeId that belongs to another tenant
const assertBelongsToTenant = async (tenantId, customerId, productTypeId) => {
  const [customer, productType] = await Promise.all([
    Customer.findOne({ _id: customerId, tenantId, isDeleted: false }),
    ProductType.findOne({ _id: productTypeId, tenantId, isDeleted: false }),
  ]);
  if (!customer) throw new AppError("Customer not found for this tenant", 404);
  if (!productType) throw new AppError("Product type not found for this tenant", 404);
};

export const listMeasurements = async (tenantId, customerId) => {
  const filter = { tenantId };
  if (customerId) filter.customerId = customerId;
  return Measurement.find(filter).sort({ createdAt: -1 });
};

export const getMeasurementById = async (tenantId, id) => {
  const measurement = await Measurement.findOne({ _id: id, tenantId });
  if (!measurement) throw new AppError("Measurement not found", 404);
  return measurement;
};

export const createMeasurement = async (tenantId, data, userId) => {
  const { customerId, productTypeId, label, values, notes } = data;

  if (!customerId || !productTypeId) {
    throw new AppError("customerId and productTypeId are required", 400);
  }
  validateValues(values);
  await assertBelongsToTenant(tenantId, customerId, productTypeId);

  return Measurement.create({
    tenantId,
    customerId,
    productTypeId,
    label,
    values,
    notes,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const updateMeasurement = async (tenantId, id, data, userId) => {
  const measurement = await Measurement.findOne({ _id: id, tenantId });
  if (!measurement) throw new AppError("Measurement not found", 404);

  // IMMUTABILITY RULE: once used in an order, this document can never change again.
  if (measurement.lockedForOrder) {
    throw new AppError(
      "This measurement is locked because it has been used in an order. Create a new measurement instead.",
      409,
    );
  }

  if (data.values !== undefined) validateValues(data.values);

  const allowedFields = ["label", "values", "notes"];
  for (const field of allowedFields) {
    if (data[field] !== undefined) measurement[field] = data[field];
  }
  measurement.updatedBy = userId;

  await measurement.save();
  return measurement;
};

export const deleteMeasurement = async (tenantId, id) => {
  const measurement = await Measurement.findOne({ _id: id, tenantId });
  if (!measurement) throw new AppError("Measurement not found", 404);

  if (measurement.lockedForOrder) {
    throw new AppError(
      "This measurement is locked because it has been used in an order and cannot be deleted.",
      409,
    );
  }

  await measurement.deleteOne();
  return measurement;
};
