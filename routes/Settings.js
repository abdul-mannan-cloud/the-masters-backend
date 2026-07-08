import { Router } from "express";
import {
  getSettings,
  updateSettings,
} from "../Controllers/SettingsController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("settings", "view"), getSettings);
router.put("/", authentication("tenant_admin", "manager", "employee"), authorize("settings", "update"), updateSettings);

export default router;
