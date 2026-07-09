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
import upload from "../middlewares/uploadMiddleware.js";

const router = Router();

router.post("/signup", upload.single("logo"), signup);
router.post("/login", login);
router.get("/", authentication("super_admin", "tenant_admin"), getAllUsers);
router.get("/:id", authentication(), getUserById);
router.post("/", authentication("super_admin", "tenant_admin"), createUser);
router.put("/:id", authentication("super_admin", "tenant_admin"), updateUser);
router.delete("/:id", authentication("super_admin", "tenant_admin"), deleteUser);

export default router;
