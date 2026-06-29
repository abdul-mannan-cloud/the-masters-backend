import mongoose from "mongoose";
const customerSchema = new mongoose.Schema(
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
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    gender: {
      type: String,
      enum: ["male", "female"],
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

// A customer's phone is unique within one shop, not across all shops
customerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

// Name search within a tenant's customer list
customerSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model("Customer", customerSchema);
