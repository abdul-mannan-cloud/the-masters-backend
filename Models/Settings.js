import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true, // Enforces one Settings document per tenant
    },

    // Public-facing business information
    business: {
      name: { type: String, default: "" },
      logo: { type: String, default: null }, // Cloudinary URL or similar
      ownerName: { type: String, default: "" },
      email: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      workingHours: { type: String, default: "" }, // free-text, e.g. "Mon-Sat 10am-8pm"
      currency: { type: String, default: "PKR" },
      timezone: { type: String, default: "Asia/Karachi" },
    },

    // Invoice generation settings
    invoice: {
      // Prefix for order numbers, e.g., "TM" → "TM-2024-001"
      orderNumberPrefix: { type: String, default: "ORD" },
      showLogo: { type: Boolean, default: true },
      footer: { type: String, default: "" },
      termsAndConditions: { type: String, default: "" },
    },

    // WhatsApp Business API credentials (Meta Graph API)
    // See: https://developers.facebook.com/docs/whatsapp/cloud-api
    whatsapp: {
      enabled: { type: Boolean, default: false },
      phoneNumberId: { type: String, default: null },
      // SECURITY: Encrypt this field at rest in production
      accessToken: { type: String, default: null },
      businessAccountId: { type: String, default: null },
    },

    // Automatic notification triggers
    notifications: {
      // Send a WhatsApp/SMS when an order is first created
      autoNotifyOnOrderCreated: { type: Boolean, default: false },
      // Send a message when productionStatus changes to 'completed'
      autoNotifyOnOrderReady: { type: Boolean, default: false },
      // Send a confirmation after a payment is recorded
      autoNotifyOnPaymentReceived: { type: Boolean, default: false },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Settings", settingsSchema);
