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
    paymentType: {
      type: String,
      enum: ["advance", "partial", "final"],
      required: true,
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
