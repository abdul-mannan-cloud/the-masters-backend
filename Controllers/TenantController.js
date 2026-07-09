import * as TenantService from "../Services/TenantService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

// Tenant is the top-level entity, so it has no tenantId of its own.
// super_admin may act on any tenant; tenant_admin may only act on their own.
const assertOwnTenantOrSuperAdmin = (req, id) => {
  if (req.user.role === "super_admin") return;
  if (String(req.user.tenantId) !== String(id)) {
    throw new AppError("Access denied for this tenant", 403);
  }
};

export const getAllTenants = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") {
      throw new AppError("Access denied, insufficient permissions", 403);
    }
    const { page, limit, search, status, plan } = req.query;
    const result = await TenantService.listTenants({ page, limit, search, status, plan });
    return res.status(200).json(result);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getTenantById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    assertOwnTenantOrSuperAdmin(req, id);

    const tenant = await TenantService.getTenantById(id);
    return res.status(200).json(tenant);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createTenant = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") {
      throw new AppError("Access denied, insufficient permissions", 403);
    }
    const logo = req.file ? req.file.path : undefined;
    const { tenant, admin } = await TenantService.createTenant(
      { ...req.body, ...(logo && { logo }) },
      req.user.userId,
    );
    return res
      .status(201)
      .json({ message: "Tenant created successfully.", tenant, admin });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    assertOwnTenantOrSuperAdmin(req, id);

    // Only super_admin may change plan/status — a tenant_admin managing their
    // own tenant shouldn't be able to upgrade their own plan or unsuspend themselves.
    if (
      req.user.role !== "super_admin" &&
      (req.body.plan !== undefined || req.body.status !== undefined)
    ) {
      throw new AppError("Access denied, insufficient permissions", 403);
    }

    const logo = req.file ? req.file.path : undefined;
    const tenant = await TenantService.updateTenant(
      id,
      { ...req.body, ...(logo && { logo }) },
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Tenant updated successfully.", tenant });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteTenant = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") {
      throw new AppError("Access denied, insufficient permissions", 403);
    }
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid tenant ID format", 400);
    }

    await TenantService.deleteTenant(id, req.user.userId);
    return res.status(200).json({ message: "Tenant deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const suspendTenant = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") {
      throw new AppError("Access denied, insufficient permissions", 403);
    }
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    const tenant = await TenantService.suspendTenant(id, req.user.userId);
    return res.status(200).json({ message: "Tenant suspended successfully.", tenant });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const activateTenant = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") {
      throw new AppError("Access denied, insufficient permissions", 403);
    }
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    const tenant = await TenantService.activateTenant(id, req.user.userId);
    return res.status(200).json({ message: "Tenant activated successfully.", tenant });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getTenantStats = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    assertOwnTenantOrSuperAdmin(req, id);

    const stats = await TenantService.getTenantStats(id);
    return res.status(200).json(stats);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
