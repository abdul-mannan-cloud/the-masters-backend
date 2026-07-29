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
    // Optional — "if applicable" per the registration form. Unique per
    // tenant, not globally, same convention as Employee.cnic.
    cnic: {
      type: String,
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
    // Not `required` at the schema level even though registration requires it
    // (enforced in CustomerService.createCustomer) — boot-time migrations
    // like backfillCustomerNumbers.js call .save() on legacy customer docs
    // that predate this field, and a hard schema requirement would break
    // that save and, in turn, server startup.
    gender: {
      type: String,
      enum: ["male", "female", "other"],
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

// CNIC uniqueness is scoped per tenant, only enforced for customers who
// actually provided one. A plain `sparse` compound index does NOT achieve
// that: MongoDB only excludes a document from a sparse compound index when
// EVERY indexed field is missing, and tenantId is always present — so any
// two cnic-less customers in the same tenant still collide as duplicates.
// A partial index keyed on "cnic exists" is the correct way to scope
// uniqueness to only the documents that have one.
customerSchema.index(
  { tenantId: 1, cnic: 1 },
  { unique: true, partialFilterExpression: { cnic: { $exists: true } } },
);

// customerNumber is unique within one shop — sparse so pre-existing customers
// created before this field existed don't collide on a shared "missing" value
customerSchema.index({ tenantId: 1, customerNumber: 1 }, { unique: true, sparse: true });

// Name search within a tenant's customer list
customerSchema.index({ tenantId: 1, name: 1 });

export default mongoose.model("Customer", customerSchema);
