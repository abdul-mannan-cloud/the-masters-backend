import { Router } from "express";
import {
  getAllOrderItemAssignments,
  getOrderItemAssignmentById,
  createOrderItemAssignment,
  updateOrderItemAssignment,
  deleteOrderItemAssignment,
} from "../Controllers/OrderItemAssignmentController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

// Workflow assignments live under the "orders" permission module — same
// rationale as OrderItem.js, there's no separate module for them.
router.get("/", authentication(), authorize("orders", "view"), getAllOrderItemAssignments);
router.get(
  "/:id",
  authentication(),
  authorize("orders", "view"),
  getOrderItemAssignmentById,
);
router.post(
  "/",
  authentication("tenant_admin", "manager"),
  authorize("orders", "create"),
  createOrderItemAssignment,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  updateOrderItemAssignment,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager"),
  authorize("orders", "delete"),
  deleteOrderItemAssignment,
);

export default router;
