import Settings from "../Models/Settings.js";
import AppError from "../utils/AppError.js";
import { normalizeDigits, isValidPhone, isValidEmail } from "../utils/validators.js";

const SECTION_FIELDS = ["business", "invoice", "whatsapp", "notifications"];

export const getSettings = async (tenantId, userId) => {
  // One Settings document per tenant — create it with defaults on first access
  // instead of forcing a separate provisioning step at tenant registration.
  let settings = await Settings.findOne({ tenantId });
  if (!settings) {
    settings = await Settings.create({
      tenantId,
      createdBy: userId,
      updatedBy: userId,
    });
  }
  return settings;
};

export const updateSettings = async (tenantId, data, userId) => {
  if (data.business?.phone) {
    const digits = normalizeDigits(data.business.phone);
    if (!isValidPhone(digits)) {
      throw new AppError("Enter a valid 11-digit mobile number starting with 03", 400);
    }
    data.business.phone = digits;
  }
  if (data.business?.email && !isValidEmail(data.business.email)) {
    throw new AppError("Invalid business email format", 400);
  }

  const updates = { updatedBy: userId };

  for (const section of SECTION_FIELDS) {
    if (data[section] !== undefined && typeof data[section] === "object") {
      for (const [key, value] of Object.entries(data[section])) {
        updates[`${section}.${key}`] = value;
      }
    }
  }

  const settings = await Settings.findOneAndUpdate(
    { tenantId },
    { $set: updates },
    { new: true, runValidators: true, upsert: true },
  );
  return settings;
};
