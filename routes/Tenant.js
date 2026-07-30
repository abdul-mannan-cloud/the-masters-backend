import { Router } from "express";
import {
  getAllTenants,
  getTenantBySlug,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  suspendTenant,
  activateTenant,
  getTenantStats,
} from "../Controllers/TenantController.js";
import authentication from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = Router();

// Public — resolves a subdomain to a tenant for the login page, before any
// session exists. Two path segments, so no ordering conflict with "/:id"
// below regardless of declaration order — kept first for readability only.
router.get("/by-slug/:slug", getTenantBySlug);

// Fine-grained super_admin-vs-own-tenant checks happen inside the controller,
// so every route here just requires *some* authenticated user.
router.get("/", authentication(), getAllTenants);
router.get("/:id", authentication(), getTenantById);
router.post(
  "/",
  authentication("super_admin"),
  upload.single("logo"),
  createTenant,
);
router.put("/:id", authentication(), upload.single("logo"), updateTenant);
router.delete("/:id", authentication("super_admin"), deleteTenant);
router.patch("/:id/suspend", authentication("super_admin"), suspendTenant);
router.patch("/:id/activate", authentication("super_admin"), activateTenant);
router.get("/:id/stats", authentication(), getTenantStats);

export default router;
