import * as DashboardService from "../Services/DashboardService.js";
import * as EmployeeService from "../Services/EmployeeService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import AppError from "../utils/AppError.js";

export const getSuperAdminDashboard = async (req, res) => {
  try {
    const stats = await DashboardService.getSuperAdminStats();
    return res.status(200).json(stats);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getTenantOwnerDashboard = async (req, res) => {
  try {
    const stats = await DashboardService.getTenantOwnerStats(req.user.tenantId);
    return res.status(200).json(stats);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getEmployeeDashboard = async (req, res) => {
  try {
    if (!req.user.employeeId) {
      throw new AppError("No employee profile linked to this account", 403);
    }
    const [stats, permissions] = await Promise.all([
      DashboardService.getEmployeeStats(req.user.tenantId, req.user.employeeId),
      EmployeeService.getMyPermissions(req.user.tenantId, req.user.employeeId),
    ]);
    return res.status(200).json({ ...stats, ...permissions });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
