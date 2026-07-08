import * as RoleService from "../Services/RoleService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "../utils/permissions.js";

// Backs the Role Form's permission grid so the frontend never hardcodes the
// module/action list — exact analogue of EmployeeController.getSkills.
export const getPermissionModules = async (req, res) => {
  try {
    return res.status(200).json({ modules: PERMISSION_MODULES, actions: PERMISSION_ACTIONS });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getAllRoles = async (req, res) => {
  try {
    const roles = await RoleService.listRoles(req.user.tenantId);
    return res.status(200).json(roles);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getRoleById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid role ID format", 400);
    }
    const role = await RoleService.getRoleById(req.user.tenantId, id);
    return res.status(200).json(role);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createRole = async (req, res) => {
  try {
    const role = await RoleService.createRole(req.user.tenantId, req.body, req.user.userId);
    return res.status(201).json({ message: "Role created successfully.", role });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid role ID format", 400);
    }
    const role = await RoleService.updateRole(req.user.tenantId, id, req.body, req.user.userId);
    return res.status(200).json({ message: "Role updated successfully.", role });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid role ID format", 400);
    }
    await RoleService.deleteRole(req.user.tenantId, id);
    return res.status(200).json({ message: "Role deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
