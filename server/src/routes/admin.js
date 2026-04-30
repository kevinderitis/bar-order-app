import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { requireAdmin } from "../middleware/auth.js";
import { MenuExtra } from "../models/MenuExtra.js";
import { MenuItem } from "../models/MenuItem.js";
import { Order, ORDER_STATUSES } from "../models/Order.js";
import { PROMOTION_ACCENTS, Promotion } from "../models/Promotion.js";
import { User } from "../models/User.js";
import { httpError } from "../utils/httpError.js";
import { sendPushToDevice } from "../utils/push.js";

export const adminRouter = express.Router();

function serializeOrder(order) {
  return {
    id: order._id.toString(),
    orderNumber: order._id.toString().slice(-6).toUpperCase(),
    customerName: order.customerName,
    userId: order.userId,
    guestOrder: order.guestOrder,
    status: order.status,
    linkedDeviceId: order.linkedDeviceId,
    items: order.items,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    creditsCharged: order.creditsCharged || 0,
    notes: order.notes,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    notificationPingAt: order.notificationPingAt,
    notificationMessage: order.notificationMessage,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function serializeUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    credits: user.credits,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeMenuItem(item) {
  return {
    id: item._id.toString(),
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    price: item.price,
    options: item.options || [],
    optionGroups: item.optionGroups || [],
    ingredients: item.ingredients || [],
    discountPercent: item.discountPercent || 0,
    active: item.active,
    featured: item.featured,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function serializePromotion(promotion) {
  return {
    id: promotion._id.toString(),
    title: promotion.title,
    description: promotion.description,
    time: promotion.time,
    availableFrom: promotion.availableFrom,
    availableUntil: promotion.availableUntil,
    itemId: promotion.itemId,
    kind: promotion.kind,
    imageDataUrl: promotion.imageDataUrl,
    accent: promotion.accent,
    active: promotion.active,
    sortOrder: promotion.sortOrder,
    createdAt: promotion.createdAt,
    updatedAt: promotion.updatedAt
  };
}

function serializeExtra(extra) {
  return {
    id: extra._id.toString(),
    name: extra.name,
    price: extra.price,
    active: extra.active,
    sortOrder: extra.sortOrder,
    createdAt: extra.createdAt,
    updatedAt: extra.updatedAt
  };
}

function thailandDayRange(dateString) {
  const value = String(dateString || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, "Date must use YYYY-MM-DD");
  }

  const [year, month, day] = value.split("-").map(Number);
  const utcStart = Date.UTC(year, month - 1, day, -7, 0, 0, 0);

  return {
    start: new Date(utcStart),
    end: new Date(utcStart + 24 * 60 * 60 * 1000)
  };
}

function menuItemPayload(body) {
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const price = Number(body.price);

  if (!name) throw httpError(400, "Item name is required");
  if (!category) throw httpError(400, "Category is required");
  if (!Number.isFinite(price) || price < 0) throw httpError(400, "Valid price is required");

  return {
    name,
    category,
    slug: String(body.slug || slugify(`${category}-${name}`)).trim().toLowerCase(),
    description: String(body.description || "").trim(),
    price,
    options: cleanList(body.options),
    optionGroups: Array.isArray(body.optionGroups) ? body.optionGroups : [],
    ingredients: cleanList(body.ingredients),
    discountPercent: Number(body.discountPercent || 0),
    active: body.active ?? true,
    featured: body.featured ?? false,
    sortOrder: Number(body.sortOrder || 0)
  };
}

function promotionPayload(body) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const availableFrom = String(body.availableFrom || "").trim();
  const availableUntil = String(body.availableUntil || "").trim();
  const kind = String(body.kind || "").trim();

  if (!title) throw httpError(400, "Promotion title is required");
  if (!description) throw httpError(400, "Promotion description is required");
  if (availableFrom && !/^([01]\d|2[0-3]):[0-5]\d$/.test(availableFrom)) {
    throw httpError(400, "Promotion start time must use HH:MM");
  }
  if (availableUntil && !/^([01]\d|2[0-3]):[0-5]\d$/.test(availableUntil)) {
    throw httpError(400, "Promotion end time must use HH:MM");
  }
  if (kind && !["free_thai_food", "bucket_bogo", "pizza_soft_drink"].includes(kind)) {
    throw httpError(400, "Invalid promotion type");
  }

  return {
    title,
    description,
    time: String(body.time || "").trim(),
    availableFrom,
    availableUntil,
    itemId: String(body.itemId || "").trim(),
    kind,
    imageDataUrl: String(body.imageDataUrl || "").trim(),
    accent: PROMOTION_ACCENTS.includes(body.accent) ? body.accent : "orange",
    active: body.active ?? true,
    sortOrder: Number(body.sortOrder || 0)
  };
}

function extraPayload(body) {
  const name = String(body.name || "").trim();
  const price = Number(body.price);

  if (!name) throw httpError(400, "Extra name is required");
  if (!Number.isFinite(price) || price < 0) throw httpError(400, "Valid extra price is required");

  return {
    name,
    price,
    active: body.active ?? true,
    sortOrder: Number(body.sortOrder || 0)
  };
}

async function userPayload(body, existingUser = null) {
  const username = String(body.username || existingUser?.username || "").trim().toLowerCase();
  const displayName = String(body.displayName || "").trim();
  const credits = Number(body.credits ?? existingUser?.credits ?? 0);
  const active = body.active ?? existingUser?.active ?? true;
  const password = String(body.password || "");

  if (!username) throw httpError(400, "Username is required");
  if (!displayName) throw httpError(400, "Display name is required");
  if (!Number.isFinite(credits) || credits < 0) throw httpError(400, "Valid credits amount is required");

  const payload = { username, displayName, credits, active };
  if (password) {
    payload.passwordHash = await bcrypt.hash(password, 10);
  } else if (!existingUser) {
    throw httpError(400, "Password is required");
  }

  return payload;
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

adminRouter.get("/users", async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users: users.map(serializeUser) });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/reports/daily", async (req, res, next) => {
  try {
    const { date } = req.query;
    const { start, end } = thailandDayRange(date);
    const orders = await Order.find({
      createdAt: {
        $gte: start,
        $lt: end
      }
    }).sort({ createdAt: -1 });

    const userIds = [...new Set(orders.map((order) => order.userId).filter(Boolean))];
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }) : [];
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const rows = orders.map((order) => {
      const user = order.userId ? userMap.get(order.userId) : null;

      return {
        id: order._id.toString(),
        orderNumber: order._id.toString().slice(-6).toUpperCase(),
        userId: order.userId || "",
        customerName: order.customerName,
        username: user?.username || "",
        displayName: user?.displayName || "",
        guestOrder: order.guestOrder,
        status: order.status,
        total: order.total,
        creditsCharged: order.creditsCharged || 0,
        createdAt: order.createdAt
      };
    });

    const byUserMap = new Map();
    for (const row of rows) {
      const key = row.userId || row.username || `guest:${row.customerName}`;
      const current = byUserMap.get(key) || {
        key,
        label: row.displayName || row.customerName,
        username: row.username,
        guest: row.guestOrder,
        orderCount: 0,
        total: 0
      };

      current.orderCount += 1;
      current.total += row.total;
      byUserMap.set(key, current);
    }

    const byUser = [...byUserMap.values()].sort((a, b) => b.total - a.total);
    const totalAmount = rows.reduce((sum, row) => sum + row.total, 0);

    res.json({
      date,
      totals: {
        totalAmount,
        orderCount: rows.length,
        userCount: byUser.length
      },
      byUser,
      rows
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/users", async (req, res, next) => {
  try {
    const user = await User.create(await userPayload(req.body));
    res.status(201).json({ user: serializeUser(user), message: "User created" });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Username already exists"));
    }
    return next(error);
  }
});

