import mongoose from "mongoose";

// Snapshot of the workflow step at assignment time
const workflowStepSnapshotSchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true },
    step: { type: String, required: true },
    requiredSkill: { type: String, required: true },
  },
  { _id: false },
);

const orderItemAssignmentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderItem",
      required: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    // Snapshot of the workflow step — immutable after creation
    workflowStep: {
      type: workflowStepSnapshotSchema,
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "reassigned"],
      default: "pending",
    },
    // Optional notes from the employee or manager about this step
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

// Load all workflow assignments for a single garment (order item detail view)
orderItemAssignmentSchema.index({ orderItemId: 1 });

// Employee work queue: "show me all active tasks for employee X in tenant Y"
orderItemAssignmentSchema.index({ tenantId: 1, employeeId: 1, status: 1 });

// Prevent duplicate active assignments for the same step on the same item
// Note: to reassign, set old assignment status to 'reassigned' first, then create new
orderItemAssignmentSchema.index(
  { orderItemId: 1, "workflowStep.sequence": 1 },
  { unique: true },
);

export default mongoose.model("OrderItemAssignment", orderItemAssignmentSchema);
