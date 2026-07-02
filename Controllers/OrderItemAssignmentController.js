import * as OrderItemAssignmentService from "../Services/OrderItemAssignmentService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllOrderItemAssignments = async (req, res) => {
  try {
    const { orderItemId, employeeId } = req.query;
    if (orderItemId && !isValidObjectId(orderItemId)) {
      throw new AppError("Invalid orderItemId format", 400);
    }
    if (employeeId && !isValidObjectId(employeeId)) {
      throw new AppError("Invalid employeeId format", 400);
    }
    const assignments = await OrderItemAssignmentService.listOrderItemAssignments(
      req.user.tenantId,
      orderItemId,
      employeeId,
    );
    return res.status(200).json(assignments);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getOrderItemAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid assignment ID format", 400);
    }
    const assignment = await OrderItemAssignmentService.getOrderItemAssignmentById(
      req.user.tenantId,
      id,
    );
    return res.status(200).json(assignment);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createOrderItemAssignment = async (req, res) => {
  try {
    const assignment = await OrderItemAssignmentService.createOrderItemAssignment(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res
      .status(201)
      .json({ message: "Assignment created successfully.", assignment });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateOrderItemAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid assignment ID format", 400);
    }
    const assignment = await OrderItemAssignmentService.updateOrderItemAssignment(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Assignment updated successfully.", assignment });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteOrderItemAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid assignment ID format", 400);
    }
    await OrderItemAssignmentService.deleteOrderItemAssignment(req.user.tenantId, id);
    return res.status(200).json({ message: "Assignment deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
