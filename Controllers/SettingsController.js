import * as SettingsService from "../Services/SettingsService.js";
import sendErrorResponse from "../utils/errorHandler.js";

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
      req.body,
      req.user.userId,
    );
    return res.status(200).json({ message: "Settings updated successfully.", settings });
  } catch (err) {
    return sendErrorResponse(res, err);
  }
};
