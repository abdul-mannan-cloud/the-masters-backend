import { Router } from "express";
import {
  getAllProductTypes,
  getProductTypeById,
  createProductType,
  updateProductType,
  deleteProductType,
} from "../Controllers/ProductTypeController.js";

const router = Router();

router.get("/", getAllProductTypes);
router.get("/:id", getProductTypeById);
router.post("/", createProductType);
router.put("/:id", updateProductType);
router.delete("/:id", deleteProductType);

export default router;
