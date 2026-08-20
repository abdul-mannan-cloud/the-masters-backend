import mongoose from "mongoose";

// A single customization choice the customer made
// e.g., { name: "Collar", value: "Chinese" }
const selectedOptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false },
);

// One additional material this garment consumes besides its primary fabric
// (fabricId/requiredFabricLength below) — e.g. buttons, thread, collar
// material. Same snapshot convention: unit is copied from Inventory.unit at
// pick time so a later unit change on the Inventory item can't alter how an
// already-placed order reads.
const materialUsageSchema = new mongoose.Schema(
  {
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum: ["meter", "yard", "piece", "roll"],
      required: true,
    },
  },
  { _id: false },
);

const orderItemSchema = new mongoose.Schema(
  {
    tenantId: {
      // Stored here (not just on Order) to allow direct tenant-scoped queries
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    productTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
      required: true,
    },
    // SNAPSHOT — copied from ProductType.name at order creation time, same
    // convention as unitPrice. A ProductType renamed later must not change
    // how this garment reads on a historical bill/invoice.
    garmentType: {
      type: String,
      required: true,
      trim: true,
    },
    measurementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Measurement",
      required: true,
    },
    // SNAPSHOT — do not recalculate from ProductType after order creation
    selectedOptions: {
      type: [selectedOptionSchema],
      default: [],
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // SNAPSHOT — copied from ProductType.basePrice at order creation time.
    // ProductType price changes after this point have no effect here.
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    // Fabric tracking is optional — not every garment draws from Inventory.
    fabricId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      default: null,
    },
    // How much fabric this garment consumes, e.g. 2.75. Stock is only
    // deducted when the Order is confirmed, not when the item is created.
    requiredFabricLength: {
      type: Number,
      min: 0,
      default: null,
    },
    // SNAPSHOT of Inventory.unit at the time the fabric was picked — a later
    // change to the Inventory item's unit must not change how this item reads.
    fabricUnit: {
      type: String,
      enum: ["meter", "yard", "piece", "roll", null],
      default: null,
    },
    // Additional materials beyond the primary fabric above — buttons,
    // thread, lining, etc. Empty for garments that only need fabricId.
    // Deducted/restored/validated by InventoryService alongside fabricId.
    materials: {
      type: [materialUsageSchema],
      default: [],
    },
    instructions: {
      type: String,
      trim: true,
    },
    // High-level summary status — detailed step tracking is in OrderItemAssignment
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "cancelled"],
      default: "pending",
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

// Load all items for an order (e.g., order detail page)
orderItemSchema.index({ orderId: 1 });

// Cross-order production view: "all pending items for this tenant"
orderItemSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model("OrderItem", orderItemSchema);
