import mongoose from "mongoose";

// A single measurement field value (e.g., chest = 40 inches)
const measurementValueSchema = new mongoose.Schema(
  {
    // Must match the `id` field in ProductType.measurementTemplate
    fieldId: {
      type: String,
      required: true,
    },
    // Snapshot of the label at capture time — preserved even if template changes
    label: {
      type: String,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      enum: ["inch", "cm", "mm"],
      default: "inch",
    },
  },
  { _id: false }, // Sub-documents — no separate IDs needed
);

const measurementSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    // Which product type's template was used to capture these measurements
    productTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductType",
      required: true,
    },
    // Optional human label to help staff identify measurement sets
    // e.g., "Wedding Suit 2024", "Eid Kameez"
    label: {
      type: String,
      trim: true,
    },
    values: {
      type: [measurementValueSchema],
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Set to true by application code when this measurement is first used in an order.
    // Once true, all update requests must be rejected. See IMMUTABILITY RULE above.
    lockedForOrder: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Load all measurement sets for a customer (e.g., measurement history page)
measurementSchema.index({ tenantId: 1, customerId: 1 });

export default mongoose.model("Measurement", measurementSchema);
