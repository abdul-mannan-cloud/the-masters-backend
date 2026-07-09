import mongoose from "mongoose";

// Backs atomic, gap-free sequence generation (customer numbers, per-customer
// order sequences, etc.) — one document per (tenantId, key) pair, incremented
// via findOneAndUpdate so concurrent requests never hand out the same number.
const counterSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
  },
  key: {
    type: String,
    required: true,
    trim: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

counterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export default mongoose.model("Counter", counterSchema);
