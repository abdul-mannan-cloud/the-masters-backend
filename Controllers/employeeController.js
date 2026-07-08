import * as EmployeeService from "../Services/EmployeeService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";
import EMPLOYEE_SKILLS from "../utils/skills.js";

// Backs dropdowns (e.g. ProductType workflow's "Required Skill") that must
// stay in sync with the Employee.skills enum without hardcoding it on the frontend.
export const getSkills = async (req, res) => {
  try {
    return res.status(200).json(EMPLOYEE_SKILLS);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

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

// Enrolls a new employee: creates the Employee profile and grants portal
// access (a User with role "employee") together in one request.
export const enrollEmployee = async (req, res) => {
  try {
    const result = await EmployeeService.enrollEmployee(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res
      .status(201)
      .json({ message: "Employee enrolled successfully.", ...result });
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

// Self-service — lets the logged-in employee fetch their own Role/permissions
// (backs the frontend Sidebar/AuthContext), distinct from authorize() which
// enforces access on protected routes.
export const getMyPermissions = async (req, res) => {
  try {
    if (!req.user.employeeId) {
      return res.status(200).json({ roleId: null, roleName: null, permissions: null });
    }
    const result = await EmployeeService.getMyPermissions(req.user.tenantId, req.user.employeeId);
    return res.status(200).json(result);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getEmployeeAssignments = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid employee ID format", 400);
    }
    const assignments = await EmployeeService.getEmployeeAssignments(req.user.tenantId, id);
    return res.status(200).json(assignments);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getEmployeePerformance = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid employee ID format", 400);
    }
    const performance = await EmployeeService.getEmployeePerformance(req.user.tenantId, id);
    return res.status(200).json(performance);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
