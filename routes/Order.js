import { Router } from "express";
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
} from "../Controllers/OrderController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("orders", "view"), getAllOrders);
router.get("/:id", authentication(), authorize("orders", "view"), getOrderById);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("orders", "create"), createOrder);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("orders", "update"), updateOrder);
// Order deletion cascades to OrderItems/Assignments/Payments — kept tenant_admin-only
// regardless of Role permissions, same intentionally stricter policy as before this feature.
router.delete("/:id", authentication("tenant_admin"), authorize("orders", "delete"), deleteOrder);

export default router;
