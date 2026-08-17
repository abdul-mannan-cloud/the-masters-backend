import { Router } from "express";
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  getBill,
  getCheckout,
  getOrderDetails,
  applyDiscount,
  confirmOrder,
} from "../Controllers/orderController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("orders", "view"), getAllOrders);
router.get("/:id", authentication(), authorize("orders", "view"), getOrderById);
router.get("/:id/bill", authentication(), authorize("orders", "view"), getBill);
router.get("/:id/checkout", authentication(), authorize("orders", "view"), getCheckout);
router.get("/:id/details", authentication(), authorize("orders", "view"), getOrderDetails);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("orders", "create"), createOrder);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("orders", "update"), updateOrder);
router.patch(
  "/:id/discount",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  applyDiscount,
);
router.patch(
  "/:id/confirm",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  confirmOrder,
);
// Order deletion cascades to OrderItems/Assignments/Payments — kept tenant_admin-only
// regardless of Role permissions, same intentionally stricter policy as before this feature.
router.delete("/:id", authentication("tenant_admin"), authorize("orders", "delete"), deleteOrder);

export default router;
