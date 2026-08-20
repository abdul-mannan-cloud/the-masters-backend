import * as AlertService from "../Services/AlertService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAlerts = async (req, res) => {
  try {
    const { type, isRead } = req.query;
    const alerts = await AlertService.listAlerts(req.user, { type, isRead });
    return res.status(200).json(alerts);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const count = await AlertService.getUnreadCount(req.user);
    return res.status(200).json({ count });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid alert ID format", 400);
    }
    const alert = await AlertService.markAsRead(req.user.tenantId, id);
    return res.status(200).json({ message: "Alert marked as read.", alert });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    await AlertService.markAllAsRead(req.user);
    return res.status(200).json({ message: "All alerts marked as read." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
