import { Router } from "express";
import {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getPermissionModules,
} from "../Controllers/RoleController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

// Must come before "/:id" so "permission-modules" isn't parsed as a role ID.
router.get("/permission-modules", authentication(), getPermissionModules);
// Reading the role list/detail is part of employee management (assigning a
// role to an employee, or showing an employee's role name), so it's allowed
// for anyone with employees.view — same reasoning as /admin's GET routes.
// Creating/editing/deleting a Role's actual permission grid stays
// tenant_admin-only below; employees otherwise get their own grid via
// /employee/me/permissions.
router.get("/", authentication(), authorize("employees", "view"), getAllRoles);
router.get("/:id", authentication(), authorize("employees", "view"), getRoleById);
router.post("/", authentication("tenant_admin"), createRole);
router.put("/:id", authentication("tenant_admin"), updateRole);
router.delete("/:id", authentication("tenant_admin"), deleteRole);

export default router;
