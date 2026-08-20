import { Router } from "express";
import {
  getAllOrderItemAssignments,
  getOrderItemAssignmentById,
  createOrderItemAssignment,
  updateOrderItemAssignment,
  deleteOrderItemAssignment,
  syncOrderAssignments,
  updateMyAssignmentStatus,
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
// "Assign Employees" on an order — a flat employeeIds list, reconciled
// (added/removed) against whoever is currently assigned, auto-advancing
// pending -> in_progress. Gated the same as any other order-management write
// (orders.update): the Owner/tenant_admin always passes, an Employee only if
// explicitly granted — satisfies "regular employee cannot assign unless
// given permission". PUT, not POST — this sets the order's full assignment
// roster rather than appending, so it's idempotent to resend.
router.put(
  "/order/:orderId/assign",
  authentication("tenant_admin", "manager", "employee"),
  authorize("orders", "update"),
  syncOrderAssignments,
);
// Self-service — an employee reports progress on their OWN assigned step.
// Deliberately NOT behind authorize("orders","update"): a view-only employee
// with no order-editing rights can still mark their own task in progress/done
// (see updateMyAssignmentStatus's ownership + forward-only checks).
router.patch(
  "/:id/my-status",
  authentication("tenant_admin", "manager", "employee"),
  updateMyAssignmentStatus,
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
