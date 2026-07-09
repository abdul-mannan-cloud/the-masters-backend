import { Router } from "express";
import {
  getSettings,
  updateSettings,
  getSettingsForTenant,
  updateSettingsForTenant,
} from "../Controllers/SettingsController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("settings", "view"), getSettings);
router.put(
  "/",
  authentication("tenant_admin", "manager", "employee"),
  authorize("settings", "update"),
  upload.single("logo"),
  updateSettings,
);

// super_admin managing a specific tenant's business profile from the Tenant view.
router.get("/tenant/:tenantId", authentication("super_admin"), getSettingsForTenant);
router.put(
  "/tenant/:tenantId",
  authentication("super_admin"),
  upload.single("logo"),
  updateSettingsForTenant,
);

export default router;
