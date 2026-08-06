import { Router } from "express";
import {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  enrollEmployee,
  updateEmployee,
  deleteEmployee,
  getSkills,
  getMyPermissions,
  getEmployeeAssignments,
  getEmployeePerformance,
} from "../Controllers/employeeController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

// Must come before "/:id" so "skills" isn't parsed as an employee ID.
router.get("/skills", authentication(), getSkills);
// Self-service — ungated by authorize(), every authenticated user may read their own grid.
router.get("/me/permissions", authentication(), getMyPermissions);
router.get("/", authentication(), authorize("employees", "view"), getAllEmployees);
router.get("/:id", authentication(), authorize("employees", "view"), getEmployeeById);
router.post("/", authentication("tenant_admin", "manager", "employee"), authorize("employees", "create"), createEmployee);
router.post("/enroll", authentication("tenant_admin", "manager", "employee"), authorize("employees", "create"), enrollEmployee);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), authorize("employees", "update"), updateEmployee);
router.delete("/:id", authentication("tenant_admin", "manager", "employee"), authorize("employees", "delete"), deleteEmployee);
router.get(
  "/:id/assignments",
  authentication("tenant_admin", "manager", "employee"),
  authorize("employees", "view"),
  getEmployeeAssignments,
);
router.get(
  "/:id/performance",
  authentication("tenant_admin", "manager", "employee"),
  authorize("employees", "view"),
  getEmployeePerformance,
);

export default router;
