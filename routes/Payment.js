import { Router } from "express";
import {
  getAllPayments,
  getPaymentHistory,
  getPaymentById,
  addPayment,
  updatePayment,
  reversePayment,
} from "../Controllers/PaymentController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("payments", "view"), getAllPayments);
// Must come before "/:id" so "history" isn't parsed as a payment ID.
router.get("/history", authentication(), authorize("payments", "view"), getPaymentHistory);
router.get("/:id", authentication(), authorize("payments", "view"), getPaymentById);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("payments", "create"), addPayment);
// Payments are immutable — this only ever accepts a notes correction (see
// PaymentService.updatePayment). Amount/method/type/date changes are rejected.
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("payments", "update"), updatePayment);
// The only way to "undo" a payment — records a new reversal, never deletes.
router.post(
  "/:id/reverse",
  authentication("tenant_admin", "manager"),
  authorize("payments", "create"),
  reversePayment,
);

export default router;
