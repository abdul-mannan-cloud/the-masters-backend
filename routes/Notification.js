import { Router } from "express";
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../Controllers/NotificationController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllNotifications);
router.get("/:id", authentication(), getNotificationById);
router.post("/", authentication("tenant_admin", "manager"), createNotification);
router.put("/:id", authentication("tenant_admin", "manager"), updateNotification);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteNotification);

export default router;
