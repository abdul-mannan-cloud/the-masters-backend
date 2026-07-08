import Role from "../Models/Role.js";
import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";
import { PERMISSION_MODULES, PERMISSION_ACTIONS, buildPermissionsObject } from "../utils/permissions.js";

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Role names are unique per tenant only. excludeId lets updates ignore the
// document's own name.
const assertUniqueName = async (tenantId, name, excludeId) => {
  const query = {
    tenantId,
    name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" },
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Role.findOne(query);
  if (existing) {
    throw new AppError("A role with this name already exists", 409);
  }
};

// The Role Form always submits the complete 9-module x 4-action grid, but this
// stays defensive against partial input: unknown module/action names are
// rejected outright, and any module/action missing from the input just falls
// back to `false` rather than being silently dropped.
const sanitizePermissions = (permissions) => {
  if (permissions === undefined) return buildPermissionsObject(false);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    throw new AppError("permissions must be an object", 400);
  }

  const unknownModules = Object.keys(permissions).filter(
    (module) => !PERMISSION_MODULES.includes(module),
  );
  if (unknownModules.length) {
    throw new AppError(`Unknown permission module(s): ${unknownModules.join(", ")}`, 400);
  }

  const sanitized = buildPermissionsObject(false);
  for (const module of PERMISSION_MODULES) {
    const moduleActions = permissions[module];
    if (moduleActions === undefined) continue;
    if (typeof moduleActions !== "object" || moduleActions === null) {
      throw new AppError(`permissions.${module} must be an object`, 400);
    }

    const unknownActions = Object.keys(moduleActions).filter(
      (action) => !PERMISSION_ACTIONS.includes(action),
    );
    if (unknownActions.length) {
      throw new AppError(
        `Unknown permission action(s) on ${module}: ${unknownActions.join(", ")}`,
        400,
      );
    }

    for (const action of PERMISSION_ACTIONS) {
      if (moduleActions[action] === undefined) continue;
      if (typeof moduleActions[action] !== "boolean") {
        throw new AppError(`permissions.${module}.${action} must be a boolean`, 400);
      }
      sanitized[module][action] = moduleActions[action];
    }
  }

  return sanitized;
};

export const listRoles = async (tenantId) => {
  return Role.find({ tenantId }).sort({ createdAt: -1 });
};

export const getRoleById = async (tenantId, id) => {
  const role = await Role.findOne({ _id: id, tenantId });
  if (!role) throw new AppError("Role not found", 404);
  return role;
};

export const createRole = async (tenantId, data, userId) => {
  const { name, description } = data;

  if (!name) {
    throw new AppError("name is required", 400);
  }
  await assertUniqueName(tenantId, name);
  const permissions = sanitizePermissions(data.permissions);

  return Role.create({
    tenantId,
    name,
    description,
    permissions,
    createdBy: userId,
    updatedBy: userId,
  });
};

export const updateRole = async (tenantId, id, data, userId) => {
  const updates = { updatedBy: userId };

  if (data.name !== undefined) {
    await assertUniqueName(tenantId, data.name, id);
    updates.name = data.name;
  }
  if (data.description !== undefined) {
    updates.description = data.description;
  }
  if (data.permissions !== undefined) {
    // Full sub-document replace — Mongoose assigns the whole nested object,
    // it does not deep-merge with the existing stored permissions.
    updates.permissions = sanitizePermissions(data.permissions);
  }

  const role = await Role.findOneAndUpdate({ _id: id, tenantId }, updates, {
    new: true,
    runValidators: true,
  });
  if (!role) throw new AppError("Role not found", 404);
  return role;
};

export const deleteRole = async (tenantId, id) => {
  const role = await Role.findOne({ _id: id, tenantId });
  if (!role) throw new AppError("Role not found", 404);

  const inUseCount = await Employee.countDocuments({
    tenantId,
    roleId: id,
    isDeleted: false,
  });
  if (inUseCount > 0) {
    throw new AppError(
      `Cannot delete role — ${inUseCount} employee(s) are still assigned to it`,
      409,
    );
  }

  await role.deleteOne();
  return role;
};
