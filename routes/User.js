import { Router } from "express";
import {
  signup,
  login,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "../Controllers/UserController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = Router();

router.post("/signup", upload.single("logo"), signup);
router.post("/login", login);
// Lets an employee/manager with employees.view permission list portal
// accounts too (e.g. the Employees list's "Portal Access" badge) — same
// reasoning as GET /:id below, just missed when that one was fixed.
router.get("/", authentication(), authorize("employees", "view"), getAllUsers);
// Lets an employee/manager with employees.view permission look up the login
// account linked to a coworker's Employee profile (e.g. "portal access" panel).
router.get("/:id", authentication(), authorize("employees", "view"), getUserById);
router.post("/", authentication("super_admin", "tenant_admin"), createUser);
router.put("/:id", authentication("super_admin", "tenant_admin"), updateUser);
router.delete("/:id", authentication("super_admin", "tenant_admin"), deleteUser);

export default router;
