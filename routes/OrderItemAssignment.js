import { Router } from "express";
import {
  getAllOrderItemAssignments,
  getOrderItemAssignmentById,
  createOrderItemAssignment,
  updateOrderItemAssignment,
  deleteOrderItemAssignment,
} from "../Controllers/OrderItemAssignmentController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllOrderItemAssignments);
router.get("/:id", authentication(), getOrderItemAssignmentById);
router.post("/", authentication("tenant_admin", "manager"), createOrderItemAssignment);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  updateOrderItemAssignment,
);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteOrderItemAssignment);

export default router;
