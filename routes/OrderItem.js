import { Router } from "express";
import {
  getAllOrderItems,
  getOrderItemById,
  createOrderItem,
  updateOrderItem,
  deleteOrderItem,
} from "../Controllers/OrderItemController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

// Order items live under the "orders" permission module — there's no
// separate module for them, and granting orders.create/update should mean
// the same thing whether it's the Order shell or one of its line items.
router.get("/", authentication(), authorize("orders", "view"), getAllOrderItems);
router.get("/:id", authentication(), authorize("orders", "view"), getOrderItemById);
router.post(
  "/",
  authentication("tenant_admin", "manager"),
  authorize("orders", "create"),
  createOrderItem,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  updateOrderItem,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager"),
  authorize("orders", "delete"),
  deleteOrderItem,
);

export default router;
