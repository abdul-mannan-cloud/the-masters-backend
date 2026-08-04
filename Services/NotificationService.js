import Notification from "../Models/Notification.js";
import Customer from "../Models/Customer.js";
import Order from "../Models/Order.js";
import AppError from "../utils/AppError.js";

const VALID_CHANNELS = ["sms", "email", "in_app", "whatsapp"];
const VALID_STATUSES = ["pending", "sent", "delivered", "failed", "read"];

export const listNotifications = async (tenantId, filters = {}) => {
  const query = { tenantId };
  if (filters.customerId) query.customerId = filters.customerId;
  if (filters.status) query.status = filters.status;
  return Notification.find(query).sort({ createdAt: -1 });
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
