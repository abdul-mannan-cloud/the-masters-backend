import { Router } from "express";
import {
  getAllInventory,
  getLowStockItems,
  getInventoryById,
  getInventoryTransactions,
  createInventory,
  updateInventory,
  deleteInventory,
  adjustInventory,
} from "../Controllers/InventoryController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";
import upload from "../middlewares/uploadInventoryMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("inventory", "view"), getAllInventory);
router.get("/low-stock", authentication(), authorize("inventory", "view"), getLowStockItems);
router.get("/:id", authentication(), authorize("inventory", "view"), getInventoryById);
router.get(
  "/:id/transactions",
  authentication(),
  authorize("inventory", "view"),
  getInventoryTransactions,
);
router.post(
  "/",
  authentication("tenant_admin", "manager", "employee"),
  authorize("inventory", "create"),
  upload.single("image"),
  createInventory,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("inventory", "update"),
  upload.single("image"),
  updateInventory,
);
router.patch(
  "/:id/adjust",
  authentication("tenant_admin", "manager", "employee"),
  authorize("inventory", "update"),
  adjustInventory,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager"),
  authorize("inventory", "delete"),
  deleteInventory,
);

export default router;
