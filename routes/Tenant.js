import { Router } from "express";
import {
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  suspendTenant,
  activateTenant,
  getTenantStats,
} from "../Controllers/TenantController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

// Fine-grained super_admin-vs-own-tenant checks happen inside the controller,
// so every route here just requires *some* authenticated user.
router.get("/", authentication(), getAllTenants);
router.get("/:id", authentication(), getTenantById);
router.post("/", authentication("super_admin"), createTenant);
router.put("/:id", authentication(), updateTenant);
router.delete("/:id", authentication("super_admin"), deleteTenant);
router.patch("/:id/suspend", authentication("super_admin"), suspendTenant);
router.patch("/:id/activate", authentication("super_admin"), activateTenant);
router.get("/:id/stats", authentication(), getTenantStats);

export default router;
