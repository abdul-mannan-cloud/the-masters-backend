import ProductType from "../Models/ProductType.js";
import AppError from "../utils/AppError.js";
import EMPLOYEE_SKILLS from "../utils/skills.js";

const VALID_UNITS = ["inch", "cm", "mm"];

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateMeasurementTemplate = (template) => {
  if (template === undefined) return;
  if (!Array.isArray(template)) {
    throw new AppError("measurementTemplate must be an array", 400);
  }

  const seenIds = new Set();
  const seenLabels = new Set();
  for (const field of template) {
    if (!field.id || !field.label) {
      throw new AppError("Each measurementTemplate field requires id and label", 400);
    }
    if (field.unit && !VALID_UNITS.includes(field.unit)) {
      throw new AppError(`Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`, 400);
    }

    const id = String(field.id).trim();
    const label = String(field.label).trim().toLowerCase();
    if (seenIds.has(id)) {
      throw new AppError(`Duplicate measurement id: "${field.id}"`, 400);
    }
    if (seenLabels.has(label)) {
      throw new AppError(`Duplicate measurement label: "${field.label}"`, 400);
    }
    seenIds.add(id);
    seenLabels.add(label);
  }
};

const validateOptions = (options) => {
  if (options === undefined) return;
  if (!Array.isArray(options)) {
    throw new AppError("options must be an array", 400);
  }

  const seenNames = new Set();
  for (const option of options) {
    if (!option.name || !Array.isArray(option.values) || option.values.length === 0) {
      throw new AppError("Each option requires a name and a non-empty values array", 400);
    }

    const name = String(option.name).trim().toLowerCase();
    if (seenNames.has(name)) {
      throw new AppError(`Duplicate option name: "${option.name}"`, 400);
    }
    seenNames.add(name);

    const seenValues = new Set();
    for (const value of option.values) {
      const normalized = String(value).trim().toLowerCase();
      if (seenValues.has(normalized)) {
        throw new AppError(`Duplicate option value "${value}" in option "${option.name}"`, 400);
      }
      seenValues.add(normalized);
    }
  }
};

const validateWorkflow = (workflow) => {
  if (workflow === undefined) return;
  if (!Array.isArray(workflow)) {
    throw new AppError("workflow must be an array", 400);
  }

  const seenSequences = new Set();
  const seenSteps = new Set();
  for (const step of workflow) {
    if (typeof step.sequence !== "number" || !step.step || !step.requiredSkill) {
      throw new AppError(
        "Each workflow step requires sequence, step, and requiredSkill",
        400,
      );
    }
    if (!EMPLOYEE_SKILLS.includes(step.requiredSkill)) {
      throw new AppError(
        `Invalid requiredSkill "${step.requiredSkill}". Must be one of: ${EMPLOYEE_SKILLS.join(", ")}`,
        400,
      );
    }

    const stepName = String(step.step).trim().toLowerCase();
    if (seenSequences.has(step.sequence)) {
      throw new AppError(`Duplicate workflow sequence: ${step.sequence}`, 400);
    }
    if (seenSteps.has(stepName)) {
      throw new AppError(`Duplicate workflow step: "${step.step}"`, 400);
    }
    seenSequences.add(step.sequence);
    seenSteps.add(stepName);
  }
};

// Product names are unique per tenant only — the same name may exist across
// different tenants. excludeId lets updates ignore the document's own name.
const assertUniqueName = async (tenantId, name, excludeId) => {
  const query = {
    tenantId,
    isDeleted: false,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await ProductType.findOne(query);
  if (existing) {
    throw new AppError("Product name already exists.", 409);
  }
};

export const listProductTypes = async (tenantId, filters = {}) => {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.max(parseInt(filters.limit, 10) || 10, 1);

  const query = { tenantId, isDeleted: false };

  if (filters.search) {
    query.name = { $regex: escapeRegex(filters.search.trim()), $options: "i" };
  }
  if (filters.isActive === "true" || filters.isActive === true) {
    query.isActive = true;
  } else if (filters.isActive === "false" || filters.isActive === false) {
    query.isActive = false;
  }

  const [data, total] = await Promise.all([
    ProductType.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ProductType.countDocuments(query),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
};

export const getProductTypeById = async (tenantId, id) => {
  const productType = await ProductType.findOne({
    _id: id,
    tenantId,
    isDeleted: false,
  });
  if (!productType) throw new AppError("Product type not found", 404);
  return productType;
};

export const createProductType = async (tenantId, data, userId) => {
  const { name, description, basePrice, measurementTemplate, options, workflow, isActive } =
    data;

  if (!name || basePrice === undefined) {
    throw new AppError("name and basePrice are required", 400);
  }
  if (basePrice < 0) {
    throw new AppError("basePrice cannot be negative", 400);
  }
  await assertUniqueName(tenantId, name);
  validateMeasurementTemplate(measurementTemplate);
  validateOptions(options);
  validateWorkflow(workflow);

  return ProductType.create({
    tenantId,
    name,
    description,
    basePrice,
    measurementTemplate,
    options,
    workflow,
    isActive,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const updateProductType = async (tenantId, id, data, userId) => {
  const allowedFields = [
    "name",
    "description",
    "basePrice",
    "measurementTemplate",
    "options",
    "workflow",
    "isActive",
  ];

  if (data.basePrice !== undefined && data.basePrice < 0) {
    throw new AppError("basePrice cannot be negative", 400);
  }
  if (data.name) {
    await assertUniqueName(tenantId, data.name, id);
  }
  validateMeasurementTemplate(data.measurementTemplate);
  validateOptions(data.options);
  validateWorkflow(data.workflow);

  const updates = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  updates.updatedBy = userId;

  const productType = await ProductType.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    updates,
    { new: true, runValidators: true },
  );
  if (!productType) throw new AppError("Product type not found", 404);
  return productType;
};

export const toggleStatus = async (tenantId, id, isActive, userId) => {
  if (typeof isActive !== "boolean") {
    throw new AppError("isActive must be a boolean", 400);
  }

  const productType = await ProductType.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { isActive, updatedBy: userId },
    { new: true },
  );
  if (!productType) throw new AppError("Product type not found", 404);
  return productType;
};

export const deleteProductType = async (tenantId, id, userId) => {
  const productType = await ProductType.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
    { new: true },
  );
  if (!productType) throw new AppError("Product type not found", 404);
  return productType;
};
