import { Router } from "express";
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
} from "../Controllers/NotificationController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("notifications", "view"), getAllNotifications);
router.get("/:id", authentication(), authorize("notifications", "view"), getNotificationById);
router.post(
  "/",
  authentication("tenant_admin", "manager", "employee"),
  authorize("notifications", "create"),
  createNotification,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("notifications", "update"),
  updateNotification,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("notifications", "delete"),
  deleteNotification,
);

export default router;
