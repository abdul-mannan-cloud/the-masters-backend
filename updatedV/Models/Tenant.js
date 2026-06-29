import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    // URL-friendly unique identifier, e.g., "ali-tailors-lahore"
    // Used for subdomain routing in future: ali-tailors-lahore.themasters.app
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    // Subscription tier — controls feature access in application layer
    plan: {
      type: String,
      enum: ["free", "basic", "pro", "enterprise"],
      default: "free",
    },
    status: {
      type: String,
      enum: ["active", "suspended", "cancelled"],
      default: "active",
    },
  },
  { timestamps: true },
);

export default mongoose.model("Tenant", tenantSchema);
