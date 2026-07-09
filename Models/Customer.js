import mongoose from "mongoose";
const customerSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    // System-assigned, unique per tenant — e.g. "cust0001". Never user-editable.
    customerNumber: {
      type: String,
      required: true,
      trim: true,
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

// customerNumber is unique within one shop — sparse so pre-existing customers
// created before this field existed don't collide on a shared "missing" value
customerSchema.index({ tenantId: 1, customerNumber: 1 }, { unique: true, sparse: true });

// Name search within a tenant's customer list
customerSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model("Customer", customerSchema);
