import { Router } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  enrollEmployee,
  updateEmployee,
  deleteEmployee,
  getSkills,
} from "../Controllers/EmployeeController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

// Must come before "/:id" so "skills" isn't parsed as an employee ID.
router.get("/skills", authentication(), getSkills);
router.get("/", authentication(), getAllEmployees);
router.get("/:id", authentication(), getEmployeeById);
router.post("/", authentication("tenant_admin", "manager"), createEmployee);
router.post("/enroll", authentication("tenant_admin", "manager"), enrollEmployee);
router.put("/:id", authentication("tenant_admin", "manager"), updateEmployee);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteEmployee);

export default router;
