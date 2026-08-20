import * as OrderService from "./OrderService.js";
import * as SettingsService from "./SettingsService.js";
import * as NotificationService from "./NotificationService.js";
import Customer from "../Models/Customer.js";
import { sendWhatsAppTextMessage } from "../utils/whatsappClient.js";
import { isValidPhone } from "../utils/validators.js";
import AppError from "../utils/AppError.js";
import {
  renderWhatsAppTemplate,
  formatItemsList,
  formatMoney,
  formatPaymentStatusLabel,
} from "../utils/whatsappTemplates.js";

// The three send*Notification functions below are deliberately "fire and
// forget" from the caller's point of view — a WhatsApp send is an external
// network call to Meta that can be slow or fail (no approved template yet,
// invalid number, Meta downtime, etc.), and none of that should ever block
// or fail placing/completing an order or recording a payment. Every failure
// is caught here and recorded on the Notification record (status "failed",
// failureReason set) rather than thrown back to the caller.

// Shared by every automatic-mode send: creates the "pending" Notification
// record, then attempts the actual send and updates that same record with
// the outcome. Reusing NotificationService.createNotification/updateNotification
// (not a parallel write path) keeps every channel's history in one place.
// Also used by confirmAndSendNotification (human-in-the-loop) and
// resendNotification — both already have their own Notification record by
// the time they need to actually call Meta, so they call sendWhatsAppTextMessage
// + updateNotification directly instead of going through this.
const sendAndRecord = async (tenantId, { customerId, orderId, messageType, content, recipientDigits }) => {
  // Fail cleanly with a clear reason instead of either crashing (slicing a
  // missing/malformed number) or letting Meta reject a garbled number with a
  // less useful error — same validation Customer records are already held to
  // (utils/validators.js), checked again here since this is the last place
  // that can catch a legacy/bad record before an external API call.
  // NotificationService.createNotification requires a non-empty `recipient`
  // (shared validation, used by the generic Notification CRUD API too) — a
  // placeholder keeps this failure visible in history instead of silently
  // producing no record at all when there's genuinely no phone on file.
  const isPhoneValid = Boolean(recipientDigits) && isValidPhone(recipientDigits);

  const notification = await NotificationService.createNotification(tenantId, {
    customerId,
    orderId,
    channel: "whatsapp",
    messageType,
    content,
    recipient: isPhoneValid ? recipientDigits : recipientDigits || "(no phone on file)",
  });

  if (!isPhoneValid) {
    await NotificationService.updateNotification(tenantId, notification._id, {
      status: "failed",
      failureReason: "Customer has no valid WhatsApp-capable phone number on file",
    });
    return notification;
  }

  try {
    const { messageId } = await sendWhatsAppTextMessage(recipientDigits, content, tenantId);
    return NotificationService.updateNotification(tenantId, notification._id, {
      status: "sent",
      providerMessageId: messageId,
      sentAt: new Date(),
    });
  } catch (err) {
    return NotificationService.updateNotification(tenantId, notification._id, {
      status: "failed",
      failureReason: err.message,
    });
  }
};

// Creates a Notification parked as "pending_confirmation" instead of sending
// — used by human-in-the-loop mode. The message is rendered ONCE here and
// stored verbatim on the record, so what a reviewer sees in the confirmation
// UI is byte-for-byte what gets sent later, never re-rendered (and possibly
// different) at send time.
const createPendingConfirmation = async (tenantId, { customerId, orderId, messageType, content, recipientDigits }) => {
  const isPhoneValid = Boolean(recipientDigits) && isValidPhone(recipientDigits);

  const notification = await NotificationService.createNotification(tenantId, {
    customerId,
    orderId,
    channel: "whatsapp",
    messageType,
    content,
    recipient: isPhoneValid ? recipientDigits : recipientDigits || "(no phone on file)",
  });

  return NotificationService.updateNotification(tenantId, notification._id, {
    status: isPhoneValid ? "pending_confirmation" : "failed",
    failureReason: isPhoneValid
      ? undefined
      : "Customer has no valid WhatsApp-capable phone number on file",
  });
};

