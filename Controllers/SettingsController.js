import * as SettingsService from "../Services/SettingsService.js";
import sendErrorResponse from "../utils/errorHandler.js";
import isValidObjectId from "../utils/validateObjectId.js";
import AppError from "../utils/AppError.js";

// Settings has nested sections (business.name, invoice.prefix, ...), which
// multipart/form-data can't express as a plain object like JSON can — so
// when a logo file is attached, the rest of the payload travels as a single
// JSON-stringified "payload" field instead of top-level form fields.
const resolveBody = (req) => {
  const body = req.body?.payload ? JSON.parse(req.body.payload) : req.body;
  if (!req.file) return body;
  return { ...body, business: { ...(body.business || {}), logo: req.file.path } };
};

export const getSettings = async (req, res) => {
  try {
    const settings = await SettingsService.getSettings(
      req.user.tenantId,
      req.user.userId,
    );
    return res.status(200).json(settings);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateSettings = async (req, res) => {
  try {
    const settings = await SettingsService.updateSettings(
      req.user.tenantId,
      resolveBody(req),
      req.user.userId,
    );
    return res.status(200).json({ message: "Settings updated successfully.", settings });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

// super_admin managing a specific tenant's business profile from the Tenant
// view — same service functions, just resolving tenantId from the URL
// instead of the caller's own JWT.
export const getSettingsForTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (!isValidObjectId(tenantId)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    const settings = await SettingsService.getSettings(tenantId, req.user.userId);
    return res.status(200).json(settings);
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};

export const updateSettingsForTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    if (!isValidObjectId(tenantId)) {
      throw new AppError("Invalid tenant ID format", 400);
    }
    const settings = await SettingsService.updateSettings(
      tenantId,
      resolveBody(req),
      req.user.userId,
    );
    return res.status(200).json({ message: "Settings updated successfully.", settings });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
