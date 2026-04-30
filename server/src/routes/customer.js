import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { restaurantName } from "../data/menu.js";
import { MenuExtra } from "../models/MenuExtra.js";
import { MenuItem } from "../models/MenuItem.js";
import { Order } from "../models/Order.js";
import { Promotion } from "../models/Promotion.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { User } from "../models/User.js";
import { httpError } from "../utils/httpError.js";
import { isPushConfigured } from "../utils/push.js";

export const customerRouter = express.Router();
const APP_TIME_ZONE = "Asia/Bangkok";

const customerMessages = {
  pending: "Your order was received. We will start preparing it soon.",
  confirmed: "Your order is confirmed and paid. We will start preparing it soon.",
  preparing: "Freshly in progress. We will send an alert as soon as it is time to pick up.",
  ready: "Please come to the pickup counter when you are ready.",
  delivered: "Thanks for ordering with us."
};

function orderCustomerMessage(order) {
  if (!order) return "No order found";
  return customerMessages[order.status] || "Order updated";
}

function signCustomerToken(user) {
  return jwt.sign({ userId: user._id.toString(), role: "customer" }, env.jwtSecret, {
    expiresIn: "30d"
  });
}

async function getAuthenticatedUser(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (!payload?.userId || payload?.role !== "customer") return null;
    return await User.findById(payload.userId);
  } catch {
    return null;
  }
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

function money(value) {
  return Math.round(value * 100) / 100;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  return hours * 60 + minutes;
}

function thailandMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

  return hour * 60 + minute;
}

function promotionIsAvailable(promotion, currentMinutes) {
  const start = timeToMinutes(promotion.availableFrom);
  const end = timeToMinutes(promotion.availableUntil);

  if (start === null || end === null || start === end) return true;
  if (start < end) return currentMinutes >= start && currentMinutes < end;

  return currentMinutes >= start || currentMinutes < end;
}

function serializeMenuItem(item) {
  return {
    id: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    price: item.price,
    options: item.options || [],
    optionGroups: item.optionGroups || [],
    ingredients: item.ingredients || [],
    discountPercent: item.discountPercent || 0,
    featured: item.featured,
    active: item.active,
    sortOrder: item.sortOrder
  };
}

function serializePromotion(promotion, currentMinutes = thailandMinutesNow()) {
  const isAvailableNow = promotionIsAvailable(promotion, currentMinutes);

  return {
    id: promotion._id.toString(),
    title: promotion.title,
    description: promotion.description,
    time: promotion.time,
    availableFrom: promotion.availableFrom,
    availableUntil: promotion.availableUntil,
    itemId: promotion.itemId,
    kind: promotion.kind || inferPromotionKind(promotion),
    imageDataUrl: promotion.imageDataUrl,
    accent: promotion.accent,
    isAvailableNow,
    active: promotion.active,
    sortOrder: promotion.sortOrder
  };
}

function serializeExtra(extra) {
  return {
    id: extra._id.toString(),
    name: extra.name,
    price: extra.price,
    active: extra.active,
    sortOrder: extra.sortOrder
  };
}

function inferPromotionKind(promotion) {
  const title = String(promotion.title || "").toLowerCase();
  if (title.includes("thai")) return "free_thai_food";
  if (title.includes("happy") || title.includes("bucket")) return "bucket_bogo";
  if (title.includes("pizza")) return "pizza_soft_drink";
  return "";
}

