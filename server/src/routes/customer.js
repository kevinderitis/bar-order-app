import express from "express";
import { env } from "../config/env.js";
import { findMenuItem, menuItems, menuPromotions } from "../data/menu.js";
import { Order } from "../models/Order.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { httpError } from "../utils/httpError.js";
import { isPushConfigured } from "../utils/push.js";

export const customerRouter = express.Router();

const customerMessages = {
  pending: "Your order was received. We will start preparing it soon.",
  preparing: "Freshly in progress. We will send an alert as soon as it is time to pick up.",
  ready: "Please come to the pickup counter when you are ready.",
  delivered: "Thanks for ordering with us."
};

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

function money(value) {
  return Math.round(value * 100) / 100;
}

function serializeOrder(order) {
  if (!order) return null;

  return {
    id: order._id.toString(),
    orderNumber: order._id.toString().slice(-6).toUpperCase(),
    customerName: order.customerName,
    status: order.status,
    items: order.items,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    message: customerMessages[order.status] || "Order updated",
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    notificationPingAt: order.notificationPingAt,
    notificationMessage: order.notificationMessage,
    createdAt: order.createdAt,
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

function buildOrderItems(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw httpError(400, "Your cart is empty");
  }

  const items = cartItems.map((cartItem) => {
    const menuItem = findMenuItem(cartItem.menuItemId);
    const quantity = Number(cartItem.quantity || 0);

    if (!menuItem) {
      throw httpError(400, "Invalid menu item");
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw httpError(400, "Invalid item quantity");
    }

    const gross = menuItem.price * quantity;
    const discountAmount = money(gross * ((menuItem.discountPercent || 0) / 100));
    const lineTotal = money(gross - discountAmount);

    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPrice: menuItem.price,
      discountAmount,
      lineTotal
    };
  });

  const subtotal = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const discountTotal = money(items.reduce((sum, item) => sum + item.discountAmount, 0));
  const total = money(items.reduce((sum, item) => sum + item.lineTotal, 0));

  return { items, subtotal, discountTotal, total };
}

customerRouter.get("/menu", (_req, res) => {
  res.json({ promotions: menuPromotions, items: menuItems });
});

customerRouter.get("/name-availability", async (req, res, next) => {
  try {
    const customerName = normalizeName(req.query.name);

    if (!customerName) {
      throw httpError(400, "Name is required");
    }

    const existingOrder = await Order.findOne({
      customerNameKey: nameKey(customerName),
      activeName: true
    });

    res.json({ available: !existingOrder });
  } catch (error) {
    next(error);
  }
});

customerRouter.post("/orders", async (req, res, next) => {
  try {
    const customerName = normalizeName(req.body.customerName);
    const deviceId = String(req.body.deviceId || "").trim();

    if (!customerName) {
      throw httpError(400, "Name is required");
    }

    if (!deviceId) {
      throw httpError(400, "Device session is required");
    }

    const orderTotals = buildOrderItems(req.body.items);
    const order = await Order.create({
      customerName,
      customerNameKey: nameKey(customerName),
      linkedDeviceId: deviceId,
      status: "pending",
      activeName: true,
      ...orderTotals
    });

    res.status(201).json({ order: serializeOrder(order), message: customerMessages.pending });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "That name already has an active order"));
    }
    return next(error);
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
      order: serializeOrder(order),
      message: order ? customerMessages[order.status] : "No order found"
    });
  } catch (error) {
    next(error);
  }
});

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
