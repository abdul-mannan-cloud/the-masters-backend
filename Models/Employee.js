import mongoose from "mongoose";
import EMPLOYEE_SKILLS from "../utils/skills.js";

const employeeSchema = new mongoose.Schema(
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
    cnic: {
      type: String,
      trim: true,
      // Unique per tenant, not globally — CNIC uniqueness is only meaningful
      // within one business's records
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
    // Array of skills — what this employee is capable of doing
    // Used for assignment suggestions and workflow validation
    skills: {
      type: [String],
      enum: EMPLOYEE_SKILLS,
      default: [],
    },
    // Salary amount — application logic decides if this is monthly or per-item
    salary: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Most common query: all employees for a given shop
employeeSchema.index({ tenantId: 1 });

// Assignment suggestions: "which employees can do Cutting for this tenant?"
employeeSchema.index({ tenantId: 1, skills: 1 });

// CNIC uniqueness is scoped per tenant
employeeSchema.index(
  { tenantId: 1, cnic: 1 },
  { unique: true, sparse: true }, // sparse: allows multiple docs with no cnic
);

// Phone uniqueness scoped per tenant
employeeSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

export default mongoose.model("Employee", employeeSchema);
