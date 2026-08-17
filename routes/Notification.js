import { Router } from "express";
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  sendPendingNotification,
  cancelPendingNotification,
  resendNotification,
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

// Human-in-the-loop actions on a pending_confirmation notification — gated
// the same way the generic PUT above is ("update" on "notifications"), so a
// business's existing Role configuration already covers this correctly
// without needing a new permission dimension added to the Roles UI.
router.post(
  "/:id/send",
  authentication("tenant_admin", "manager", "employee"),
  authorize("notifications", "update"),
  sendPendingNotification,
);
router.post(
  "/:id/cancel",
  authentication("tenant_admin", "manager", "employee"),
  authorize("notifications", "update"),
  cancelPendingNotification,
);
router.post(
  "/:id/resend",
  authentication("tenant_admin", "manager", "employee"),
  authorize("notifications", "update"),
  resendNotification,
);

export default router;
