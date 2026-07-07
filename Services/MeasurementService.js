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

// A catalog-driven measurement must capture every field the ProductType's
// template marks required — otherwise the garment can't actually be cut from it.
const assertRequiredFieldsCaptured = (measurementTemplate, values) => {
  const requiredIds = measurementTemplate.filter((f) => f.required).map((f) => f.id);
  const capturedIds = new Set(values.map((v) => v.fieldId));
  const missing = requiredIds.filter((id) => !capturedIds.has(id));
  if (missing.length) {
    throw new AppError(`Missing required measurement fields: ${missing.join(", ")}`, 400);
  }
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

// `session` is optional — pass it when this is called as part of a larger
// transaction (e.g. CustomerService.createCustomer creating a customer and
// their initial garment measurements together). Omitted, it runs standalone.
export const createMeasurement = async (tenantId, data, userId, session) => {
  const { customerId, productTypeId, garmentType, label, values, notes, price } = data;

  if (!customerId) {
    throw new AppError("customerId is required", 400);
  }
  if (price === undefined || price === null || price === "") {
    throw new AppError("price is required", 400);
  }
  if (price < 0) {
    throw new AppError("price cannot be negative", 400);
  }
  validateValues(values);

  const customer = await Customer.findOne({
    _id: customerId,
    tenantId,
    isDeleted: false,
  }).session(session);
  if (!customer) throw new AppError("Customer not found for this tenant", 404);

  // Garment type name is always resolved server-side — snapshotted from the
  // ProductType when one is selected, never trusted from the client.
  let resolvedGarmentType;
  if (productTypeId) {
    const productType = await ProductType.findOne({
      _id: productTypeId,
      tenantId,
      isDeleted: false,
    }).session(session);
    if (!productType) throw new AppError("Product type not found for this tenant", 404);
    assertRequiredFieldsCaptured(productType.measurementTemplate, values);
    resolvedGarmentType = productType.name;
  } else {
    // Manual measurement — no matching catalog product type.
    if (!garmentType || !garmentType.trim()) {
      throw new AppError("garmentType is required for a manual measurement", 400);
    }
    resolvedGarmentType = garmentType.trim();
  }

  const [measurement] = await Measurement.create(
    [
      {
        tenantId,
        customerId,
        productTypeId: productTypeId || undefined,
        garmentType: resolvedGarmentType,
        price,
        label,
        values,
        notes,
        createdBy: userId,
        updatedBy: userId,
      },
    ],
    { session },
  );
  return measurement;
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

  if (data.values !== undefined) {
    validateValues(data.values);
    if (measurement.productTypeId) {
      const productType = await ProductType.findOne({
        _id: measurement.productTypeId,
        tenantId,
        isDeleted: false,
      });
      if (productType) assertRequiredFieldsCaptured(productType.measurementTemplate, data.values);
    }
  }
  if (data.price !== undefined && data.price < 0) {
    throw new AppError("price cannot be negative", 400);
  }

  // garmentType/productTypeId are not editable — changing the garment a
  // measurement is for means creating a new measurement, not editing this one.
  const allowedFields = ["label", "values", "notes", "price"];
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