function serializeOrder(order) {
  if (!order) return null;

  return {
    id: order._id.toString(),
    orderNumber: order._id.toString().slice(-6).toUpperCase(),
    customerName: order.customerName,
    userId: order.userId,
    guestOrder: order.guestOrder,
    status: order.status,
    items: order.items,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    creditsCharged: order.creditsCharged || 0,
    notes: order.notes,
    message: orderCustomerMessage(order),
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    notificationPingAt: order.notificationPingAt,
    notificationMessage: order.notificationMessage,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function serializeUser(user) {
  if (!user) return null;

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

function normalizeSubscription(subscription) {
  return {
    endpoint: String(subscription?.endpoint || "").trim(),
    keys: {
      p256dh: String(subscription?.keys?.p256dh || "").trim(),
      auth: String(subscription?.keys?.auth || "").trim()
    }
  };
}

function normalizeItemSelections(cartItem, menuItem) {
  const optionGroups = menuItem.optionGroups || [];

  if (optionGroups.length > 0) {
    const selectedOptions = Array.isArray(cartItem.options) ? cartItem.options : [];

    return optionGroups.map((group) => {
      const selected = selectedOptions.find((option) => option.name === group.name);
      const value = String(selected?.value || "").trim();

      if (!value || !group.values.includes(value)) {
        throw httpError(400, "Invalid item option");
      }

      return { name: group.name, value };
    });
  }

  const option = String(cartItem.option || "").trim();

  if (option && !menuItem.options.includes(option)) {
    throw httpError(400, "Invalid item option");
  }

  return option ? [{ name: "Option", value: option }] : [];
}

function validateQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    throw httpError(400, "Invalid item quantity");
  }
}

function normalizeExtras(cartItem, extrasById) {
  const requestedExtras = Array.isArray(cartItem.extras) ? cartItem.extras : [];
  const selectedIds = [
    ...new Set(
      requestedExtras
        .map((extra) => String(extra?.id || extra?.extraId || extra || "").trim())
        .filter(Boolean)
    )
  ];

  return selectedIds.map((id) => {
    const extra = extrasById.get(id);
    if (!extra) throw httpError(400, "Invalid item extra");

    return {
      extraId: extra._id.toString(),
      name: extra.name,
      price: extra.price
    };
  });
}

function buildRegularOrderItem(cartItem, menuBySlug, extrasById) {
  const requestedId = String(cartItem.menuItemId || "").trim();
  const menuItem = menuBySlug.get(requestedId);
  const quantity = Number(cartItem.quantity || 0);

  if (!menuItem) {
    throw httpError(400, "Invalid menu item");
  }

  validateQuantity(quantity);

  const selectedOptions = normalizeItemSelections(cartItem, menuItem);
  const selectedExtras = normalizeExtras(cartItem, extrasById);
  const extrasTotal = selectedExtras.reduce((sum, extra) => sum + extra.price, 0);
  const option = selectedOptions.map((selected) => selected.value).join(" / ");
  const unitGross = menuItem.price + extrasTotal;
  const gross = unitGross * quantity;
  const discountAmount = money(gross * ((menuItem.discountPercent || 0) / 100));
  const lineTotal = money(gross - discountAmount);

  return {
    menuItemId: menuItem.slug,
    name: menuItem.name,
    option,
    options: selectedOptions,
    extras: selectedExtras,
    quantity,
    unitPrice: menuItem.price,
    discountAmount,
    lineTotal
  };
}

function buildDiscountedLine(menuItem, quantity, discountAmount, suffix = "", options = []) {
  const gross = menuItem.price * quantity;

  return {
    menuItemId: menuItem.slug,
    name: suffix ? `${menuItem.name} ${suffix}` : menuItem.name,
    option: options.map((selected) => selected.value).join(" / "),
    options,
    quantity,
    unitPrice: menuItem.price,
    discountAmount: money(discountAmount),
    lineTotal: money(gross - discountAmount)
  };
}

function requireMenuItem(menuBySlug, slug) {
  const item = menuBySlug.get(String(slug || "").trim());
  if (!item) throw httpError(400, "Invalid promotion item");
  return item;
}

function buildPromotionOrderItems(cartItem, promotion, menuBySlug) {
  const quantity = Number(cartItem.quantity || 0);
  validateQuantity(quantity);

  if (!promotionIsAvailable(promotion, thailandMinutesNow())) {
    throw httpError(400, "Promotion is not available right now");
  }

  const kind = promotion.kind || inferPromotionKind(promotion);
  const choices = cartItem.choices || {};

  if (kind === "free_thai_food") {
    const paidItem = requireMenuItem(menuBySlug, promotion.itemId || "bottles-singha-beer");
    const freeItem = requireMenuItem(menuBySlug, choices.freeItemId);
    if (!["Noodle Dishes", "Curries & Soups", "Rice & Salad"].includes(freeItem.category)) {
      throw httpError(400, "Choose a Thai food item for this promotion");
    }

    return [
      buildDiscountedLine(paidItem, quantity, 0, `(${promotion.title})`),
      buildDiscountedLine(freeItem, quantity, freeItem.price * quantity, "(free Thai food)")
    ];
  }

  if (kind === "bucket_bogo") {
    const firstItem = requireMenuItem(menuBySlug, choices.first?.menuItemId || "buckets-build-your-own-bucket");
    const secondItem = requireMenuItem(menuBySlug, choices.second?.menuItemId || "buckets-build-your-own-bucket");
    if (!firstItem.category.toLowerCase().includes("bucket") || !secondItem.category.toLowerCase().includes("bucket")) {
      throw httpError(400, "Choose bucket items for this promotion");
    }

    const firstOptions = normalizeItemSelections(choices.first || {}, firstItem);
    const secondOptions = normalizeItemSelections(choices.second || {}, secondItem);
    const freeDiscount = Math.min(firstItem.price, secondItem.price) * quantity;

    return [
      buildDiscountedLine(firstItem, quantity, 0, `(${promotion.title})`, firstOptions),
      buildDiscountedLine(secondItem, quantity, freeDiscount, "(free bucket)", secondOptions)
    ];
  }

  if (kind === "pizza_soft_drink") {
    const pizza = requireMenuItem(menuBySlug, choices.pizzaItemId);
    const softDrink = requireMenuItem(menuBySlug, choices.softDrinkItemId || "soft-drinks-soft-drinks-coke-sprite-fanta");
    if (pizza.category !== "Pizza") throw httpError(400, "Choose a pizza for this promotion");
    if (softDrink.category !== "Soft Drinks") throw httpError(400, "Choose a soft drink for this promotion");

    return [
      buildDiscountedLine(pizza, quantity, 0, `(${promotion.title})`),
      buildDiscountedLine(softDrink, quantity, softDrink.price * quantity, "(free soft drink)")
    ];
  }

  throw httpError(400, "Unsupported promotion");
}

async function buildOrderItems(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw httpError(400, "Your cart is empty");
  }

  const requestedIds = [
    ...new Set(
      cartItems.flatMap((cartItem) => [
        String(cartItem.menuItemId || "").trim(),
        String(cartItem.choices?.freeItemId || "").trim(),
        String(cartItem.choices?.first?.menuItemId || "").trim(),
        String(cartItem.choices?.second?.menuItemId || "").trim(),
        String(cartItem.choices?.pizzaItemId || "").trim(),
        String(cartItem.choices?.softDrinkItemId || "").trim(),
        "bottles-singha-beer",
        "buckets-build-your-own-bucket",
        "soft-drinks-soft-drinks-coke-sprite-fanta"
      ]).filter(Boolean)
    )
  ];
  const promotionIds = [...new Set(cartItems.map((cartItem) => String(cartItem.promoId || "").trim()).filter(Boolean))];
  const extraIds = [
    ...new Set(
      cartItems.flatMap((cartItem) =>
        (Array.isArray(cartItem.extras) ? cartItem.extras : [])
          .map((extra) => String(extra?.id || extra?.extraId || extra || "").trim())
          .filter(Boolean)
      )
    )
  ];
  const [menuItems, promotions, extras] = await Promise.all([
    MenuItem.find({ slug: { $in: requestedIds }, active: true }),
    Promotion.find({ _id: { $in: promotionIds }, active: true }),
    MenuExtra.find({ _id: { $in: extraIds }, active: true })
  ]);
  const menuBySlug = new Map(menuItems.map((item) => [item.slug, item]));
  const promotionById = new Map(promotions.map((promotion) => [promotion._id.toString(), promotion]));
  const extrasById = new Map(extras.map((extra) => [extra._id.toString(), extra]));

  const items = cartItems.flatMap((cartItem) => {
    if (cartItem.promoId) {
      const promotion = promotionById.get(String(cartItem.promoId));
      if (!promotion) throw httpError(400, "Invalid promotion");
      return buildPromotionOrderItems(cartItem, promotion, menuBySlug);
    }

    return buildRegularOrderItem(cartItem, menuBySlug, extrasById);
  });

  const subtotal = money(
    items.reduce((sum, item) => {
      const extrasTotal = (item.extras || []).reduce((extraSum, extra) => extraSum + extra.price, 0);
      return sum + (item.unitPrice + extrasTotal) * item.quantity;
    }, 0)
  );
  const discountTotal = money(items.reduce((sum, item) => sum + item.discountAmount, 0));
  const total = money(items.reduce((sum, item) => sum + item.lineTotal, 0));

  return { items, subtotal, discountTotal, total };
}

