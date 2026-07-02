import { Router } from "express";
import {
  getAllMeasurements,
  getMeasurementById,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement,
} from "../Controllers/MeasurementController.js";
import authentication from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/", authentication(), getAllMeasurements);
router.get("/:id", authentication(), getMeasurementById);
router.post("/", authentication("tenant_admin", "manager", "employee"), createMeasurement);
router.put("/:id", authentication("tenant_admin", "manager", "employee"), updateMeasurement);
router.delete("/:id", authentication("tenant_admin", "manager"), deleteMeasurement);

export default router;
