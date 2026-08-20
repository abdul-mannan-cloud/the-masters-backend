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

export const bulkAssignEmployees = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const { assignments } = req.body;
    const result = await OrderItemAssignmentService.bulkAssignEmployees(
      req.user.tenantId,
      orderId,
      assignments,
      req.user.userId,
    );
    return res.status(201).json({
      message: result.statusChanged
        ? "Employees assigned — order moved to In Progress."
        : "Employees assigned successfully.",
      ...result,
    });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

// Self-service — no orders.update permission required, only that the caller
// is updating their OWN assignment (see updateMyAssignmentStatus).
export const updateMyAssignmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid assignment ID format", 400);
    }
    if (!req.user.employeeId) {
      throw new AppError("No employee profile linked to this account", 403);
    }
    const { status } = req.body;
    const assignment = await OrderItemAssignmentService.updateMyAssignmentStatus(
      req.user.tenantId,
      req.user.employeeId,
      id,
      status,
      req.user.userId,
    );
    return res.status(200).json({ message: "Status updated successfully.", assignment });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
