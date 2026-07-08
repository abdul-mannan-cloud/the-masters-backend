import { Router } from "express";
import {
  getSuperAdminDashboard,
  getTenantOwnerDashboard,
  getEmployeeDashboard,
} from "../Controllers/DashboardController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/super-admin", authentication("super_admin"), getSuperAdminDashboard);
router.get("/tenant-owner", authentication("tenant_admin"), getTenantOwnerDashboard);
router.get(
  "/employee",
  authentication("employee", "manager"),
  authorize("dashboard", "view"),
  getEmployeeDashboard,
);

export default router;
