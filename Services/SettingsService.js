import Settings from "../Models/Settings.js";

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
