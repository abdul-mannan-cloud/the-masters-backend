import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: [
        "cash",
        "easypaisa",
        "jazzcash",
        "bank_transfer",
        "cheque",
        "other",
      ],
      required: true,
    },
    // "refund" is a reversal record — its amount is SUBTRACTED when computing
    // how much has actually been paid (see PaymentService.sumPayments). Used
    // to correct a mistaken payment without ever editing/deleting the
    // original — payment history must stay append-only.
    paymentType: {
      type: String,
      enum: ["advance", "partial", "final", "refund"],
      required: true,
    },
    // Set only on a "refund" record — points back at the payment it reverses.
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
    // Which employee logged this payment — for accountability and dispute resolution
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
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

// All payments for an order (used to calculate Order.paymentStatus)
paymentSchema.index({ orderId: 1 });

// Financial reports: payments in a date range for a tenant
paymentSchema.index({ tenantId: 1, paymentDate: 1 });

// Revenue breakdown by method (e.g., "how much via Easypaisa this month?")
paymentSchema.index({ tenantId: 1, method: 1 });

export default mongoose.model("Payment", paymentSchema);
