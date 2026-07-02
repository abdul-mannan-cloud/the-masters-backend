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
