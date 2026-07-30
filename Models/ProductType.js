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

// One option value's image layer for the 2D preview compositor
// e.g. { value: "Chinese", image: "https://.../chinese-collar.png" }
const previewLayerValueSchema = new mongoose.Schema(
  {
    // Must match a string in the parent option's productOptionSchema.values —
    // validated in ProductTypeService, not here (values live on a sibling
    // array, not reachable from this sub-document).
    value: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

// Groups the per-value preview images for one customization option (e.g. all
// of "Neckline"'s images) so the compositor knows which option drives which
// layer group and how the groups stack.
const previewLayerSchema = new mongoose.Schema(
  {
    // Must match a productOptionSchema.name in this same ProductType.
    optionName: {
      type: String,
      required: true,
      trim: true,
    },
    // Stacking order among layer groups — higher paints on top (e.g. a
    // Pocket layer above a Sleeves layer above the base garment).
    zIndex: {
      type: Number,
      default: 0,
    },
    values: {
      type: [previewLayerValueSchema],
      default: [],
    },
  },
  { _id: false },
);

// The 2D layered preview for this garment. Entirely optional and additive —
// a ProductType with no preview configured just renders no preview (see
// GarmentPreview.jsx), so this never affects the existing options/measurement/
// workflow behavior for tenants that haven't set it up.
const previewSchema = new mongoose.Schema(
  {
    // The garment silhouette shown under every option layer. Null until a
    // tenant uploads one via the Product Type form's Preview Layers section.
    baseImage: {
      type: String,
      default: null,
    },
    layers: {
      type: [previewLayerSchema],
      default: [],
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
    // Drives gender-based filtering when adding garments for a customer
    // (see utils/productCategories.js GENDER_CATEGORY_MAP). Not a Mongoose
    // enum so new categories can be introduced without a schema change —
    // validated against PRODUCT_CATEGORIES in the service layer instead.
    category: {
      type: String,
      required: true,
      trim: true,
      default: "Unisex",
    },
    // True for a tenant's own copy of a platform default template (see
    // utils/seedDefaultProductTypes.js). Informational only — a default
    // template is otherwise a completely normal, independently editable
    // ProductType owned by this tenant; editing it never affects other tenants.
    isDefaultTemplate: {
      type: Boolean,
      default: false,
    },
    // Controls sort order in garment-selection dropdowns
    displayOrder: {
      type: Number,
      default: 0,
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
    // 2D layered preview shown while an order is being drafted (see
    // GarmentPreview.jsx). Optional — absent/empty means no preview renders.
    preview: {
      type: previewSchema,
      default: () => ({}),
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

// Gender-based filtering when adding garments for a customer
productTypeSchema.index({ tenantId: 1, category: 1 });

export default mongoose.model("ProductType", productTypeSchema);
