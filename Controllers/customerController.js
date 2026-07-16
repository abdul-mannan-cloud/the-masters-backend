import * as CustomerService from "../Services/CustomerService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllCustomers = async (req, res) => {
  try {
    const customers = await CustomerService.listCustomers(req.user.tenantId);
    return res.status(200).json(customers);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid customer ID format", 400);
    }
    const customer = await CustomerService.getCustomerById(
      req.user.tenantId,
      id,
    );
    return res.status(200).json(customer);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createCustomer = async (req, res) => {
  try {
    const { customer } = await CustomerService.createCustomer(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res.status(201).json({
      message: "Customer created successfully.",
      customer,
    });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid customer ID format", 400);
    }
    const customer = await CustomerService.updateCustomer(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res
      .status(200)
      .json({ message: "Customer updated successfully.", customer });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid customer ID format", 400);
    }
    await CustomerService.deleteCustomer(req.user.tenantId, id, req.user.userId);
    return res.status(200).json({ message: "Customer deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
