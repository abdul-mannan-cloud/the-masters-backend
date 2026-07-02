import * as OrderItemService from "../Services/OrderItemService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllOrderItems = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (orderId && !isValidObjectId(orderId)) {
      throw new AppError("Invalid orderId format", 400);
    }
    const items = await OrderItemService.listOrderItems(req.user.tenantId, orderId);
    return res.status(200).json(items);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getOrderItemById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order item ID format", 400);
    }
    const item = await OrderItemService.getOrderItemById(req.user.tenantId, id);
    return res.status(200).json(item);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createOrderItem = async (req, res) => {
  try {
    const item = await OrderItemService.createOrderItem(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    return res.status(201).json({ message: "Order item created successfully.", item });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateOrderItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order item ID format", 400);
    }
    const item = await OrderItemService.updateOrderItem(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res.status(200).json({ message: "Order item updated successfully.", item });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteOrderItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid order item ID format", 400);
    }
    await OrderItemService.deleteOrderItem(req.user.tenantId, id);
    return res.status(200).json({ message: "Order item deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
