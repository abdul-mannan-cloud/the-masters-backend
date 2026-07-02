import ProductType from "../Models/ProductType.js";
import AppError from "../utils/AppError.js";

const SKILLS = [
  "Cutting",
  "Tailoring",
  "Design",
  "Packing",
  "Sales",
  "Finishing",
  "Embroidery",
];
const VALID_UNITS = ["inch", "cm", "mm"];

const validateMeasurementTemplate = (template) => {
  if (template === undefined) return;
  if (!Array.isArray(template)) {
    throw new AppError("measurementTemplate must be an array", 400);
  }
  for (const field of template) {
    if (!field.id || !field.label) {
      throw new AppError("Each measurementTemplate field requires id and label", 400);
    }
    if (field.unit && !VALID_UNITS.includes(field.unit)) {
      throw new AppError(`Invalid unit. Must be one of: ${VALID_UNITS.join(", ")}`, 400);
    }
  }
};

const validateOptions = (options) => {
  if (options === undefined) return;
  if (!Array.isArray(options)) {
    throw new AppError("options must be an array", 400);
  }
  for (const option of options) {
    if (!option.name || !Array.isArray(option.values) || option.values.length === 0) {
      throw new AppError("Each option requires a name and a non-empty values array", 400);
    }
  }
};

const validateWorkflow = (workflow) => {
  if (workflow === undefined) return;
  if (!Array.isArray(workflow)) {
    throw new AppError("workflow must be an array", 400);
  }
  for (const step of workflow) {
    if (typeof step.sequence !== "number" || !step.step || !step.requiredSkill) {
      throw new AppError(
        "Each workflow step requires sequence, step, and requiredSkill",
        400,
      );
    }
    if (!SKILLS.includes(step.requiredSkill)) {
      throw new AppError(
        `Invalid requiredSkill "${step.requiredSkill}". Must be one of: ${SKILLS.join(", ")}`,
        400,
      );
    }
  }
};

export const listProductTypes = async (tenantId) => {
  return ProductType.find({ tenantId, isDeleted: false }).sort({ createdAt: -1 });
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

export const deleteProductType = async (tenantId, id, userId) => {
  const productType = await ProductType.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date(), updatedBy: userId },
    { new: true },
  );
  if (!productType) throw new AppError("Product type not found", 404);
  return productType;
};
