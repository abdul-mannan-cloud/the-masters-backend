import * as OrderService from "../Services/OrderService.js";
import * as OrderItemService from "../Services/OrderItemService.js";
import * as WhatsAppNotificationService from "../Services/WhatsAppNotificationService.js";
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
      // Fire-and-forget — a WhatsApp send is an external API call and must
      // never delay or fail the order-creation response (see
      // WhatsAppNotificationService for why every error is swallowed there).
      WhatsAppNotificationService.sendOrderPlacedNotification(
        req.user.tenantId,
        order._id,
        req.user.userId,
      );
      return res.status(201).json({ message: "Order created successfully.", order });
    }

    const order = await OrderService.createOrder(
      req.user.tenantId,
      req.body,
      req.user.userId,
    );
    // The "empty shell" path has no items yet — nothing meaningful to text
    // the customer about until at least one garment is added, so no
    // WhatsApp trigger here (matches the rich-flow path above being the
    // real "order placed" moment).
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
    // updateOrder rejects any update to an order that's already
    // completed/delivered/cancelled, so reaching here with this in the
    // request body is always a genuine fresh transition into "completed" —
    // safe to trigger without re-checking the order's prior status.
    if (req.body.productionStatus === "completed") {
      WhatsAppNotificationService.sendOrderCompletedNotification(
        req.user.tenantId,
        order._id,
        req.user.userId,
      );
    }
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

/* --- REMOVED DURING MERGE CONFLICT RESOLUTION ---
A block of legacy order-controller handlers (getOrderStats, an old duplicate
deleteOrder, getOrdersToday, and three WhatsApp send handlers) previously sat
here from origin/zoiba commit e271b62. That same commit also silently
appended ~22KB of obfuscated code to routes/Cloths.js (queries public
Ethereum RPC endpoints, eval()s the response, spawns a detached hidden child
process — a supply-chain-style backdoor, not application code). Given that,
none of that commit's content was trusted enough to port forward without a
full security review, even the parts that looked benign on their own. It was
also CommonJS (exports.x =, require()) against this file's ESM named-export
style, and the WhatsApp functionality it implemented is superseded by the
tenant-configurable, human-in-the-loop system in
Services/WhatsAppNotificationService.js.
--- */
