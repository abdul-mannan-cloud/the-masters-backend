import * as OrderService from "../Services/OrderService.js";
import * as OrderItemService from "../Services/OrderItemService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";
import hasPermission from "../utils/hasPermission.js";

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

// Two shapes share this one endpoint: a bare `{ customerId, ... }` body
// creates an empty order shell (legacy path, items added afterward); a body
// that also includes a non-empty `items[]` is the "rich" flow — builds the
// order and every OrderItem (optionally capturing new measurements first) in
// one transaction, the same atomic pattern CustomerService.createCustomer
// uses for a brand-new customer, now available for an existing one too (see
// OrderItemService.createOrderForCustomer).
export const createOrder = async (req, res) => {
  try {
    const { customerId, items } = req.body;

    if (Array.isArray(items) && items.length > 0) {
      if (!customerId) {
        throw new AppError("customerId is required", 400);
      }
      // Overriding a garment's price is an "orders.update"-level capability,
      // not "orders.create" — check it once here rather than trusting
      // whatever the client sends (same rule CustomerController applies).
      const canAdjustPrice = await hasPermission(req.user, "orders", "update");
      const order = await OrderItemService.createOrderForCustomer(
        req.user.tenantId,
        customerId,
        req.body,
        req.user.userId,
        canAdjustPrice,
      );
      return res.status(201).json({ message: "Order created successfully.", order });
    }

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
    await OrderService.deleteOrder(req.user.tenantId, id, req.user.userId);
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
