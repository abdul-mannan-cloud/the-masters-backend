import { Router } from "express";
import {
  getAllOrderItems,
  getOrderItemById,
  createOrderItem,
  updateOrderItem,
  deleteOrderItem,
} from "../Controllers/OrderItemController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllOrderItems);
router.get("/:id", authentication(), getOrderItemById);
router.post("/", authentication("tenant_admin", "manager"), createOrderItem);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), updateOrderItem);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteOrderItem);

export default router;
