import * as PaymentService from "../Services/PaymentService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

export const getAllPayments = async (req, res) => {
  try {
    const { orderId } = req.query;
    if (orderId && !isValidObjectId(orderId)) {
      throw new AppError("Invalid orderId format", 400);
    }
    const payments = await PaymentService.listPayments(req.user.tenantId, orderId);
    return res.status(200).json(payments);
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

export const createPayment = async (req, res) => {
  try {
    const payment = await PaymentService.createPayment(
      req.user.tenantId,
      req.body,
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

export const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      throw new AppError("Invalid payment ID format", 400);
    }
    await PaymentService.deletePayment(req.user.tenantId, id);
    return res.status(200).json({ message: "Payment deleted successfully." });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
