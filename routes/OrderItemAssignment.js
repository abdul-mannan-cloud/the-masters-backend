import { Router } from "express";
import {
  getAllOrderItemAssignments,
  getOrderItemAssignmentById,
  createOrderItemAssignment,
  updateOrderItemAssignment,
  deleteOrderItemAssignment,
} from "../Controllers/OrderItemAssignmentController.js";

const router = Router();

router.get("/", getAllOrderItemAssignments);
router.get("/:id", getOrderItemAssignmentById);
router.post("/", createOrderItemAssignment);
router.put("/:id", updateOrderItemAssignment);
router.delete("/:id", deleteOrderItemAssignment);

export default router;
