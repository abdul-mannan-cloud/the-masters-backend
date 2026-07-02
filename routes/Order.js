import { Router } from "express";
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
} from "../Controllers/OrderController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllOrders);
router.get("/:id", authentication(), getOrderById);
router.post("/", authentication("tenant_admin", "manager"), createOrder);
router.put("/:id", authentication("tenant_admin", "manager"), updateOrder);
router.delete("/:id", authentication("tenant_admin"), deleteOrder);

export default router;
