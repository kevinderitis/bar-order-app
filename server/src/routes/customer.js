import express from "express";
import { env } from "../config/env.js";
import { Order } from "../models/Order.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { httpError } from "../utils/httpError.js";
import { isPushConfigured } from "../utils/push.js";

export const customerRouter = express.Router();

const customerMessages = {
  pending_link: "Scan the QR code to link your order",
  linked: "Your order is being prepared. We'll notify you when it's ready for pickup.",
  preparing: "Your order is being prepared. We'll notify you when it's ready for pickup.",
  ready: "Your order is ready for pickup",
  delivered: "Order delivered",
  cancelled: "Order cancelled"
};

function serializeCustomerOrder(order) {
  if (!order) return null;

  return {
    id: order._id.toString(),
    orderNumber: order._id.toString().slice(-6).toUpperCase(),
    customerName: order.customerName,
    status: order.status,
    message: customerMessages[order.status] || "Order updated",
    linkedAt: order.linkedAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    notificationPingAt: order.notificationPingAt,
    notificationMessage: order.notificationMessage,
    updatedAt: order.updatedAt
  };
}

function normalizeSubscription(subscription) {
  return {
    endpoint: String(subscription?.endpoint || "").trim(),
    keys: {
      p256dh: String(subscription?.keys?.p256dh || "").trim(),
      auth: String(subscription?.keys?.auth || "").trim()
    }
  };
}

customerRouter.get("/push-config", (_req, res) => {
  res.json({
    enabled: isPushConfigured(),
    publicKey: isPushConfigured() ? env.vapidPublicKey : ""
  });
});

customerRouter.post("/push-subscriptions", async (req, res, next) => {
  try {
    const deviceId = String(req.body.deviceId || "").trim();
    const subscription = normalizeSubscription(req.body.subscription);

    if (!isPushConfigured()) {
      throw httpError(503, "Web Push is not configured");
    }

    if (!deviceId) {
      throw httpError(400, "Device session is required");
    }

    if (!subscription.endpoint || !subscription.keys.p256dh || !subscription.keys.auth) {
      throw httpError(400, "Valid push subscription is required");
    }

    await PushSubscription.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          userAgent: req.headers["user-agent"] || ""
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(201).json({ message: "Push notifications enabled" });
  } catch (error) {
    next(error);
  }
});

customerRouter.post("/link", async (req, res, next) => {
  try {
    const qrCode = String(req.body.qrCode || "").trim();
    const deviceId = String(req.body.deviceId || "").trim();

    if (!deviceId) {
      throw httpError(400, "Device session is required");
    }

    if (qrCode !== env.qrSecretCode) {
      throw httpError(400, "Invalid QR code");
    }

    const existingOrder = await Order.findOne({
      linkedDeviceId: deviceId,
      status: { $nin: ["delivered", "cancelled"] }
    }).sort({ updatedAt: -1 });

    if (existingOrder) {
      return res.json({
        order: serializeCustomerOrder(existingOrder),
        message: customerMessages[existingOrder.status] || "Order already linked"
      });
    }

    const linkedOrder = await Order.findOneAndUpdate(
      { status: "pending_link", linkedDeviceId: null },
      {
        $set: {
          status: "linked",
          linkedDeviceId: deviceId,
          linkedAt: new Date()
        }
      },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!linkedOrder) {
      return res.status(404).json({ order: null, message: "No pending order found" });
    }

    res.json({
      order: serializeCustomerOrder(linkedOrder),
      message: customerMessages.linked
    });
  } catch (error) {
    next(error);
  }
});

customerRouter.get("/order", async (req, res, next) => {
  try {
    const deviceId = String(req.query.deviceId || "").trim();

    if (!deviceId) {
      throw httpError(400, "Device session is required");
    }

    const order = await Order.findOne({ linkedDeviceId: deviceId }).sort({ updatedAt: -1 });

    res.json({
      order: serializeCustomerOrder(order),
      message: order ? customerMessages[order.status] : "No pending order found"
    });
  } catch (error) {
    next(error);
  }
});
