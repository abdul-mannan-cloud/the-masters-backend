import mongoose from "mongoose";
import {
  DEFAULT_ORDER_PLACED_TEMPLATE,
  DEFAULT_ORDER_COMPLETED_TEMPLATE,
  DEFAULT_PAYMENT_RECEIVED_TEMPLATE,
} from "../utils/whatsappTemplates.js";

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

    // Automatic notification triggers
    notifications: {
      // Send a notification when an order is first created
      autoNotifyOnOrderCreated: { type: Boolean, default: false },
      // Send a message when productionStatus changes to 'completed'
      autoNotifyOnOrderReady: { type: Boolean, default: false },
      // Send a confirmation after a payment is recorded
      autoNotifyOnPaymentReceived: { type: Boolean, default: false },
      // Only meaningful when autoNotifyOnOrderReady is true. "automatic"
      // sends immediately when an order completes; "confirm" instead parks
      // the rendered message as a Notification with status
      // "pending_confirmation" for an authorized tenant user to review and
      // explicitly send (see WhatsAppNotificationService, routes/Notification.js).
      orderCompletedMode: { type: String, enum: ["automatic", "confirm"], default: "automatic" },
    },

    // Per-business customizable WhatsApp message text (rendered with
    // {{placeholders}}, see utils/whatsappTemplates.js). Sending itself uses
    // platform-level Meta WhatsApp Cloud API credentials (.env) — there is no
    // per-tenant phone number/access token here, only message content.
    // Whether these actually get sent is gated by notifications.* above, not
    // by a field in here.
    whatsapp: {
      orderPlacedTemplate: { type: String, default: DEFAULT_ORDER_PLACED_TEMPLATE },
      orderCompletedTemplate: { type: String, default: DEFAULT_ORDER_COMPLETED_TEMPLATE },
      paymentReceivedTemplate: { type: String, default: DEFAULT_PAYMENT_RECEIVED_TEMPLATE },
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