adminRouter.patch("/users/:id", async (req, res, next) => {
  try {
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      throw httpError(404, "User not found");
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: await userPayload(req.body, existingUser) },
      { new: true, runValidators: true }
    );

    res.json({ user: serializeUser(user), message: "User updated" });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Username already exists"));
    }
    return next(error);
  }
});

adminRouter.get("/menu-items", async (_req, res, next) => {
  try {
    const items = await MenuItem.find().sort({ category: 1, sortOrder: 1, name: 1 });
    res.json({ items: items.map(serializeMenuItem) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/menu-items", async (req, res, next) => {
  try {
    const item = await MenuItem.create(menuItemPayload(req.body));
    res.status(201).json({ item: serializeMenuItem(item), message: "Menu item created" });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Menu item slug already exists"));
    }
    return next(error);
  }
});

adminRouter.patch("/menu-items/:id", async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: menuItemPayload(req.body) },
      { new: true, runValidators: true }
    );

    if (!item) {
      throw httpError(404, "Menu item not found");
    }

    res.json({ item: serializeMenuItem(item), message: "Menu item updated" });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Menu item slug already exists"));
    }
    return next(error);
  }
});

adminRouter.delete("/menu-items/:id", async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);

    if (!item) {
      throw httpError(404, "Menu item not found");
    }

    res.json({ message: "Menu item deleted" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/extras", async (_req, res, next) => {
  try {
    const extras = await MenuExtra.find().sort({ sortOrder: 1, name: 1 });
    res.json({ extras: extras.map(serializeExtra) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/extras", async (req, res, next) => {
  try {
    const extra = await MenuExtra.create(extraPayload(req.body));
    res.status(201).json({ extra: serializeExtra(extra), message: "Extra created" });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Extra already exists"));
    }
    return next(error);
  }
});

adminRouter.patch("/extras/:id", async (req, res, next) => {
  try {
    const extra = await MenuExtra.findByIdAndUpdate(
      req.params.id,
      { $set: extraPayload(req.body) },
      { new: true, runValidators: true }
    );

    if (!extra) {
      throw httpError(404, "Extra not found");
    }

    res.json({ extra: serializeExtra(extra), message: "Extra updated" });
  } catch (error) {
    if (error?.code === 11000) {
      return next(httpError(409, "Extra already exists"));
    }
    return next(error);
  }
});

adminRouter.delete("/extras/:id", async (req, res, next) => {
  try {
    const extra = await MenuExtra.findByIdAndDelete(req.params.id);

    if (!extra) {
      throw httpError(404, "Extra not found");
    }

    res.json({ message: "Extra deleted" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/promotions", async (_req, res, next) => {
  try {
    const promotions = await Promotion.find().sort({ sortOrder: 1, createdAt: 1 });
    res.json({ promotions: promotions.map(serializePromotion) });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/promotions", async (req, res, next) => {
  try {
    const promotion = await Promotion.create(promotionPayload(req.body));
    res.status(201).json({ promotion: serializePromotion(promotion), message: "Promotion created" });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/promotions/:id", async (req, res, next) => {
  try {
    const promotion = await Promotion.findByIdAndUpdate(
      req.params.id,
      { $set: promotionPayload(req.body) },
      { new: true, runValidators: true }
    );

    if (!promotion) {
      throw httpError(404, "Promotion not found");
    }

    res.json({ promotion: serializePromotion(promotion), message: "Promotion updated" });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/promotions/:id", async (req, res, next) => {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);

    if (!promotion) {
      throw httpError(404, "Promotion not found");
    }

    res.json({ message: "Promotion deleted" });
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
    const existingOrder = await Order.findById(req.params.id);

    if (!existingOrder) {
      throw httpError(404, "Order not found");
    }

    if (!ORDER_STATUSES.includes(status)) {
      throw httpError(400, "Invalid order status");
    }

    if (status === "confirmed" && !existingOrder.creditsCharged) {
      throw httpError(400, "Only paid credit orders can be confirmed");
    }

    const set = { status };
    if (["pending", "confirmed", "preparing", "ready"].includes(status)) set.activeName = true;
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
