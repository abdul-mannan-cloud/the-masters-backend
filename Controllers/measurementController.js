import * as MeasurementService from "../Services/MeasurementService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllMeasurements = async (req, res) => {
  try {
    const { customerId } = req.query;
    if (customerId && !isValidObjectId(customerId)) {
      throw new AppError("Invalid customerId format", 400);
    }
    const measurements = await MeasurementService.listMeasurements(
      req.user.tenantId,
      customerId,
    );
    return res.status(200).json(measurements);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getMeasurementById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid measurement ID format", 400);
    }
    const measurement = await MeasurementService.getMeasurementById(
      req.user.tenantId,
      id,
    );
    return res.status(200).json(measurement);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createMeasurement = async (req, res) => {
  try {
    const measurement = await MeasurementService.createMeasurement(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res
      .status(201)
      .json({ message: "Measurement created successfully.", measurement });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateMeasurement = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid measurement ID format", 400);
    }
    const measurement = await MeasurementService.updateMeasurement(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Measurement updated successfully.", measurement });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteMeasurement = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid measurement ID format", 400);
    }
    await MeasurementService.deleteMeasurement(req.user.tenantId, id);
    return res.status(200).json({ message: "Measurement deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
