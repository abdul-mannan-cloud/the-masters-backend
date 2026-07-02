import * as EmployeeService from "../Services/EmployeeService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllEmployees = async (req, res) => {
  try {
    const employees = await EmployeeService.listEmployees(req.user.tenantId);
    return res.status(200).json(employees);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid employee ID format", 400);
    }
    const employee = await EmployeeService.getEmployeeById(
      req.user.tenantId,
      id,
    );
    return res.status(200).json(employee);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createEmployee = async (req, res) => {
  try {
    const employee = await EmployeeService.createEmployee(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res
      .status(201)
      .json({ message: "Employee created successfully.", employee });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid employee ID format", 400);
    }
    const employee = await EmployeeService.updateEmployee(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Employee updated successfully.", employee });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid employee ID format", 400);
    }
    await EmployeeService.deleteEmployee(req.user.tenantId, id, req.user.userId);
    return res.status(200).json({ message: "Employee deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
