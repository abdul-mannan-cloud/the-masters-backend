import Employee from "../Models/Employee.js";
import AppError from "../utils/AppError.js";
import sendErrorResponse from "../utils/errorHandler.js";

// Fine-grained module/action gate, layered after authentication(...) and before
// the controller. super_admin and tenant_admin always have full implicit access
// to their own tenant's data — only "employee" (and legacy "manager") accounts
// are actually checked against their assigned Role's permissions.
const authorize = (module, action) => {
  return async (req, res, next) => {
    try {
      if (req.user.role === "super_admin" || req.user.role === "tenant_admin") {
        return next();
      }

      if (!req.user.employeeId) {
        throw new AppError("No employee profile linked to this account", 403);
      }

      const employee = await Employee.findOne({
        _id: req.user.employeeId,
        tenantId: req.user.tenantId,
        isDeleted: false,
      }).populate("roleId");

      if (!employee || !employee.roleId) {
        throw new AppError("No role assigned — contact your business owner", 403);
      }

      if (!employee.roleId.permissions?.[module]?.[action]) {
        throw new AppError(
          `Access denied — you do not have permission to ${action} ${module}`,
          403,
        );
      }

      next();
    } catch (err) {
      return sendErrorResponse(res, err);
    }
  };
};

export default authorize;
