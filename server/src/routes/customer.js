import express from "express";
import { env } from "../config/env.js";
import { restaurantName } from "../data/menu.js";
import { MenuItem } from "../models/MenuItem.js";
import { Order } from "../models/Order.js";
import { Promotion } from "../models/Promotion.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { httpError } from "../utils/httpError.js";
import { isPushConfigured } from "../utils/push.js";

export const customerRouter = express.Router();
const APP_TIME_ZONE = "Asia/Bangkok";

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
    status: order.status,
    items: order.items,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    notes: order.notes,
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

function buildRegularOrderItem(cartItem, menuBySlug) {
  const requestedId = String(cartItem.menuItemId || "").trim();
  const menuItem = menuBySlug.get(requestedId);
  const quantity = Number(cartItem.quantity || 0);

  if (!menuItem) {
    throw httpError(400, "Invalid menu item");
  }

  validateQuantity(quantity);

  const selectedOptions = normalizeItemSelections(cartItem, menuItem);
  const option = selectedOptions.map((selected) => selected.value).join(" / ");
  const gross = menuItem.price * quantity;
  const discountAmount = money(gross * ((menuItem.discountPercent || 0) / 100));
  const lineTotal = money(gross - discountAmount);

  return {
    menuItemId: menuItem.slug,
    name: menuItem.name,
    option,
    options: selectedOptions,
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
  const [menuItems, promotions] = await Promise.all([
    MenuItem.find({ slug: { $in: requestedIds }, active: true }),
    Promotion.find({ _id: { $in: promotionIds }, active: true })
  ]);
  const menuBySlug = new Map(menuItems.map((item) => [item.slug, item]));
  const promotionById = new Map(promotions.map((promotion) => [promotion._id.toString(), promotion]));

  const items = cartItems.flatMap((cartItem) => {
    if (cartItem.promoId) {
      const promotion = promotionById.get(String(cartItem.promoId));
      if (!promotion) throw httpError(400, "Invalid promotion");
      return buildPromotionOrderItems(cartItem, promotion, menuBySlug);
    }

    return buildRegularOrderItem(cartItem, menuBySlug);
  });

  const subtotal = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const discountTotal = money(items.reduce((sum, item) => sum + item.discountAmount, 0));
  const total = money(items.reduce((sum, item) => sum + item.lineTotal, 0));

  return { items, subtotal, discountTotal, total };
}

customerRouter.get("/menu", async (_req, res, next) => {
  try {
    const [items, promotions] = await Promise.all([
      MenuItem.find({ active: true }).sort({ category: 1, sortOrder: 1, name: 1 }),
      Promotion.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 })
    ]);
    const currentThailandMinutes = thailandMinutesNow();

    res.json({
      restaurant: restaurantName,
      timeZone: APP_TIME_ZONE,
      promotions: promotions.map((promotion) => serializePromotion(promotion, currentThailandMinutes)),
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

customerRouter.post("/orders", async (req, res, next) => {
  try {
    const customerName = normalizeName(req.body.customerName);
    const deviceId = String(req.body.deviceId || "").trim();
    const notes = String(req.body.notes || "").trim().slice(0, 280);

    if (!customerName) {
      throw httpError(400, "Name is required");
    }

    if (!deviceId) {
      throw httpError(400, "Device session is required");
    }

    const orderTotals = await buildOrderItems(req.body.items);
    const order = await Order.create({
      customerName,
      customerNameKey: nameKey(customerName),
      linkedDeviceId: deviceId,
      status: "pending",
      activeName: true,
      notes,
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
