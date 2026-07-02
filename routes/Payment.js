import { Router } from "express";
import {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
} from "../Controllers/PaymentController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllPayments);
router.get("/:id", authentication(), getPaymentById);
router.post("/", authentication("tenant_admin", "manager"), createPayment);
router.put("/:id", authentication("tenant_admin", "manager"), updatePayment);
router.delete("/:id", authentication("tenant_admin"), deletePayment);

export default router;
