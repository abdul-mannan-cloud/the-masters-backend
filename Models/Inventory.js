import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    fabricName: {
      type: String,
      required: true,
      trim: true,
    },
    // Unique per tenant — see index below
    fabricCode: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
    supplier: {
      type: String,
      trim: true,
    },
    unit: {
      type: String,
      enum: ["meter", "yard", "piece", "roll"],
      required: true,
    },
    availableQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // Stock earmarked for confirmed orders not yet fulfilled — tracked
    // separately from availableQuantity so future features (e.g. reserving
    // before confirmation) don't need a schema change.
    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    minimumStockLevel: {
      type: Number,
      default: 0,
      min: 0,
    },
    purchasePrice: {
      type: Number,
      min: 0,
    },
    sellingPrice: {
      type: Number,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      default: null,
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

// Fabric code is unique within a tenant (two tenants can both have "FB-001")
inventorySchema.index({ tenantId: 1, fabricCode: 1 }, { unique: true });
inventorySchema.index({ tenantId: 1, fabricName: 1 });
inventorySchema.index({ tenantId: 1, category: 1 });

export default mongoose.model("Inventory", inventorySchema);
