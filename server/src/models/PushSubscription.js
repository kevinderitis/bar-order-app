import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    endpoint: {
      type: String,
      required: true,
      trim: true
    },
    keys: {
      p256dh: {
        type: String,
        required: true
      },
      auth: {
        type: String,
        required: true
      }
    },
    userAgent: {
      type: String,
      trim: true,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
