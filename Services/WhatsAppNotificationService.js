import * as OrderService from "./OrderService.js";
import * as SettingsService from "./SettingsService.js";
import * as NotificationService from "./NotificationService.js";
import Customer from "../Models/Customer.js";
import { sendWhatsAppTextMessage } from "../utils/whatsappClient.js";
import {
  renderWhatsAppTemplate,
  formatItemsList,
  formatMoney,
  formatPaymentStatusLabel,
} from "../utils/whatsappTemplates.js";

// Both functions below are deliberately "fire and forget" from the caller's
// point of view — a WhatsApp send is an external network call to Meta that
// can be slow or fail (no approved template yet, invalid number, Meta
// downtime, etc.), and none of that should ever block or fail placing/
// completing an order. Every failure is caught here and recorded on the
// Notification record (status "failed", failureReason set) rather than
// thrown back to the caller.

// Shared by both triggers: creates the "pending" Notification record, then
// attempts the actual send and updates that same record with the outcome.
// Reusing NotificationService.createNotification/updateNotification (not a
// parallel write path) keeps every channel's history in one place.
const sendAndRecord = async (tenantId, { customerId, orderId, messageType, content, recipientDigits }) => {
  const notification = await NotificationService.createNotification(tenantId, {
    customerId,
    orderId,
    channel: "whatsapp",
    messageType,
    content,
    recipient: recipientDigits,
  });

  try {
    const { messageId } = await sendWhatsAppTextMessage(recipientDigits, content);
    await NotificationService.updateNotification(tenantId, notification._id, {
      status: "sent",
      providerMessageId: messageId,
      sentAt: new Date(),
    });
  } catch (err) {
    await NotificationService.updateNotification(tenantId, notification._id, {
      status: "failed",
      failureReason: err.message,
    });
  }
};

// "Order placed" — call right after an order (with its items) is fully
// committed, from either order-creation path (OrderController.createOrder).
export const sendOrderPlacedNotification = async (tenantId, orderId, userId) => {
  try {
    const settings = await SettingsService.getSettings(tenantId, userId);
    if (!settings.notifications?.autoNotifyOnOrderCreated) return;

    const { order, customer, items, totalPaid, remainingBalance } =
      await OrderService.getCheckout(tenantId, orderId);

    const discountAmount = order.subtotal - order.total;

    const content = renderWhatsAppTemplate(settings.whatsapp.orderPlacedTemplate, {
      customerName: customer.name,
      businessName: settings.business?.name || "your tailor",
      orderNumber: order.orderNumber,
      orderDate: new Date(order.orderDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      items: formatItemsList(items),
      subtotal: formatMoney(order.subtotal),
      discount: formatMoney(discountAmount),
      grandTotal: formatMoney(order.total),
      amountPaid: formatMoney(totalPaid),
      remainingAmount: formatMoney(remainingBalance),
      paymentStatus: formatPaymentStatusLabel(order.paymentStatus),
      businessPhone: settings.business?.phone || "",
      businessAddress: settings.business?.address || "",
    });

    await sendAndRecord(tenantId, {
      customerId: customer._id,
      orderId: order._id,
      messageType: "order_placed",
      content,
      recipientDigits: customer.phone,
    });
  } catch (err) {
    // Settings/order lookup itself failed (shouldn't happen — the order was
    // just created) — log and move on, never affect the caller.
    console.error("sendOrderPlacedNotification failed:", err.message);
  }
};

// "Order completed" — call right after a PATCH/PUT to an order successfully
// sets productionStatus to "completed" (OrderController.updateOrder).
// OrderService.updateOrder already rejects any further update to an order
// that's already completed/delivered/cancelled, so a caller reaching this
// point with productionStatus === "completed" is always a genuine fresh
// transition, never a re-save of an already-completed order.
export const sendOrderCompletedNotification = async (tenantId, orderId, userId) => {
  try {
    const settings = await SettingsService.getSettings(tenantId, userId);
    if (!settings.notifications?.autoNotifyOnOrderReady) return;

    const order = await OrderService.getOrderById(tenantId, orderId);
    // Not filtered by isDeleted — same reasoning as OrderService.getOrderDetails:
    // a historical order must still resolve its customer's name/phone even if
    // their profile has since been removed.
    const customer = await Customer.findOne({ _id: order.customerId, tenantId });
    if (!customer) return;

    const content = renderWhatsAppTemplate(settings.whatsapp.orderCompletedTemplate, {
      customerName: customer.name,
      businessName: settings.business?.name || "your tailor",
      orderNumber: order.orderNumber,
      businessPhone: settings.business?.phone || "",
      businessAddress: settings.business?.address || "",
    });

    await sendAndRecord(tenantId, {
      customerId: customer._id,
      orderId: order._id,
      messageType: "order_ready",
      content,
      recipientDigits: customer.phone,
    });
  } catch (err) {
    console.error("sendOrderCompletedNotification failed:", err.message);
  }
};
