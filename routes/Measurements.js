import { Router } from "express";
import {
  getAllMeasurements,
  getMeasurementById,
  createMeasurement,
  updateMeasurement,
  deleteMeasurement,
} from "../Controllers/MeasurementController.js";

const router = Router();

router.get("/", getAllMeasurements);
router.get("/:id", getMeasurementById);
router.post("/", createMeasurement);
router.put("/:id", updateMeasurement);
router.delete("/:id", deleteMeasurement);

export default router;
