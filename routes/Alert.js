import { Router } from "express";
import {
  getAlerts,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../Controllers/AlertController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

// No authorize() module gate here on purpose — visibility is filtered
// per-category INSIDE AlertService (inventory.view/payments.view/orders.view
// + delivery assignment), not a single blanket permission. Restricted to
// tenant-scoped roles (not super_admin, which has no tenantId and no
// business data to alert on — it has its own platform-level dashboard).
router.get("/", authentication("tenant_admin", "manager", "employee"), getAlerts);
router.get(
  "/unread-count",
  authentication("tenant_admin", "manager", "employee"),
  getUnreadCount,
);
router.patch("/:id/read", authentication("tenant_admin", "manager", "employee"), markAsRead);
router.patch(
  "/read-all",
  authentication("tenant_admin", "manager", "employee"),
  markAllAsRead,
);

export default router;
