import Employee from "../Models/Employee.js";

// Same rule the authorize() middleware enforces per-route, exposed as a
// plain async function so a controller can make an ad-hoc permission check
// inline (e.g. "is this caller allowed to override a snapshot price") without
// needing a dedicated route/module for it.
const hasPermission = async (user, module, action) => {
  if (user.role === "super_admin" || user.role === "tenant_admin") return true;
  if (!user.employeeId) return false;

  const employee = await Employee.findOne({
    _id: user.employeeId,
    tenantId: user.tenantId,
    isDeleted: false,
  }).populate("roleId");

  if (!employee || !employee.roleId) return false;
  return Boolean(employee.roleId.permissions?.[module]?.[action]);
};

export default hasPermission;
