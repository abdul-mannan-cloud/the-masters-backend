import mongoose from "mongoose";
import { PERMISSION_MODULES } from "../utils/permissions.js";

const moduleActionsSchema = new mongoose.Schema(
  {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false },
);

// One field per PERMISSION_MODULES entry, generated programmatically so the
// schema always stays in sync with utils/permissions.js.
const permissionsSchema = new mongoose.Schema(
  Object.fromEntries(
    PERMISSION_MODULES.map((module) => [
      module,
      { type: moduleActionsSchema, default: () => ({}) },
    ]),
  ),
  { _id: false },
);

const roleSchema = new mongoose.Schema(
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
    description: {
      type: String,
      trim: true,
    },
    permissions: {
      type: permissionsSchema,
      default: () => ({}),
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

// Role names are unique per tenant (e.g. two tenants can each have "Tailor")
roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
roleSchema.index({ tenantId: 1 });

export default mongoose.model("Role", roleSchema);
