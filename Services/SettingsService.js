import mongoose from "mongoose";
import Settings from "../Models/Settings.js";
import Tenant from "../Models/Tenant.js";
import AppError from "../utils/AppError.js";
import { normalizeDigits, isValidPhone, isValidEmail } from "../utils/validators.js";
import { encryptCredential, decryptCredential } from "../utils/credentialEncryption.js";

// Tenant and Settings each keep their own copy of the same public-facing
// profile fields (Tenant was built first at signup time; Settings' business
// section was added later for the tenant's own self-service editing). They
// must be mirrored on every write, or the Sidebar/super_admin Tenant screens
// (which read Tenant directly) go stale the moment someone edits Business Info.
const BUSINESS_TO_TENANT_FIELD = {
  name: "businessName",
  logo: "logo",
  email: "contactEmail",
  phone: "contactPhone",
  address: "address",
};

const SECTION_FIELDS = ["business", "invoice", "notifications", "whatsapp"];

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
  if (data.whatsapp?.orderPlacedTemplate !== undefined && !data.whatsapp.orderPlacedTemplate.trim()) {
    throw new AppError("Order Placed message template cannot be empty", 400);
  }
  if (data.whatsapp?.orderCompletedTemplate !== undefined && !data.whatsapp.orderCompletedTemplate.trim()) {
    throw new AppError("Order Completed message template cannot be empty", 400);
  }
  if (
    data.whatsapp?.paymentReceivedTemplate !== undefined &&
    !data.whatsapp.paymentReceivedTemplate.trim()
  ) {
    throw new AppError("Payment Received message template cannot be empty", 400);
  }
  if (
    data.notifications?.orderCompletedMode !== undefined &&
    !["automatic", "confirm"].includes(data.notifications.orderCompletedMode)
  ) {
    throw new AppError('orderCompletedMode must be "automatic" or "confirm"', 400);
  }
  if (data.whatsapp?.enabled !== undefined && typeof data.whatsapp.enabled !== "boolean") {
    throw new AppError("whatsapp.enabled must be true or false", 400);
  }

  // accessToken never round-trips through the frontend (see getSettings /
  // the `select: false` schema field), so this update path has to treat it
  // specially: omitted entirely = "leave the stored token alone" (the
  // generic per-section loop below would otherwise try to write
  // `undefined`, which Mongoose just ignores, so this isn't strictly
  // required for that case — but an explicit empty string IS a real
  // "disconnect/rotate" request and must actually clear the encrypted value
  // and hasAccessToken flag, not get silently dropped by the generic loop).
  let accessTokenUpdate;
  if (data.whatsapp && Object.prototype.hasOwnProperty.call(data.whatsapp, "accessToken")) {
    const rawToken = data.whatsapp.accessToken;
    accessTokenUpdate = rawToken
      ? { "whatsapp.accessToken": encryptCredential(rawToken), "whatsapp.hasAccessToken": true }
      : { "whatsapp.accessToken": null, "whatsapp.hasAccessToken": false };
    delete data.whatsapp.accessToken;
  }

  const updates = { updatedBy: userId, ...accessTokenUpdate };

  for (const section of SECTION_FIELDS) {
    if (data[section] !== undefined && typeof data[section] === "object") {
      for (const [key, value] of Object.entries(data[section])) {
        updates[`${section}.${key}`] = value;
      }
    }
  }

  // Mirror whichever business.* fields changed onto Tenant's own copies —
  // two collections updated together, so this is one transaction.
  const tenantUpdates = { updatedBy: userId };
  if (data.business) {
    for (const [businessKey, tenantField] of Object.entries(BUSINESS_TO_TENANT_FIELD)) {
      if (data.business[businessKey] !== undefined) {
        tenantUpdates[tenantField] = data.business[businessKey];
      }
    }
  }
  const hasTenantMirror = Object.keys(tenantUpdates).length > 1;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Sequential, not Promise.all — a MongoDB ClientSession may only run one
    // operation at a time; firing both writes concurrently on the same
    // session desyncs the driver's transaction-number tracking from the
    // server's (surfaces as a "does not match any in-progress transactions"
    // error), intermittently but reproducibly whenever a business.* field
    // actually triggers the Tenant mirror write.
    const settings = await Settings.findOneAndUpdate(
      { tenantId },
      { $set: updates },
      { new: true, runValidators: true, upsert: true, session },
    );
    if (hasTenantMirror) {
      await Tenant.findOneAndUpdate({ _id: tenantId, isDeleted: false }, tenantUpdates, { session });
    }

    await session.commitTransaction();
    return settings;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

// INTERNAL ONLY — resolves the decrypted credentials a WhatsApp send
// actually needs. Never call this from a controller; the only consumer is
// utils/whatsappClient.js, which never returns its result to an HTTP
// response. Explicitly opts into the select:false accessToken field, which
// is exactly why every other read path in this service (and the controller
// responses built on top of it) stays safe by default.
export const getTenantWhatsAppCredentials = async (tenantId) => {
  const settings = await Settings.findOne({ tenantId }).select("+whatsapp.accessToken");
  if (!settings) return null;

  return {
    enabled: settings.whatsapp?.enabled !== false,
    phoneNumber: settings.whatsapp?.phoneNumber || "",
    phoneNumberId: settings.whatsapp?.phoneNumberId || "",
    businessAccountId: settings.whatsapp?.businessAccountId || "",
    accessToken: decryptCredential(settings.whatsapp?.accessToken),
    apiVersion: settings.whatsapp?.apiVersion || "",
  };
};
