import * as NotificationService from "../Services/NotificationService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllNotifications = async (req, res) => {
  try {
    const { customerId, status } = req.query;
    if (customerId && !isValidObjectId(customerId)) {
      throw new AppError("Invalid customerId format", 400);
    }
    const notifications = await NotificationService.listNotifications(
      req.user.tenantId,
      { customerId, status },
    );
    return res.status(200).json(notifications);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid notification ID format", 400);
    }
    const notification = await NotificationService.getNotificationById(
      req.user.tenantId,
      id,
    );
    return res.status(200).json(notification);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const createNotification = async (req, res) => {
  try {
    const notification = await NotificationService.createNotification(
      req.user.tenantId,
      req.body,
    );
    return res
      .status(201)
      .json({ message: "Notification created successfully.", notification });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid notification ID format", 400);
    }
    const notification = await NotificationService.updateNotification(
      req.user.tenantId,
      id,
      req.body,
    );
    return res
      .status(200)
      .json({ message: "Notification updated successfully.", notification });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid notification ID format", 400);
    }
    await NotificationService.deleteNotification(req.user.tenantId, id);
    return res.status(200).json({ message: "Notification deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
