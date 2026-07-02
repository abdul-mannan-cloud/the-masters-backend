import { Router } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../Controllers/EmployeeController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllEmployees);
router.get("/:id", authentication(), getEmployeeById);
router.post("/", authentication("tenant_admin", "manager"), createEmployee);
router.put("/:id", authentication("tenant_admin", "manager"), updateEmployee);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteEmployee);

export default router;
