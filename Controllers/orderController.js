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

<<<<<<< HEAD
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
=======
exports.deleteOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        // Remove order reference from customer
        await Customer.findByIdAndUpdate(
            order.customer,
            { $pull: { orders: order._id } }
        );

        await Order.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting order', error: error.message });
    }
};

exports.getOrdersToday = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const orders = await Order.find({
            date: {
                $gte: today,
                $lt: tomorrow
            }
        }).populate('customer', 'name phone')
            .populate('products')
            .sort({ date: -1 });

        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching today\'s orders', error: error.message });
    }
};

const getWhatsAppConfig = () => ({
    WA_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WA_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WA_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v25.0',
    WA_TEMPLATE_NAME: process.env.WHATSAPP_TEMPLATE_NAME || 'order_update',
    WA_TEMPLATE_LANGUAGE: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
    WA_TEMPLATE_PARAM_NAME: process.env.WHATSAPP_TEMPLATE_PARAM_NAME || 'customer_number'
});

const sendOrderUpdateTemplateForOrder = async (order, config) => {
    if (!order) return { status: 'failed', reason: 'Order not found' };
    if (!order.customer) return { status: 'failed', reason: 'Customer not found for order' };
    if (!order.customer.phone) return { status: 'failed', reason: 'Customer phone number is missing' };

    const digits = String(order.customer.phone).replace(/\D/g, '');
    if (!digits) return { status: 'failed', reason: 'Invalid customer phone number format' };
    const to = digits.startsWith('0') ? `92${digits.slice(1)}` : digits;

    const orderNumber = order.customer.orderNumber || String(order._id);
    const apiUrl = `https://graph.facebook.com/${config.WA_API_VERSION}/${config.WA_PHONE_NUMBER_ID}/messages`;
    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: config.WA_TEMPLATE_NAME,
            language: { code: config.WA_TEMPLATE_LANGUAGE },
            components: [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', parameter_name: config.WA_TEMPLATE_PARAM_NAME, text: String(orderNumber) }
                    ]
                }
            ]
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.WA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            return { status: 'failed', reason: 'WhatsApp API error', error: data, httpStatus: response.status, to, orderNumber };
        }
        const messageId = data?.messages?.[0]?.id || null;
        order.whatsappUpdateSent = true;
        order.whatsappUpdateSentAt = new Date();
        if (messageId) order.whatsappMessageId = messageId;
        await order.save();
        return { status: 'sent', to, orderNumber, whatsappMessageId: messageId, whatsappResponse: data };
    } catch (err) {
        return { status: 'failed', reason: err.message };
    }
};

const requireWhatsAppConfig = (res) => {
    const config = getWhatsAppConfig();
    if (!config.WA_TOKEN || !config.WA_PHONE_NUMBER_ID) {
        res.status(500).json({
            message: 'WhatsApp API is not configured',
            missing: [
                !config.WA_TOKEN ? 'WHATSAPP_ACCESS_TOKEN' : null,
                !config.WA_PHONE_NUMBER_ID ? 'WHATSAPP_PHONE_NUMBER_ID' : null
            ].filter(Boolean)
        });
        return null;
    }
    return config;
};

exports.sendOrderUpdateWhatsApp = async (req, res) => {
    try {
        const { id } = req.params;
        const config = requireWhatsAppConfig(res);
        if (!config) return;

        const order = await Order.findById(id).populate('customer');
        if (!order) return res.status(404).json({ message: 'Order not found' });

        const result = await sendOrderUpdateTemplateForOrder(order, config);
        if (result.status === 'failed') {
            return res.status(result.httpStatus || 400).json({
                message: 'Failed to send WhatsApp message',
                reason: result.reason,
                error: result.error
            });
        }

        return res.status(200).json({
            message: 'WhatsApp message sent successfully',
            to: result.to,
            orderNumber: result.orderNumber,
            orderId: order._id,
            whatsappMessageId: result.whatsappMessageId,
            whatsappUpdateSentAt: order.whatsappUpdateSentAt,
            whatsappResponse: result.whatsappResponse
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error sending WhatsApp message', error: error.message });
    }
};

exports.bulkSendOrderUpdateWhatsApp = async (req, res) => {
    try {
        const { orderIds } = req.body || {};

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ message: 'orderIds must be a non-empty array' });
        }

        const config = requireWhatsAppConfig(res);
        if (!config) return;

        const orders = await Order.find({ _id: { $in: orderIds } }).populate('customer');
        const ordersById = new Map(orders.map(o => [String(o._id), o]));

        const results = await Promise.all(orderIds.map(async (orderId) => {
            const order = ordersById.get(String(orderId));
            const result = await sendOrderUpdateTemplateForOrder(order, config);
            return { orderId, ...result };
        }));

        const sent = results.filter(r => r.status === 'sent');
        const failed = results.filter(r => r.status === 'failed');

        return res.status(200).json({
            message: `Bulk WhatsApp send complete: ${sent.length} sent, ${failed.length} failed`,
            totalRequested: orderIds.length,
            sentCount: sent.length,
            failedCount: failed.length,
            results
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error sending bulk WhatsApp messages', error: error.message });
    }
};

exports.sendReadyWhatsAppMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id)
            .populate('customer')
            .populate('products');

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (!order.customer || !order.customer.phone) {
            return res.status(400).json({ message: 'Customer phone number is missing for this order' });
        }

        const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
        const WA_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
        const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

        if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
            return res.status(500).json({
                message: 'WhatsApp API is not configured',
                missing: [
                    !WA_TOKEN ? 'WHATSAPP_ACCESS_TOKEN' : null,
                    !WA_PHONE_NUMBER_ID ? 'WHATSAPP_PHONE_NUMBER_ID' : null
                ].filter(Boolean)
            });
        }

        const to = normalizePhoneForWhatsApp(order.customer.phone);
        if (!to) {
            return res.status(400).json({ message: 'Invalid customer phone number format' });
        }

        const generatedMessage = buildReadyForPickupMessage({
            customerName: order.customer.name,
            orderId: String(order._id),
            customerOrderNumber: order.customer.orderNumber,
            products: order.products,
            total: order.total,
            paid: order.paid
        });

        const customMessage = String(req.body?.message || '').trim();
        const messageToSend = customMessage || generatedMessage;

        const apiUrl = `https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`;
        const payload = {
            messaging_product: 'whatsapp',
            to: to.replace('+', ''),
            type: 'text',
            text: { body: messageToSend }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${WA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({
                message: 'Failed to send WhatsApp message',
                error: data
            });
        }

        return res.status(200).json({
            message: 'WhatsApp message sent successfully',
            to,
            orderId: order._id,
            whatsappResponse: data
        });
    } catch (error) {
        return res.status(500).json({ message: 'Error sending WhatsApp message', error: error.message });
    }
};
>>>>>>> bc4332ff63ff85ba9ee992c42e86638f4a6609d0
