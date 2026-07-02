import { Router } from "express";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../Controllers/CustomerController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllCustomers);
router.get("/:id", authentication(), getCustomerById);
router.post("/", authentication("tenant_admin", "manager"), createCustomer);
router.put("/:id", authentication("tenant_admin", "manager"), updateCustomer);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteCustomer);

export default router;
