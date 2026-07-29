import mongoose from "mongoose";

// Append-only ledger of every stock movement — never edit or delete a
// transaction once written. Corrections happen by writing a new,
// opposite-direction transaction (same convention as Payment reversals).
const inventoryTransactionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderItem",
      default: null,
    },
    // Snapshots, not live joins — an Order can be edited or deleted and a
    // Customer/Employee record can change name later, but this ledger row
    // must keep reading the same way it did the day the stock actually moved
    // (same rationale as OrderItem.garmentType/unitPrice being snapshots).
    orderNumber: {
      type: String,
      trim: true,
      default: null,
    },
    customerName: {
      type: String,
      trim: true,
      default: null,
    },
    productName: {
      type: String,
      trim: true,
      default: null,
    },
    performedByName: {
      type: String,
      trim: true,
      default: null,
    },
    transactionType: {
      type: String,
      enum: ["Purchase", "Manual Adjustment", "Order Consumption", "Return", "Damage"],
      required: true,
    },
    // Magnitude of the movement (always positive) — direction is implied by
    // transactionType (Order Consumption/Damage decrease stock, the rest
    // increase it, except Manual Adjustment which may be signed).
    quantity: {
      type: Number,
      required: true,
    },
    previousStock: {
      type: Number,
      required: true,
      min: 0,
    },
    newStock: {
      type: Number,
      required: true,
      min: 0,
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Transaction history for one fabric, newest first
inventoryTransactionSchema.index({ tenantId: 1, inventoryId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ tenantId: 1, transactionType: 1 });
// "Orders using this fabric" view
inventoryTransactionSchema.index({ tenantId: 1, orderId: 1 });

export default mongoose.model("InventoryTransaction", inventoryTransactionSchema);
