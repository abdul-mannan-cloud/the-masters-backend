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
    // No default — Mongoose's enum validator rejects `null`, so leaving
    // gender unset must mean the field is absent, not defaulted to null.
    gender: {
      type: String,
      enum: ["male", "female"],
    },
    notes: {
      type: String,
      trim: true,
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

// A customer's phone is unique within one shop, not across all shops
customerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

// Name search within a tenant's customer list
customerSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model("Customer", customerSchema);
