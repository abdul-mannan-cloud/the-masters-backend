import { Router } from "express";
import {
  getAllMeasurements,
  getMeasurementById,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement,
} from "../Controllers/MeasurementController.js";
import authentication from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", authentication(), authorize("measurements", "view"), getAllMeasurements);
router.get("/:id", authentication(), authorize("measurements", "view"), getMeasurementById);
router.post(
  "/",
  authentication("tenant_admin", "manager", "employee"),
  authorize("measurements", "create"),
  createMeasurement,
);
router.put(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("measurements", "update"),
  updateMeasurement,
);
router.delete(
  "/:id",
  authentication("tenant_admin", "manager", "employee"),
  authorize("measurements", "delete"),
  deleteMeasurement,
);

export default router;
