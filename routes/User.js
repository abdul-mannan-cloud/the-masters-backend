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

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
