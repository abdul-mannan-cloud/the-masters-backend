import { Router } from "express";
import {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../Controllers/CustomerController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("customers", "view"), getAllCustomers);
router.get("/:id", authentication(), authorize("customers", "view"), getCustomerById);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("customers", "create"), createCustomer);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("customers", "update"), updateCustomer);
router.delete("/:id", authentication("tenant_admin", "manager", "employee"), authorize("customers", "delete"), deleteCustomer);

export default router;
