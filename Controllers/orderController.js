import * as OrderService from "../Services/OrderService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllOrders = async (req, res) => {
  try {
    const { productionStatus, paymentStatus, customerId } = req.query;
    if (customerId && !isValidObjectId(customerId)) {
      throw new AppError("Invalid customerId format", 400);
    }
    const orders = await OrderService.listOrders(req.user.tenantId, {
      productionStatus,
      paymentStatus,
      customerId,
    });
    return res.status(200).json(orders);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const order = await OrderService.getOrderById(req.user.tenantId, id);
    return res.status(200).json(order);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createOrder = async (req, res) => {
  try {
    const order = await OrderService.createOrder(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res.status(201).json({ message: "Order created successfully.", order });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const order = await OrderService.updateOrder(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res.status(200).json({ message: "Order updated successfully.", order });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    await OrderService.deleteOrder(req.user.tenantId, id);
    return res.status(200).json({ message: "Order deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getBill = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const bill = await OrderService.getBill(req.user.tenantId, id);
    return res.status(200).json(bill);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getCheckout = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const checkout = await OrderService.getCheckout(req.user.tenantId, id);
    return res.status(200).json(checkout);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getOrderDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const details = await OrderService.getOrderDetails(req.user.tenantId, id);
    return res.status(200).json(details);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const confirmOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const order = await OrderService.confirmOrder(req.user.tenantId, id, req.user.userId);
    return res.status(200).json({ message: "Order confirmed successfully.", order });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const applyDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order ID format", 400);
    }
    const order = await OrderService.applyDiscount(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res.status(200).json({ message: "Discount applied successfully.", order });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
