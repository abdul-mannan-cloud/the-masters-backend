import { Router } from "express";
import {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
} from "../Controllers/PaymentController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("payments", "view"), getAllPayments);
router.get("/:id", authentication(), authorize("payments", "view"), getPaymentById);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("payments", "create"), createPayment);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("payments", "update"), updatePayment);
// Kept tenant_admin-only regardless of Role permissions, same intentionally
// stricter policy as before this feature.
router.delete("/:id", authentication("tenant_admin"), authorize("payments", "delete"), deletePayment);

export default router;
