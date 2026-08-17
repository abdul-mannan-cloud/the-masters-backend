import Notification from "../Models/Notification.js";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
import AppError from "../utils/AppError.js";

const VALID_CHANNELS = ["sms", "email", "in_app", "whatsapp"];
const VALID_STATUSES = [
  "pending",
  "pending_confirmation",
  "sent",
  "delivered",
  "failed",
  "read",
  "cancelled",
];

export const listNotifications = async (tenantId, filters = {}) => {
  const query = { tenantId };
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.status) query.status = filters.status;
  // Populated so the frontend (e.g. the Pending WhatsApp Notifications review
  // screen) can show a customer name / order number without a second round
  // trip per row — same pattern DashboardService's recent-orders query uses.
  return Notification.find(query)
    .sort({ createdAt: -1 })
    .populate("customerId", "name phone")
    .populate("orderId", "orderNumber productionStatus");
};

export const getNotificationById = async (tenantId, id) => {
  const notification = await Notification.findOne({ _id: id, tenantId });
  if (!notification) throw new AppError("Notification not found", 404);
  return notification;
};

export const createNotification = async (tenantId, data) => {
  const { customerId, orderId, channel, messageType, content, recipient } = data;

  if (!channel || !messageType || !content || !recipient) {
    throw new AppError(
      "channel, messageType, content, and recipient are required",
      400,
    );
  }
  if (!VALID_CHANNELS.includes(channel)) {
    throw new AppError(`Invalid channel. Must be one of: ${VALID_CHANNELS.join(", ")}`, 400);
  }

  if (customerId) {
    const customer = await Customer.findOne({
      _id: customerId,
      tenantId,
      isDeleted: false,
    });
    if (!customer) throw new AppError("Customer not found for this tenant", 404);
  }
  if (orderId) {
    const order = await Order.findOne({ _id: orderId, tenantId });
    if (!order) throw new AppError("Order not found for this tenant", 404);
  }

  return Notification.create({
    tenantId,
    customerId,
    orderId,
    channel,
    messageType,
    content,
    recipient,
  });
};

export const updateNotification = async (tenantId, id, data) => {
  const { status, providerMessageId, sentAt, failureReason } = data;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new AppError(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`, 400);
  }

  const updates = {};
  if (status !== undefined) updates.status = status;
  if (providerMessageId !== undefined) updates.providerMessageId = providerMessageId;
  if (sentAt !== undefined) updates.sentAt = sentAt;
  if (failureReason !== undefined) updates.failureReason = failureReason;

  const notification = await Notification.findOneAndUpdate(
    { _id: id, tenantId },
    updates,
    { new: true, runValidators: true },
  );
  if (!notification) throw new AppError("Notification not found", 404);
  return notification;
};

export const deleteNotification = async (tenantId, id) => {
  const notification = await Notification.findOneAndDelete({ _id: id, tenantId });
  if (!notification) throw new AppError("Notification not found", 404);
  return notification;
};

// Atomically moves a human-in-the-loop notification from
// "pending_confirmation" to "pending" — the status match is part of the
// filter, not a separate check-then-write, so two concurrent "Send" clicks
// (double-click, two tabs) can never both win: only the first findOneAndUpdate
// actually matches a document, the second finds nothing and gets the 409
// below. This is the mechanism section 11 ("critical: prevent duplicate
// sends") actually depends on for the confirm flow.
export const claimPendingConfirmation = async (tenantId, id) => {
  const claimed = await Notification.findOneAndUpdate(
    { _id: id, tenantId, status: "pending_confirmation" },
    { status: "pending" },
  );
  if (claimed) return claimed; // pre-update doc — still has the original content/recipient

  const existing = await Notification.findOne({ _id: id, tenantId });
  if (!existing) throw new AppError("Notification not found", 404);
  throw new AppError(
    `Notification is not awaiting confirmation (current status: ${existing.status})`,
    409,
  );
};

// Same atomicity reasoning as claimPendingConfirmation, for the Cancel button.
export const cancelPendingConfirmation = async (tenantId, id) => {
  const cancelled = await Notification.findOneAndUpdate(
    { _id: id, tenantId, status: "pending_confirmation" },
    { status: "cancelled" },
    { new: true },
  );
  if (cancelled) return cancelled;

  const existing = await Notification.findOne({ _id: id, tenantId });
  if (!existing) throw new AppError("Notification not found", 404);
  throw new AppError(
    `Notification is not awaiting confirmation (current status: ${existing.status})`,
    409,
  );
};
