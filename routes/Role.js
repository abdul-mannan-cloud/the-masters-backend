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
router.get("/", authentication(), getAllRoles);
router.get("/:id", authentication(), getRoleById);
router.post("/", authentication("tenant_admin"), createRole);
router.put("/:id", authentication("tenant_admin"), updateRole);
router.delete("/:id", authentication("tenant_admin"), deleteRole);

export default router;
