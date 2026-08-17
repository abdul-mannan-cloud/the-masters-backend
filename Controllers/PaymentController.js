import * as PaymentService from "../Services/PaymentService.js";
import * as WhatsAppNotificationService from "../Services/WhatsAppNotificationService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllPayments = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (orderId && !isValidObjectId(orderId)) {
      throw new AppError("Invalid orderId format", 400);
    }
    const payments = await PaymentService.getPayments(req.user.tenantId, orderId);
    return res.status(200).json(payments);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

// Payment History table — same records as getAllPayments, with recordedBy
// resolved to a display name.
export const getPaymentHistory = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (orderId && !isValidObjectId(orderId)) {
      throw new AppError("Invalid orderId format", 400);
    }
    const history = await PaymentService.getPaymentHistory(req.user.tenantId, orderId);
    return res.status(200).json(history);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid payment ID format", 400);
    }
    const payment = await PaymentService.getPaymentById(req.user.tenantId, id);
    return res.status(200).json(payment);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const addPayment = async (req, res) => {
  try {
    // Accountability is automatic — whoever is logged in when the payment is
    // recorded, not a manually-picked name (tenant_admin/manager accounts
    // have no linked Employee profile, so this is simply omitted for them).
    const data = { ...req.body, recordedBy: req.body.recordedBy || req.user.employeeId || undefined };
    const payment = await PaymentService.addPayment(
      req.user.tenantId,
      data,
      req.user.userId,
    );
    // Fire-and-forget — same reasoning as the order-placed/completed
    // triggers in orderController.js (see WhatsAppNotificationService): a
    // WhatsApp send must never delay or fail a successfully recorded payment.
    WhatsAppNotificationService.sendPaymentReceivedNotification(
      req.user.tenantId,
      payment.orderId,
      req.user.userId,
    );
    return res.status(201).json({ message: "Payment recorded successfully.", payment });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid payment ID format", 400);
    }
    const payment = await PaymentService.updatePayment(
      req.user.tenantId,
      id,
      req.body,
      req.user.userId,
    );
    return res.status(200).json({ message: "Payment updated successfully.", payment });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const reversePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid payment ID format", 400);
    }
    const data = { ...req.body, recordedBy: req.body.recordedBy || req.user.employeeId || undefined };
    const reversal = await PaymentService.reversePayment(
      req.user.tenantId,
      id,
      data,
      req.user.userId,
    );
    return res.status(201).json({ message: "Payment reversed successfully.", payment: reversal });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
