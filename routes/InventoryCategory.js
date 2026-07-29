import { Router } from "express";
import {
  getAllCategories,
  getCategoryById,
  getCategoryPath,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../Controllers/InventoryCategoryController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

// Categories are governed by the same "inventory" permission module as
// Inventory items themselves — there's no separate module for the tree
// structure, matching how OrderItem shares the "orders" module with Order.
router.get("/", authentication(), authorize("inventory", "view"), getAllCategories);
router.get("/:id", authentication(), authorize("inventory", "view"), getCategoryById);
router.get("/:id/path", authentication(), authorize("inventory", "view"), getCategoryPath);
router.post(
  "/",
  authentication("tenant_admin", "manager", "employee"),
  authorize("inventory", "create"),
  createCategory,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("inventory", "update"),
  updateCategory,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager"),
  authorize("inventory", "delete"),
  deleteCategory,
);

export default router;
