import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    // The delivery mechanism used
    channel: {
      type: String,
      enum: ["sms", "email", "in_app"],
      required: true,
    },
    // Category of notification — used for filtering and analytics
    // e.g., 'order_ready', 'payment_received', 'order_created', 'eid_greeting'
    messageType: {
      type: String,
      required: true,
      trim: true,
    },
    // The actual message text that was sent to the customer
    content: {
      type: String,
      required: true,
    },
    // Phone number or email address used — snapshot at send time
    // (in case customer contact info changes later)
    recipient: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed", "read"],
      default: "pending",
    },
    // ID returned by the messaging provider
    // Used to match delivery receipt webhooks back to this record
    providerMessageId: {
      type: String,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    // Populated when status = 'failed' — e.g., "Invalid phone number"
    failureReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

// Queue of unsent notifications for the sending worker
notificationSchema.index({ tenantId: 1, status: 1 });

// Customer communication history view
notificationSchema.index({ tenantId: 1, customerId: 1 });

// Delivery receipt webhook matching — sparse because most docs won't have this yet
notificationSchema.index({ providerMessageId: 1 }, { sparse: true });

export default mongoose.model("Notification", notificationSchema);
