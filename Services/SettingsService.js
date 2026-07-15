import mongoose from "mongoose";
import Settings from "../Models/Settings.js";
import Tenant from "../Models/Tenant.js";
import AppError from "../utils/AppError.js";
import { normalizeDigits, isValidPhone, isValidEmail } from "../utils/validators.js";

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

    const [settings] = await Promise.all([
      Settings.findOneAndUpdate(
        { tenantId },
        { $set: updates },
        { new: true, runValidators: true, upsert: true, session },
      ),
      hasTenantMirror
        ? Tenant.findOneAndUpdate({ _id: tenantId, isDeleted: false }, tenantUpdates, { session })
        : Promise.resolve(null),
    ]);

    await session.commitTransaction();
    return settings;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