// "Order placed" — call right after an order (with its items) is fully
// committed, from either order-creation path (OrderController.createOrder).
export const sendOrderPlacedNotification = async (tenantId, orderId, userId) => {
  try {
    const settings = await SettingsService.getSettings(tenantId, userId);
    if (!settings.whatsapp?.enabled || !settings.notifications?.autoNotifyOnOrderCreated) return;

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

// Renders the order-completed message from the order/customer/settings'
// CURRENT state. Shared by the initial trigger and by resendNotification, so
// a resend always reflects today's data (e.g. a since-corrected business
// address) rather than replaying a stale copy. Returns null if the order's
// customer no longer resolves (deleted) — callers treat that as "nothing to
// send", same as the original inline check used to.
const buildOrderCompletedPayload = async (tenantId, orderId, userId) => {
  const settings = await SettingsService.getSettings(tenantId, userId);
  const order = await OrderService.getOrderById(tenantId, orderId);
  // Not filtered by isDeleted — same reasoning as OrderService.getOrderDetails:
  // a historical order must still resolve its customer's name/phone even if
  // their profile has since been removed.
  const customer = await Customer.findOne({ _id: order.customerId, tenantId });
  if (!customer) return null;

  const content = renderWhatsAppTemplate(settings.whatsapp.orderCompletedTemplate, {
    customerName: customer.name,
    businessName: settings.business?.name || "your tailor",
    orderNumber: order.orderNumber,
    businessPhone: settings.business?.phone || "",
    businessAddress: settings.business?.address || "",
  });

  return {
    customerId: customer._id,
    orderId: order._id,
    messageType: "order_ready",
    content,
    recipientDigits: customer.phone,
  };
};

// "Order completed" — call right after a PATCH/PUT to an order successfully
// sets productionStatus to "completed" (OrderController.updateOrder).
// OrderService.updateOrder already rejects any further update to an order
// that's already completed/delivered/cancelled, so a caller reaching this
// point with productionStatus === "completed" is always a genuine fresh
// transition, never a re-save of an already-completed order — that's what
// makes this safe to call unconditionally without its own duplicate check.
//
// Branches on Settings.notifications.orderCompletedMode: "automatic" (default)
// sends immediately, exactly as before; "confirm" instead parks the message
// as a Notification with status "pending_confirmation" for an authorized
// tenant user to review and explicitly send (see confirmAndSendNotification).
export const sendOrderCompletedNotification = async (tenantId, orderId, userId) => {
  try {
    const settings = await SettingsService.getSettings(tenantId, userId);
    if (!settings.whatsapp?.enabled || !settings.notifications?.autoNotifyOnOrderReady) return;

    const payload = await buildOrderCompletedPayload(tenantId, orderId, userId);
    if (!payload) return;

    if (settings.notifications?.orderCompletedMode === "confirm") {
      await createPendingConfirmation(tenantId, payload);
    } else {
      await sendAndRecord(tenantId, payload);
    }
  } catch (err) {
    console.error("sendOrderCompletedNotification failed:", err.message);
  }
};

// "Payment received" — call right after PaymentService.addPayment commits.
// Reuses OrderService.getCheckout (same as sendOrderPlacedNotification) so
// amountPaid/remainingAmount/paymentStatus reflect the order's true state
// after this payment, not a value recomputed separately here.
export const sendPaymentReceivedNotification = async (tenantId, orderId, userId) => {
  try {
    const settings = await SettingsService.getSettings(tenantId, userId);
    if (!settings.whatsapp?.enabled || !settings.notifications?.autoNotifyOnPaymentReceived) return;

    const { order, customer, totalPaid, remainingBalance } =
      await OrderService.getCheckout(tenantId, orderId);

    const content = renderWhatsAppTemplate(settings.whatsapp.paymentReceivedTemplate, {
      customerName: customer.name,
      businessName: settings.business?.name || "your tailor",
      orderNumber: order.orderNumber,
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
      messageType: "payment_received",
      content,
      recipientDigits: customer.phone,
    });
  } catch (err) {
    console.error("sendPaymentReceivedNotification failed:", err.message);
  }
};

// Called when an authorized tenant user clicks "Send" on a
// pending_confirmation notification (routes/Notification.js POST /:id/send).
// NotificationService.claimPendingConfirmation does the pending_confirmation
// -> pending transition atomically (status is part of the update's filter),
// so a double-click or two open tabs can never both pass this point — the
// second call finds nothing left to claim and throws a 409 before Meta is
// ever contacted twice for the same notification.
export const confirmAndSendNotification = async (tenantId, notificationId, userId) => {
  void userId; // not yet recorded on the Notification — see final report
  const claimed = await NotificationService.claimPendingConfirmation(tenantId, notificationId);

  if (claimed.channel !== "whatsapp") {
    throw new AppError("Not a WhatsApp notification", 400);
  }

  try {
    const { messageId } = await sendWhatsAppTextMessage(claimed.recipient, claimed.content, tenantId);
    return NotificationService.updateNotification(tenantId, claimed._id, {
      status: "sent",
      providerMessageId: messageId,
      sentAt: new Date(),
    });
  } catch (err) {
    return NotificationService.updateNotification(tenantId, claimed._id, {
      status: "failed",
      failureReason: err.message,
    });
  }
};

// Called when an authorized tenant user clicks "Cancel" on a
// pending_confirmation notification. Same atomicity guarantee as above —
// Meta is never called for a cancelled notification, by construction (this
// function never touches whatsappClient.js at all).
export const cancelPendingNotification = async (tenantId, notificationId, userId) => {
  void userId; // not yet recorded on the Notification — see final report
  return NotificationService.cancelPendingConfirmation(tenantId, notificationId);
};

// Explicit re-send of an already-resolved (sent/failed/cancelled) notification
// — the section 11 "Resend" action, distinct from the automatic/confirm flow:
// clicking Resend IS the human confirmation, so this always sends immediately
// via sendAndRecord regardless of the tenant's orderCompletedMode setting,
// and always creates a NEW Notification record rather than mutating the
// original (history is append-only, same principle Payment records follow).
// Only "order_ready" (order completed) is supported today — this is the
// message type this feature is scoped to; other types fail with a clear
// "not supported" error rather than silently doing nothing.
export const resendNotification = async (tenantId, notificationId, userId) => {
  const original = await NotificationService.getNotificationById(tenantId, notificationId);
  if (original.channel !== "whatsapp") {
    throw new AppError("Not a WhatsApp notification", 400);
  }
  if (!original.orderId) {
    throw new AppError("Cannot resend — this notification has no associated order", 400);
  }
  if (original.messageType !== "order_ready") {
    throw new AppError(`Resend is not supported for message type "${original.messageType}"`, 400);
  }

  const payload = await buildOrderCompletedPayload(tenantId, original.orderId, userId);
  if (!payload) {
    throw new AppError("Cannot resend — the customer for this order no longer exists", 404);
  }
  return sendAndRecord(tenantId, payload);
};
