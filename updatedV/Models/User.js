import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // Must be stored as a bcrypt hash — never plain text
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "tenant_admin", "manager", "employee"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      // null only for super_admin accounts
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      // null for tenant_admin accounts that are not employees
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Email must be unique within a single tenant
// (same email address can belong to users of different businesses)
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// Quick tenant-scoped user lookups
userSchema.index({ tenantId: 1, role: 1 });

export default mongoose.model("User", userSchema);
