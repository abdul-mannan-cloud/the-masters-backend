import { Router } from "express";
import {
  getAllProductTypes,
  getProductCategories,
  getProductTypeById,
  createProductType,
  updateProductType,
  updatePreviewLayers,
  toggleProductTypeStatus,
  deleteProductType,
} from "../Controllers/ProductTypeController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";
import uploadProductPreview from "../middlewares/uploadProductPreviewMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("productTypes", "view"), getAllProductTypes);
// Must come before "/:id" so "categories" isn't parsed as a product type ID.
router.get("/categories", authentication(), getProductCategories);
router.get("/:id", authentication(), authorize("productTypes", "view"), getProductTypeById);
router.post(
  "/",
  authentication("tenant_admin", "manager", "employee"),
  authorize("productTypes", "create"),
  createProductType,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("productTypes", "update"),
  updateProductType,
);
router.put(
  "/:id/preview-layers",
  authentication("tenant_admin", "manager", "employee"),
  authorize("productTypes", "update"),
  uploadProductPreview.any(),
  updatePreviewLayers,
);
router.patch(
  "/:id/status",
  authentication("tenant_admin", "manager", "employee"),
  authorize("productTypes", "update"),
  toggleProductTypeStatus,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("productTypes", "delete"),
  deleteProductType,
);

export default router;
