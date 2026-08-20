import mongoose from "mongoose";

// Materialized business alerts — regenerated (upserted) on every read rather
// than pushed by a background job, so there's never a stale "resolved but
// still showing" alert and no scheduler infrastructure is needed. The
// natural key below is what makes regeneration idempotent: recomputing the
// same live condition twice updates the same document instead of creating a
// duplicate (see AlertService.generateAlerts).
const alertSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    type: {
      type: String,
      enum: ["inventory", "delivery", "payment"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    relatedEntityType: {
      type: String,
      enum: ["Inventory", "Order"],
      required: true,
    },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Natural key — one live alert per (tenant, category, entity). Regenerating
// upserts this same row instead of creating a duplicate.
alertSchema.index(
  { tenantId: 1, type: 1, relatedEntityType: 1, relatedEntityId: 1 },
  { unique: true },
);

// Tenant's alert feed, unread-first
alertSchema.index({ tenantId: 1, isRead: 1, createdAt: -1 });

export default mongoose.model("Alert", alertSchema);
