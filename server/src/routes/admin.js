import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { requireAdmin } from "../middleware/auth.js";
import { Order, ORDER_STATUSES } from "../models/Order.js";
import { httpError } from "../utils/httpError.js";
import { sendPushToDevice } from "../utils/push.js";

export const adminRouter = express.Router();

function serializeOrder(order) {
  return {
    id: order._id.toString(),
    orderNumber: order._id.toString().slice(-6).toUpperCase(),
    customerName: order.customerName,
    status: order.status,
    linkedDeviceId: order.linkedDeviceId,
    items: order.items,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    notificationPingAt: order.notificationPingAt,
    notificationMessage: order.notificationMessage,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function buildOrderPushPayload(order) {
  const isReady = order.status === "ready";
  const pingTime = order.notificationPingAt ? new Date(order.notificationPingAt).getTime() : Date.now();

  return {
    title: isReady ? "Ready for pickup" : "Order update",
    body: order.notificationMessage || (isReady ? "Your order is ready for pickup" : "We are preparing your order"),
    url: "/",
    orderId: order._id.toString(),
    orderNumber: order._id.toString().slice(-6).toUpperCase(),
    tag: `ready-order-${order._id.toString()}-${pingTime}`,
    timestamp: pingTime,
    requireInteraction: true
  };
}

adminRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const usernameMatches = username === env.adminUsername;
    const passwordMatches = env.adminPasswordHash
      ? await bcrypt.compare(password || "", env.adminPasswordHash)
      : password === env.adminPassword;

    if (!usernameMatches || !passwordMatches) {
      throw httpError(401, "Invalid username or password");
    }

    const token = jwt.sign({ username: env.adminUsername, role: "admin" }, env.jwtSecret, {
      expiresIn: "12h"
    });

    res.json({ token, username: env.adminUsername });
  } catch (error) {
    next(error);
  }
});

adminRouter.use(requireAdmin);

adminRouter.get("/orders", async (_req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(100);
    res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/orders", async (req, res, next) => {
  try {
    throw httpError(410, "Orders are created from the customer app");
  } catch (error) {
    return next(error);
  }
});

adminRouter.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!ORDER_STATUSES.includes(status)) {
      throw httpError(400, "Invalid order status");
    }

    const set = { status };
    if (["pending", "preparing", "ready"].includes(status)) set.activeName = true;
    if (status === "ready") {
      set.readyAt = new Date();
      set.notificationPingAt = new Date();
      set.notificationMessage = "Your order is ready for pickup";
    }
    if (status === "delivered") {
      set.deliveredAt = new Date();
      set.activeName = false;
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });

    if (!order) {
      throw httpError(404, "Order not found");
    }

    let push = null;
    if (status === "ready" && order.linkedDeviceId) {
      push = await sendPushToDevice(order.linkedDeviceId, buildOrderPushPayload(order));
    }

    console.info("[ReadyOrderPush:Admin]", "status update push result", {
      orderId: order._id.toString(),
      status,
      linkedDeviceId: order.linkedDeviceId,
      push
    });

    res.json({ order: serializeOrder(order), push });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Only one pending order can exist at a time"));
    }
    return next(error);
  }
});

adminRouter.post("/orders/:id/ping", async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      throw httpError(404, "Order not found");
    }

    if (!order.linkedDeviceId) {
      throw httpError(400, "Order is not linked to a customer yet");
    }

    order.notificationPingAt = new Date();
    order.notificationMessage =
      order.status === "ready" ? "Your order is ready for pickup" : "We are preparing your order";
    await order.save();

    const push = await sendPushToDevice(order.linkedDeviceId, buildOrderPushPayload(order));
    const message = push.sent
      ? "Notification ping sent"
      : `Ping saved, but push was not delivered: ${push.reason || "unknown reason"}`;

    console.info("[ReadyOrderPush:Admin]", "manual ping result", {
      orderId: order._id.toString(),
      status: order.status,
      linkedDeviceId: order.linkedDeviceId,
      notificationPingAt: order.notificationPingAt,
      notificationMessage: order.notificationMessage,
      push
    });

    res.json({ order: serializeOrder(order), message, push });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/orders/:id", async (req, res, next) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      throw httpError(404, "Order not found");
    }

    res.json({ message: "Order deleted" });
  } catch (error) {
    next(error);
  }
});
