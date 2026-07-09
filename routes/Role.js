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

const router = Router();

// Must come before "/:id" so "permission-modules" isn't parsed as a role ID.
router.get("/permission-modules", authentication(), getPermissionModules);
// Roles hold the full permission grid for the tenant — only tenant_admin
// manages/views them; employees get their own grid via /employee/me/permissions.
router.get("/", authentication("tenant_admin"), getAllRoles);
router.get("/:id", authentication("tenant_admin"), getRoleById);
router.post("/", authentication("tenant_admin"), createRole);
router.put("/:id", authentication("tenant_admin"), updateRole);
router.delete("/:id", authentication("tenant_admin"), deleteRole);

export default router;
