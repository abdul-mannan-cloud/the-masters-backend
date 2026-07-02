import { Router } from "express";
import {
  getSettings,
  updateSettings,
} from "../Controllers/SettingsController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getSettings);
router.put("/", authentication("tenant_admin", "manager"), updateSettings);

export default router;