customerRouter.get("/menu", async (_req, res, next) => {
  try {
    const [items, promotions, extras] = await Promise.all([
      MenuItem.find({ active: true }).sort({ category: 1, sortOrder: 1, name: 1 }),
      Promotion.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 }),
      MenuExtra.find({ active: true }).sort({ sortOrder: 1, name: 1 })
    ]);
    const currentThailandMinutes = thailandMinutesNow();

    res.json({
      restaurant: restaurantName,
      timeZone: APP_TIME_ZONE,
      promotions: promotions.map((promotion) => serializePromotion(promotion, currentThailandMinutes)),
      extras: extras.map(serializeExtra),
      items: items.map(serializeMenuItem)
    });
  } catch (error) {
    next(error);
  }
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

customerRouter.post("/auth/login", async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!username || !password) {
      throw httpError(400, "Username and password are required");
    }

    const user = await User.findOne({ username, active: true });
    if (!user) {
      throw httpError(401, "Invalid username or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw httpError(401, "Invalid username or password");
    }

    res.json({
      token: signCustomerToken(user),
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

customerRouter.get("/auth/me", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

customerRouter.get("/history", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      throw httpError(401, "Please sign in");
    }

    const orders = await Order.find({ userId: user._id.toString(), guestOrder: false }).sort({ createdAt: -1 }).limit(100);
    res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    next(error);
  }
});

customerRouter.post("/orders", async (req, res, next) => {
  try {
    const user = await getAuthenticatedUser(req);
    const customerName = user ? normalizeName(user.displayName) : normalizeName(req.body.customerName);
    const deviceId = String(req.body.deviceId || "").trim();
    const notes = String(req.body.notes || "").trim().slice(0, 280);

    if (!customerName) {
      throw httpError(400, "Name is required");
    }

    if (!deviceId) {
      throw httpError(400, "Device session is required");
    }

    const orderTotals = await buildOrderItems(req.body.items);
    if (user) {
      if (!user.active) {
        throw httpError(403, "This account is inactive");
      }
      if (user.credits < orderTotals.total) {
        throw httpError(400, "Not enough credits");
      }
      user.credits = money(user.credits - orderTotals.total);
      await user.save();
    }

    const order = await Order.create({
      customerName,
      customerNameKey: nameKey(customerName),
      userId: user?._id?.toString() || null,
      guestOrder: !user,
      linkedDeviceId: deviceId,
      status: user ? "confirmed" : "pending",
      activeName: true,
      creditsCharged: user ? orderTotals.total : 0,
      notes,
      ...orderTotals
    });

    res.status(201).json({
      order: serializeOrder(order),
      user: serializeUser(user),
      message: orderCustomerMessage(order)
    });
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
    const user = await getAuthenticatedUser(req);

    if (!deviceId && !user) {
      throw httpError(400, "Device session is required");
    }

    const order = user
      ? await Order.findOne({ userId: user._id.toString() }).sort({ updatedAt: -1 })
      : await Order.findOne({ linkedDeviceId: deviceId }).sort({ updatedAt: -1 });

    res.json({
      order: serializeOrder(order),
      user: serializeUser(user),
      message: orderCustomerMessage(order)
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
