import { Router } from "express";
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../Controllers/NotificationController.js";

const router = Router();

router.get("/", getAllNotifications);
router.get("/:id", getNotificationById);
router.post("/", createNotification);
router.put("/:id", updateNotification);
router.delete("/:id", deleteNotification);

export default router;
