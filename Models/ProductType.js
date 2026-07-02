import mongoose from "mongoose";

// Defines a single measurement field for this garment type
// e.g., { id: "chest", label: "Chest", required: true, unit: "inch" }
const measurementTemplateFieldSchema = new mongoose.Schema(
  {
    id: {
      // Unique key within this template — matched by Measurement.values[].fieldId
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    required: {
      type: Boolean,
      default: true,
    },
    unit: {
      type: String,
      enum: ["inch", "cm", "mm"],
      default: "inch",
    },
    // Controls display order in the measurement form
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

// A customization option with its possible values
// e.g., { name: "Collar", values: ["Chinese", "Round", "Coat"] }
const productOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    values: {
      type: [String],
      required: true,
    },
  },
  { _id: false },
);

// One step in the production workflow for this garment type
// sequence determines the order; requiredSkill maps to Employee.skills
const workflowStepSchema = new mongoose.Schema(
  {
    sequence: {
      type: Number,
      required: true,
    },
    step: {
      type: String,
      required: true,
      trim: true,
    },
    // Must match a value in the Employee.skills enum for validation to work
    requiredSkill: {
      type: String,
      required: true,
    },
    // Optional time estimate — useful for delivery date calculations
    estimatedDurationHours: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const productTypeSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // Fields to collect when taking measurements for this garment
    measurementTemplate: {
      type: [measurementTemplateFieldSchema],
      default: [],
    },
    // Customization choices presented to the customer at order time
    options: {
      type: [productOptionSchema],
      default: [],
    },
    // Production steps in sequence — defines how this garment is manufactured
    workflow: {
      type: [workflowStepSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Get all product types offered by a tenant
productTypeSchema.index({ tenantId: 1 });

// Product type name search within a tenant
productTypeSchema.index({ tenantId: 1, name: 1 });

// Filter active product types only (common UI query)
productTypeSchema.index({ tenantId: 1, isActive: 1 });

export default mongoose.model("ProductType", productTypeSchema);
