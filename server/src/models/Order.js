import mongoose from "mongoose";

export const ORDER_STATUSES = [
  "pending_link",
  "linked",
  "preparing",
  "ready",
  "delivered",
  "cancelled"
];

const orderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "pending_link",
      required: true
    },
    linkedDeviceId: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    linkedAt: {
      type: Date,
      default: null
    },
    readyAt: {
      type: Date,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    notificationPingAt: {
      type: Date,
      default: null
    },
    notificationMessage: {
      type: String,
      trim: true,
      default: null,
      maxlength: 180
    }
  },
  {
    timestamps: true
  }
);

orderSchema.index(
  { status: 1 },
  {
    name: "unique_pending_link_order",
    unique: true,
    partialFilterExpression: { status: "pending_link" }
  }
);

export const Order = mongoose.model("Order", orderSchema);
