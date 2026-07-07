import { Router } from "express";
import {
  getAllProductTypes,
  getProductTypeById,
  createProductType,
  updateProductType,
  toggleProductTypeStatus,
  deleteProductType,
} from "../Controllers/ProductTypeController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllProductTypes);
router.get("/:id", authentication(), getProductTypeById);
router.post("/", authentication("tenant_admin", "manager"), createProductType);
router.put("/:id", authentication("tenant_admin", "manager"), updateProductType);
router.patch("/:id/status", authentication("tenant_admin", "manager"), toggleProductTypeStatus);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteProductType);

export default router;
