import {
  Bell,
  BellRing,
  Beer,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CookingPot,
  CupSoda,
  Drumstick,
  GlassWater,
  Loader2,
  Menu,
  Martini,
  Minus,
  Plus,
  Pizza,
  Search,
  ShoppingBag,
  Soup,
  Sparkles,
  Trash2,
  Utensils,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import { api } from "../lib/api.js";
import { getDeviceId } from "../lib/device.js";

const PUSH_LOG_PREFIX = "[ReadyOrderPush:Client]";
const NAME_KEY = "ready-order-customer-name";
const CUSTOMER_TOKEN_KEY = "ready-order-customer-token";
const PROMO_COLLAPSE_DISTANCE = 220;
const PROMO_EXPANDED_HEIGHT = 176;
const PROMO_EXPANDED_MARGIN = 8;
const PROMO_COLLAPSED_MARGIN = 2;

function isRunningInstalled() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

const statusLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for pickup",
  delivered: "Delivered"
};

const statusTone = {
  pending: "warm",
  confirmed: "success",
  preparing: "warm",
  ready: "ready",
  delivered: "success"
};

const statusMessages = {
  pending: "Your order was received. We will start preparing it soon.",
  confirmed: "Your order is confirmed and paid. We will start preparing it soon.",
  preparing: "Freshly in progress. We will send an alert as soon as it is time to pick up.",
  ready: "Please come to the pickup counter when you are ready.",
  delivered: "Thanks for ordering with us."
};

function money(value) {
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function promotionScheduleLabel(promo) {
  if (promo.availableFrom && promo.availableUntil) {
    return `${promo.availableFrom} - ${promo.availableUntil} Thailand`;
  }

  return promo.time || "Promo";
}

function inferPromotionKind(promo) {
  const title = String(promo.title || "").toLowerCase();
  if (title.includes("thai")) return "free_thai_food";
  if (title.includes("happy") || title.includes("bucket")) return "bucket_bogo";
  if (title.includes("pizza")) return "pizza_soft_drink";
  return promo.kind || "";
}

function cartLineGross(item) {
  const extrasTotal = (item.extras || []).reduce((sum, extra) => sum + Number(extra.price || 0), 0);
  return item.subtotal ?? (item.price + extrasTotal) * item.quantity;
}

function cartLineDiscount(item) {
  if (typeof item.discountAmount === "number") return item.discountAmount;
  return cartLineGross(item) * ((item.discountPercent || 0) / 100);
}

function cartLineTotal(item) {
  if (typeof item.lineTotal === "number") return item.lineTotal;
  return cartLineGross(item) - cartLineDiscount(item);
}

function itemDetailText(item) {
  const optionText = item.option || "";
  const extrasText = item.extras?.length ? `Extras: ${item.extras.map((extra) => extra.name).join(", ")}` : "";

  return [optionText, extrasText].filter(Boolean).join(" · ");
}

function isFoodItem(item) {
  return !["Bottles", "Soft Drinks", "Cocktails", "Buckets", "Shots", "Long Drinks"].includes(item.category);
}

function canNotify() {
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function StatusIcon({ status, loading }) {
  if (loading) return <Loader2 className="spin" size={18} />;
  if (status === "confirmed") return <CheckCircle2 size={18} />;
  if (status === "ready" || status === "delivered") return <CheckCircle2 size={18} />;
  if (status === "pending" || status === "preparing") return <Clock3 size={18} />;
  return <Sparkles size={18} />;
}

function InstallAppNotice({ visible, canInstall, message, onInstall, onClose }) {
  if (!visible) return null;

  return (
    <aside className="install-app-notice" aria-label="Install app notice">
      <div>
        <strong>Install Arena Bar</strong>
        <span>{message || "Get the fastest pickup experience and reliable order alerts."}</span>
      </div>
      <div className="install-app-actions">
        <button className="admin-primary" type="button" onClick={onInstall}>
          <Plus size={17} />
          <span>{canInstall ? "Install app" : "How to install"}</span>
        </button>
        <button className="install-close-button" type="button" onClick={onClose} aria-label="Close install notice">
          <X size={17} />
        </button>
      </div>
    </aside>
  );
}

function NotificationRequiredModal({ visible, permission, busy, onEnable }) {
  if (!visible) return null;

  const denied = permission === "denied";

  return (
    <div className="notification-modal-overlay" role="dialog" aria-modal="true" aria-label="Enable notifications">
      <section className="notification-modal notification-required-modal">
        <div className="modal-bell">
          <BellRing size={34} />
        </div>
        <div className="modal-copy">
          <h2>{denied ? "Notifications are blocked" : "Turn on order alerts"}</h2>
          <p>
            {denied
              ? "Notifications are blocked in this browser. Enable them in site settings so we can alert you when your order is ready."
              : "Notifications are required for pickup alerts. Please enable them so we can tell you when your order is ready."}
          </p>
        </div>
        <div className="modal-actions">
          <button className="modal-primary" type="button" onClick={onEnable} disabled={busy || denied}>
            {busy ? <Loader2 className="spin" size={18} /> : <BellRing size={18} />}
            <span>{denied ? "Blocked in settings" : "Enable notifications"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function MenuItemIcon({ item }) {
  const category = item.category.toLowerCase();
  const name = item.name.toLowerCase();

  if (category.includes("pizza")) return <Pizza size={24} />;
  if (category.includes("cocktail") || category.includes("bucket") || name.includes("bucket")) return <Martini size={24} />;
  if (category.includes("bottle") || name.includes("beer") || name.includes("soju")) return <Beer size={24} />;
  if (category.includes("soft") || name.includes("water") || name.includes("juice") || name.includes("shake")) {
    return <CupSoda size={24} />;
  }
  if (category.includes("shot") || category.includes("long drink")) return <GlassWater size={24} />;
  if (category.includes("curry") || category.includes("soup") || name.includes("soup")) return <Soup size={24} />;
  if (category.includes("western") || name.includes("chicken") || name.includes("burger")) return <Drumstick size={24} />;
  if (category.includes("noodle") || category.includes("rice")) return <CookingPot size={24} />;

  return <Utensils size={24} />;
}

function defaultSelectedOptions(item) {
  return (item?.optionGroups || []).map((group) => ({
    name: group.name,
    value: group.values?.[0] || ""
  }));
}

function optionsLabel(options) {
  return options?.length ? options.map((option) => option.value).join(" / ") : "";
}

function PromoCustomizer({ promo, menu, onClose, onAddPromo }) {
  const kind = inferPromotionKind(promo);
  const thaiItems = menu.items.filter((item) => ["Noodle Dishes", "Curries & Soups", "Rice & Salad"].includes(item.category));
  const bucketItems = menu.items.filter((item) => item.category.toLowerCase().includes("bucket") || item.name.toLowerCase().includes("bucket"));
  const pizzaItems = menu.items.filter((item) => item.category === "Pizza");
  const softDrinkItems = menu.items.filter((item) => item.category === "Soft Drinks");
  const singha = menu.items.find((item) => item.id === "bottles-singha-beer") || menu.items.find((item) => item.name.includes("Singha"));
  const [thaiId, setThaiId] = useState(thaiItems[0]?.id || "");
  const [firstBucketId, setFirstBucketId] = useState(bucketItems[0]?.id || "");
  const [secondBucketId, setSecondBucketId] = useState(bucketItems[0]?.id || "");
  const [firstBucketOptions, setFirstBucketOptions] = useState(() => defaultSelectedOptions(bucketItems[0]));
  const [secondBucketOptions, setSecondBucketOptions] = useState(() => defaultSelectedOptions(bucketItems[0]));
  const [pizzaId, setPizzaId] = useState(pizzaItems[0]?.id || "");
  const [softDrinkId, setSoftDrinkId] = useState(
    softDrinkItems.find((item) => item.id === "soft-drinks-soft-drinks-coke-sprite-fanta")?.id || softDrinkItems[0]?.id || ""
  );

  const firstBucket = menu.items.find((item) => item.id === firstBucketId);
  const secondBucket = menu.items.find((item) => item.id === secondBucketId);
  const selectedThai = menu.items.find((item) => item.id === thaiId);
  const selectedPizza = menu.items.find((item) => item.id === pizzaId);
  const selectedSoftDrink = menu.items.find((item) => item.id === softDrinkId);

  function selectBucket(which, itemId) {
    const item = menu.items.find((menuItem) => menuItem.id === itemId);
    if (which === "first") {
      setFirstBucketId(itemId);
      setFirstBucketOptions(defaultSelectedOptions(item));
    } else {
      setSecondBucketId(itemId);
      setSecondBucketOptions(defaultSelectedOptions(item));
    }
  }

  function updateBucketOption(which, groupName, value) {
    const setter = which === "first" ? setFirstBucketOptions : setSecondBucketOptions;
    setter((current) =>
      current.map((option) => (option.name === groupName ? { ...option, value } : option))
    );
  }

  function addPromotion() {
    if (!["free_thai_food", "bucket_bogo", "pizza_soft_drink"].includes(kind)) return;

    let choices = {};
    let option = "";
    let subtotal = 0;
    let discountAmount = 0;

    if (kind === "free_thai_food") {
      if (!singha || !selectedThai) return;
      choices = { paidItemId: singha.id, freeItemId: selectedThai.id };
      option = `${singha.name} + ${selectedThai.name}`;
      subtotal = singha.price + selectedThai.price;
      discountAmount = selectedThai.price;
    }

    if (kind === "bucket_bogo") {
      if (!firstBucket || !secondBucket) return;
      choices = {
        first: { menuItemId: firstBucket.id, options: firstBucketOptions },
        second: { menuItemId: secondBucket.id, options: secondBucketOptions }
      };
      option = `${firstBucket.name} ${optionsLabel(firstBucketOptions)} + ${secondBucket.name} ${optionsLabel(secondBucketOptions)}`;
      subtotal = firstBucket.price + secondBucket.price;
      discountAmount = Math.min(firstBucket.price, secondBucket.price);
    }

    if (kind === "pizza_soft_drink") {
      if (!selectedPizza || !selectedSoftDrink) return;
      choices = { pizzaItemId: selectedPizza.id, softDrinkItemId: selectedSoftDrink.id };
      option = `${selectedPizza.name} + ${selectedSoftDrink.name}`;
      subtotal = selectedPizza.price + selectedSoftDrink.price;
      discountAmount = selectedSoftDrink.price;
    }

    const lineTotal = subtotal - discountAmount;
    const cartKey = `promo:${promo.id}:${JSON.stringify(choices)}`;
    onAddPromo({
      id: cartKey,
      cartKey,
      promoId: promo.id,
      promoKind: kind,
      choices,
      name: promo.title,
      option,
      quantity: 1,
      price: subtotal,
      subtotal,
      discountAmount,
      lineTotal
    });
    onClose();
  }

  return (
    <div className="promo-modal-overlay" role="dialog" aria-modal="true" aria-label={promo.title}>
      <section className="promo-modal">
        <div className="promo-modal-head">
          <div>
            <p className="eyebrow">Promotion</p>
            <h2>{promo.title}</h2>
            <span>{promotionScheduleLabel(promo)}</span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close promotion">
            <X size={17} />
          </button>
        </div>
        <p>{promo.description}</p>

        {kind === "free_thai_food" ? (
          <div className="promo-builder">
            <div className="promo-fixed-line">
              <span>Included</span>
              <strong>{singha?.name || "Singha Beer"}</strong>
            </div>
            <label className="item-option">
              <span>Choose your free Thai food</span>
              <select value={thaiId} onChange={(event) => setThaiId(event.target.value)}>
                {thaiItems.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {kind === "bucket_bogo" ? (
          <div className="promo-builder">
            {[
              { label: "First bucket", value: firstBucketId, options: firstBucketOptions, which: "first", item: firstBucket },
              { label: "Free bucket", value: secondBucketId, options: secondBucketOptions, which: "second", item: secondBucket }
            ].map((bucket) => (
              <div className="promo-choice-card" key={bucket.which}>
                <label className="item-option">
                  <span>{bucket.label}</span>
                  <select value={bucket.value} onChange={(event) => selectBucket(bucket.which, event.target.value)}>
                    {bucketItems.map((item) => (
                      <option value={item.id} key={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                {bucket.item?.optionGroups?.length ? (
                  <div className="item-option-groups">
                    {bucket.item.optionGroups.map((group) => (
                      <label className="item-option" key={group.name}>
                        <span>{group.name}</span>
                        <select
                          value={bucket.options.find((option) => option.name === group.name)?.value || group.values?.[0] || ""}
                          onChange={(event) => updateBucketOption(bucket.which, group.name, event.target.value)}
                        >
                          {group.values.map((choice) => (
                            <option value={choice} key={choice}>{choice}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {kind === "pizza_soft_drink" ? (
          <div className="promo-builder">
            <label className="item-option">
              <span>Choose your pizza</span>
              <select value={pizzaId} onChange={(event) => setPizzaId(event.target.value)}>
                {pizzaItems.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="item-option">
              <span>Soft drink</span>
              <select value={softDrinkId} onChange={(event) => setSoftDrinkId(event.target.value)}>
                {softDrinkItems.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {!["free_thai_food", "bucket_bogo", "pizza_soft_drink"].includes(kind) ? (
          <div className="promo-message">This promotion needs a supported combo type before it can be ordered.</div>
        ) : null}

        <button
          className="scan-button promo-add-button"
          type="button"
          onClick={addPromotion}
          disabled={!["free_thai_food", "bucket_bogo", "pizza_soft_drink"].includes(kind)}
        >
          <Plus size={20} />
          <span>Add promotion</span>
        </button>
      </section>
    </div>
  );
}

function menuIconTone(item) {
  const category = item.category.toLowerCase();
  const name = item.name.toLowerCase();

  if (
    category.includes("bottle") ||
    category.includes("soft") ||
    category.includes("cocktail") ||
    category.includes("bucket") ||
    category.includes("shot") ||
    category.includes("long drink") ||
    name.includes("beer") ||
    name.includes("water") ||
    name.includes("juice")
  ) {
    return "drink";
  }

  if (category.includes("pizza")) return "pizza";
  if (category.includes("curry") || category.includes("soup") || category.includes("noodle") || category.includes("rice")) {
    return "thai";
  }

  return "food";
}

async function showLocalOrderNotification(order) {
  console.info(PUSH_LOG_PREFIX, "local notification requested", {
    canNotify: canNotify(),
    permission: canNotify() ? Notification.permission : "unsupported",
    orderId: order?.id,
    status: order?.status,
    notificationPingAt: order?.notificationPingAt,
    notificationMessage: order?.notificationMessage
  });

  if (!canNotify() || Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  const isReady = order.status === "ready";
  const title = isReady ? "Ready for pickup" : "Order update";
  const pingTime = order.notificationPingAt ? new Date(order.notificationPingAt).getTime() : Date.now();
  const options = {
    body: order.notificationMessage || (isReady ? "Your order is ready for pickup" : "We are preparing your order"),
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    tag: `ready-order-${order.id}-${pingTime}`,
    renotify: true,
    silent: false,
    timestamp: pingTime,
    requireInteraction: true,
    vibrate: [120, 70, 120],
    data: { url: "/" }
  };

  console.info(PUSH_LOG_PREFIX, "showNotification attempt", { title, options });

  try {
    await registration.showNotification(title, options);
    console.info(PUSH_LOG_PREFIX, "showNotification success", { title, tag: options.tag });
  } catch (error) {
    console.error(PUSH_LOG_PREFIX, "showNotification error", {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
  }
}

function AccountAccessModal({ visible, busy, message, username, password, onUsernameChange, onPasswordChange, onClose, onSubmit }) {
  if (!visible) return null;

  return (
    <div className="notification-modal-overlay" role="dialog" aria-modal="true" aria-label="Sign in">
      <section className="notification-modal notification-required-modal">
        <div className="modal-copy">
          <h2>Sign in</h2>
          <p>Use your username and password to order with credits and see your order history.</p>
        </div>
        <div className="admin-editor-form">
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => onUsernameChange(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {message ? <div className="status-pill status-warm">{message}</div> : null}
          <div className="modal-actions">
            <button className="modal-primary" type="button" onClick={onSubmit} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <BellRing size={18} />}
              <span>Sign in</span>
            </button>
            <button className="admin-secondary modal-secondary" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function NameGate({
  initialName,
  onContinue,
  onSignIn,
  loginBusy,
  loginMessage,
  username,
  password,
  onUsernameChange,
  onPasswordChange
}) {
  const [name, setName] = useState(initialName || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [guestMode, setGuestMode] = useState(Boolean(initialName));

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanName = name.trim().replace(/\s+/g, " ");

    if (!cleanName) {
      setMessage("Choose a name to start");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const data = await api.checkNameAvailability(cleanName);
      if (!data.available) {
        setMessage("That name already has an active order");
        return;
      }

      localStorage.setItem(NAME_KEY, cleanName);
      onContinue(cleanName);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="customer-shell menu-shell">
      <form className="name-gate" onSubmit={handleSubmit}>
        <BrandMark />
        <div className="customer-copy">
          <p className="eyebrow">Arena Bar</p>
          <h1>Start your pickup</h1>
          <p>Sign in with your account or continue as a guest.</p>
        </div>
        <label className="name-field">
          <span>Username</span>
          <input value={username} onChange={(event) => onUsernameChange(event.target.value)} autoComplete="username" />
        </label>
        <label className="name-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button className="scan-button" type="button" onClick={onSignIn} disabled={loginBusy}>
          {loginBusy ? <Loader2 className="spin" size={22} /> : <BellRing size={22} />}
          <span>Sign in</span>
        </button>
        {loginMessage ? <div className="status-pill status-warm">{loginMessage}</div> : null}
        <button className="guest-button" type="button" onClick={() => setGuestMode(true)}>
          Continue as guest
        </button>
        {guestMode ? (
          <>
            <label className="name-field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Kevin"
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <button className="scan-button" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={22} /> : <Utensils size={22} />}
              <span>Enter as guest</span>
            </button>
            {message ? <div className="status-pill status-warm">{message}</div> : null}
          </>
        ) : null}
      </form>
    </main>
  );
}

function MenuView({
  customerName,
  currentUser,
  menu,
  cart,
  onAdd,
  onAddPromo,
  onRemove,
  onCheckout,
  onOpenOrder,
  onLoginClick,
  onHistory,
  onProfile,
  onLogout,
  order
}) {
  const menuListRef = useRef(null);
  const promoTrackRef = useRef(null);
  const menuTouchYRef = useRef(null);
  const lastMenuScrollTopRef = useRef(0);
  const promoCollapseProgressRef = useRef(0);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activePromoIndex, setActivePromoIndex] = useState(0);
  const [promoCollapseProgress, setPromoCollapseProgress] = useState(0);
  const [promoOpening, setPromoOpening] = useState(false);
  const [menuScrollLocked, setMenuScrollLocked] = useState(false);
  const [activePromo, setActivePromo] = useState(null);
  const [promoMessage, setPromoMessage] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [selectedOptionGroups, setSelectedOptionGroups] = useState({});
  const [selectedExtras, setSelectedExtras] = useState({});
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => {
    return sum + cartLineTotal(item);
  }, 0);
  const categories = [...new Set(menu.items.map((item) => item.category))];
  const filteredItems = menu.items.filter((item) => {
    const query = search.trim().toLowerCase();
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const matchesSearch =
      !query ||
      [
        item.name,
        item.description,
        item.category,
        ...(item.options || []),
        ...(item.ingredients || []),
        ...(item.optionGroups || []).flatMap((group) => [group.name, ...(group.values || [])])
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    return matchesCategory && matchesSearch;
  });
  const visibleCategories = categories.filter((category) => filteredItems.some((item) => item.category === category));

  function optionFor(item) {
    return selectedOptions[item.id] || item.options?.[0] || "";
  }

  function optionGroupsFor(item) {
    return (item.optionGroups || []).map((group) => ({
      name: group.name,
      value: selectedOptionGroups[item.id]?.[group.name] || group.values?.[0] || ""
    }));
  }

  function itemSelectionFor(item) {
    return {
      option: optionFor(item),
      options: optionGroupsFor(item),
      extras: extrasFor(item)
    };
  }

  function extrasFor(item) {
    const selectedIds = selectedExtras[item.id] || [];
    return (menu.extras || []).filter((extra) => selectedIds.includes(extra.id));
  }

  function selectionKey(item) {
    const selection = itemSelectionFor(item);
    const extrasKey = selection.extras.map((extra) => extra.id).sort().join(",");
    if (selection.options.length > 0) {
      return `${selection.options.map((option) => `${option.name}:${option.value}`).join("|")}:extras:${extrasKey}`;
    }

    return `${selection.option}:extras:${extrasKey}`;
  }

  function quantityFor(item) {
    const key = `${item.id}:${selectionKey(item)}`;
    const selectedQuantity = cart.find((cartItem) => cartItem.cartKey === key)?.quantity || 0;
    if (selectedQuantity) return selectedQuantity;

    return cart.filter((cartItem) => cartItem.id === item.id).reduce((sum, cartItem) => sum + cartItem.quantity, 0);
  }

  function fallbackCartKeyFor(item) {
    const key = `${item.id}:${selectionKey(item)}`;
    if (cart.some((cartItem) => cartItem.cartKey === key)) return "";

    return [...cart].reverse().find((cartItem) => cartItem.id === item.id)?.cartKey || "";
  }

  function scrollToPromo(index) {
    const track = promoTrackRef.current;
    const card = track?.children[index];
    if (!track || !card) return;

    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setActivePromoIndex(index);
  }

  useEffect(() => {
    if (menu.promotions.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActivePromoIndex((current) => {
        const next = (current + 1) % menu.promotions.length;
        const track = promoTrackRef.current;
        const card = track?.children[next];
        if (track && card) {
          track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: "smooth" });
        }
        return next;
      });
    }, 5500);

    return () => window.clearInterval(timer);
  }, [menu.promotions.length]);

  useEffect(() => {
    if (promoCollapseProgress < 1) return undefined;

    const firstFrame = window.requestAnimationFrame(() => {
      if (menuListRef.current) {
        menuListRef.current.scrollTop = 0;
        lastMenuScrollTopRef.current = 0;
      }
    });
    const unlockTimer = window.setTimeout(() => {
      if (menuListRef.current) {
        menuListRef.current.scrollTop = 0;
        lastMenuScrollTopRef.current = 0;
      }
      setMenuScrollLocked(false);
    }, 280);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(unlockTimer);
    };
  }, [promoCollapseProgress]);

  function handlePromoScroll() {
    const track = promoTrackRef.current;
    const firstCard = track?.children[0];
    if (!track || !firstCard) return;

    const step = firstCard.getBoundingClientRect().width;
    const index = Math.round(track.scrollLeft / step);
    setActivePromoIndex(Math.max(0, Math.min(menu.promotions.length - 1, index)));
  }

  function handleMenuScroll(event) {
    const nextTop = event.currentTarget.scrollTop;
    const reachedTopFromListScroll = nextTop <= 0 && lastMenuScrollTopRef.current > 0;

    if (menuScrollLocked) {
      event.currentTarget.scrollTop = 0;
      lastMenuScrollTopRef.current = 0;
      return;
    }

    if (reachedTopFromListScroll && promoCollapseProgressRef.current >= 1) {
      updatePromoCollapseProgress(0);
      lastMenuScrollTopRef.current = 0;
      return;
    }

    if (promoCollapseProgressRef.current < 1 && nextTop > 0) {
      event.currentTarget.scrollTop = 0;
      lastMenuScrollTopRef.current = 0;
      return;
    }

    lastMenuScrollTopRef.current = Math.max(0, nextTop);
  }

  function updatePromoCollapseProgress(nextProgress) {
    const safeProgress = Math.min(1, Math.max(0, nextProgress));
    const roundedProgress = Number(safeProgress.toFixed(3));
    const isOpening = roundedProgress < promoCollapseProgressRef.current;

    promoCollapseProgressRef.current = roundedProgress;
    setPromoOpening(isOpening);
    setPromoCollapseProgress(roundedProgress);
  }

  function consumePromoScroll(element, delta) {
    const currentProgress = promoCollapseProgressRef.current;
    const shouldHidePromo = delta > 0 && currentProgress < 1;
    const reachesTopWhileShowingPromo = delta < 0 && currentProgress > 0 && element.scrollTop + delta <= 0;
    const shouldShowPromo = delta < 0 && currentProgress > 0 && element.scrollTop <= 0;

    if (!shouldHidePromo && !shouldShowPromo && !reachesTopWhileShowingPromo) return false;

    if (shouldHidePromo) {
      element.scrollTop = 0;
      setMenuScrollLocked(true);
      updatePromoCollapseProgress(1);
      return true;
    }

    if (reachesTopWhileShowingPromo) {
      const overflowDelta = element.scrollTop + delta;
      element.scrollTop = 0;
      updatePromoCollapseProgress(currentProgress + overflowDelta / PROMO_COLLAPSE_DISTANCE);
      return true;
    }

    updatePromoCollapseProgress(currentProgress + delta / PROMO_COLLAPSE_DISTANCE);
    return true;
  }

  function stopScrollEvent(event) {
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleMenuWheel(event) {
    if (!consumePromoScroll(event.currentTarget, event.deltaY)) return;

    stopScrollEvent(event);
  }

  function handleMenuTouchStart(event) {
    menuTouchYRef.current = event.touches[0]?.clientY ?? null;
  }

  function handleMenuTouchMove(event) {
    const currentY = event.touches[0]?.clientY;
    const previousY = menuTouchYRef.current;
    if (typeof currentY !== "number" || typeof previousY !== "number") return;

    const delta = previousY - currentY;
    menuTouchYRef.current = currentY;

    if (!consumePromoScroll(event.currentTarget, delta)) return;

    stopScrollEvent(event);
  }

  function handlePromotionClick(promo) {
    if (!promo.isAvailableNow) {
      setPromoMessage(`${promo.title} is available ${promotionScheduleLabel(promo)}.`);
      window.setTimeout(() => setPromoMessage(""), 3600);
      return;
    }

    setPromoMessage("");
    setActivePromo(promo);
  }

  const promoAreaClassName = [
    "promo-area",
    promoCollapseProgress >= 0.995 ? "promo-area-collapsed" : "",
    promoOpening ? "promo-area-opening" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="menu-page">
      <header className="menu-header">
        <div className="menu-header-copy">
          {currentUser ? <p className="eyebrow">Credits {money(currentUser.credits)}</p> : <p className="eyebrow">Pickup menu</p>}
          <h1>Hi, {customerName}</h1>
        </div>
        <div className="menu-header-actions">
          <button className="menu-order-chip" type="button" onClick={onOpenOrder} disabled={!order}>
            <ShoppingBag size={17} />
            <span>{order ? `#${order.orderNumber}` : "No order"}</span>
          </button>
          <div className="account-menu-shell">
            <button
              className="menu-order-chip menu-icon-chip"
              type="button"
              onClick={() => setAccountMenuOpen((value) => !value)}
              aria-expanded={accountMenuOpen}
              aria-label="Account menu"
            >
              <Menu size={18} />
            </button>
            {accountMenuOpen ? (
              <div className="account-menu-popover">
                {currentUser ? (
                  <>
                  <button type="button" onClick={() => { setAccountMenuOpen(false); onProfile(); }}>
                    Profile
                  </button>
                  <button type="button" onClick={() => { setAccountMenuOpen(false); onHistory(); }}>
                    Orders
                  </button>
                  <button type="button" onClick={() => { setAccountMenuOpen(false); onLogout(); }}>
                    Log out
                  </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setAccountMenuOpen(false); onLoginClick(); }}>
                    Login
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section
        className={promoAreaClassName}
        style={{
          "--promo-progress": promoCollapseProgress,
          "--promo-height": `${Math.round(PROMO_EXPANDED_HEIGHT * (1 - promoCollapseProgress))}px`,
          "--promo-margin": `${
            PROMO_COLLAPSED_MARGIN +
            Math.round((PROMO_EXPANDED_MARGIN - PROMO_COLLAPSED_MARGIN) * (1 - promoCollapseProgress))
          }px`,
          "--promo-area-y": `${Math.round(-18 * promoCollapseProgress)}px`,
          "--promo-content-y": `${Math.round(-38 * promoCollapseProgress)}px`,
          "--promo-content-scale": 1 - 0.018 * promoCollapseProgress
        }}
        aria-label="Promotions"
      >
        <div className="promo-area-content">
          <div className="promo-carousel" ref={promoTrackRef} onScroll={handlePromoScroll}>
            {menu.promotions.map((promo) => (
              <button
                className={
                  promo.isAvailableNow
                    ? `promo-card promo-${promo.accent}`
                    : `promo-card promo-${promo.accent} promo-card-locked`
                }
                type="button"
                key={promo.id}
                onClick={() => handlePromotionClick(promo)}
              >
                {promo.imageDataUrl ? <img src={promo.imageDataUrl} alt="" aria-hidden="true" /> : null}
                <span>{promo.isAvailableNow ? promotionScheduleLabel(promo) : `Soon · ${promotionScheduleLabel(promo)}`}</span>
                <strong>{promo.title}</strong>
                <small>{promo.description}</small>
              </button>
            ))}
          </div>
          {menu.promotions.length > 1 ? (
            <div className="promo-dots" aria-label="Promotion slides">
              {menu.promotions.map((promo, index) => (
                <button
                  className={activePromoIndex === index ? "promo-dot promo-dot-active" : "promo-dot"}
                  type="button"
                  key={promo.id}
                  onClick={() => scrollToPromo(index)}
                  aria-label={`Show promotion ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
          {promoMessage ? <div className="promo-message" role="status">{promoMessage}</div> : null}
        </div>
      </section>

      <section className="menu-tools" aria-label="Menu filters">
        <label className="menu-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search food or drinks"
            type="search"
          />
        </label>
        <div className="category-chips" aria-label="Categories">
          {["All", ...categories].map((category) => (
            <button
              className={activeCategory === category ? "category-chip category-chip-active" : "category-chip"}
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      <section
        ref={menuListRef}
        className={menuScrollLocked ? "menu-list menu-list-locked" : "menu-list"}
        aria-label="Menu"
        onScroll={handleMenuScroll}
        onTouchMove={handleMenuTouchMove}
        onTouchStart={handleMenuTouchStart}
        onWheel={handleMenuWheel}
      >
        {visibleCategories.map((category) => (
          <div className="menu-category" key={category}>
            <h2>{category}</h2>
            <div className="menu-items">
              {filteredItems
                .filter((item) => item.category === category)
                .map((item) => {
                  const option = optionFor(item);
                  const optionGroups = optionGroupsFor(item);
                  const itemExtras = extrasFor(item);
                  const hasExtras = isFoodItem(item) && Boolean(menu.extras?.length);
                  const quantity = quantityFor(item);

                  return (
                    <article className="menu-item-card" key={item.id}>
                      <div className={`menu-item-icon menu-item-icon-${menuIconTone(item)}`}>
                        <MenuItemIcon item={item} />
                      </div>
                      <div className="menu-item-copy">
                        <div>
                          <h3>{item.name}</h3>
                          <p>
                            {item.description ||
                              (item.ingredients?.length ? item.ingredients.join(", ") : "Phangan Arena favorite")}
                          </p>
                        </div>
                        {item.options?.length ? (
                          <label className="item-option">
                            <span>Option</span>
                            <select
                              value={option}
                              onChange={(event) =>
                                setSelectedOptions((current) => ({ ...current, [item.id]: event.target.value }))
                              }
                            >
                              {item.options.map((choice) => (
                                <option value={choice} key={choice}>
                                  {choice}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {item.optionGroups?.length ? (
                          <div className="item-option-groups">
                            {item.optionGroups.map((group) => (
                              <label className="item-option" key={group.name}>
                                <span>{group.name}</span>
                                <select
                                  value={selectedOptionGroups[item.id]?.[group.name] || group.values?.[0] || ""}
                                  onChange={(event) =>
                                    setSelectedOptionGroups((current) => ({
                                      ...current,
                                      [item.id]: {
                                        ...(current[item.id] || {}),
                                        [group.name]: event.target.value
                                      }
                                    }))
                                  }
                                >
                                  {group.values.map((choice) => (
                                    <option value={choice} key={choice}>
                                      {choice}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                          </div>
                        ) : null}
                        {hasExtras ? (
                          <details className="item-extras">
                            <summary>
                              <span>{itemExtras.length ? `${itemExtras.length} extras selected` : "Add extras"}</span>
                              <ChevronDown size={15} />
                            </summary>
                            <div aria-label={`Extras for ${item.name}`}>
                              {menu.extras.map((extra) => {
                                const checked = itemExtras.some((selected) => selected.id === extra.id);

                                return (
                                  <label className={checked ? "extra-chip extra-chip-active" : "extra-chip"} key={extra.id}>
                                    <input
                                      checked={checked}
                                      type="checkbox"
                                      onChange={(event) =>
                                        setSelectedExtras((current) => {
                                          const currentIds = current[item.id] || [];
                                          const nextIds = event.target.checked
                                            ? [...currentIds, extra.id]
                                            : currentIds.filter((id) => id !== extra.id);

                                          return { ...current, [item.id]: nextIds };
                                        })
                                      }
                                    />
                                    <span>{extra.name}</span>
                                    <strong>+{money(extra.price)}</strong>
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        ) : null}
                        <div className="menu-item-meta">
                          <strong>{money(item.price)}</strong>
                          {item.discountPercent ? <span>{item.discountPercent}% off</span> : null}
                        </div>
                      </div>
                      <div className="quantity-control">
                        <button
                          type="button"
                          onClick={() => onRemove(item.id, option, optionGroups, itemExtras, fallbackCartKeyFor(item))}
                          disabled={!quantity}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Minus size={16} />
                        </button>
                        <span>{quantity}</span>
                        <button
                          type="button"
                          onClick={() => onAdd(item.id, option, optionGroups, itemExtras)}
                          aria-label={`Add ${item.name}`}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? <div className="menu-empty">No items found</div> : null}
      </section>

      <div className="sticky-cart">
        <div>
          <span>{cartCount} items</span>
          <strong>{money(cartTotal)}</strong>
        </div>
        <button type="button" onClick={onCheckout} disabled={!cartCount}>
          View order
        </button>
      </div>
      {activePromo ? (
        <PromoCustomizer
          promo={activePromo}
          menu={menu}
          onClose={() => setActivePromo(null)}
          onAddPromo={onAddPromo}
        />
      ) : null}
    </main>
  );
}

function ConfirmView({ cart, notes, onNotesChange, onBack, onAddItem, onRemoveItem, onDeleteItem, onFinish, busy }) {
  const subtotal = cart.reduce((sum, item) => sum + cartLineGross(item), 0);
  const discountTotal = cart.reduce((sum, item) => sum + cartLineDiscount(item), 0);
  const total = subtotal - discountTotal;

  return (
    <main className="account-page">
      <AccountHeader title="Your order" />
      <section className="account-scroll-area">
        <div className="confirm-panel account-panel">
          {cart.length === 0 ? <div className="menu-empty">Your order is empty</div> : null}
          {cart.map((item) => (
            <div className="confirm-row" key={item.cartKey}>
              <div>
                <strong>{item.name}</strong>
                <span>{itemDetailText(item) ? `${itemDetailText(item)} · ` : ""}Qty {item.quantity}</span>
              </div>
              <span>{money(cartLineTotal(item))}</span>
              <div className="confirm-item-actions">
                <button type="button" onClick={() => onRemoveItem(item.cartKey)} aria-label={`Remove one ${item.name}`}>
                  <Minus size={15} />
                </button>
                <strong>{item.quantity}</strong>
                <button type="button" onClick={() => onAddItem(item.cartKey)} aria-label={`Add one ${item.name}`}>
                  <Plus size={15} />
                </button>
                <button
                  className="confirm-delete-button"
                  type="button"
                  onClick={() => onDeleteItem(item.cartKey)}
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          <label className="order-notes">
            <span>Special instructions</span>
            <textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Anything we should know?"
              maxLength={280}
              rows={3}
            />
          </label>
          <div className="totals-box">
            <span>Subtotal <strong>{money(subtotal)}</strong></span>
            <span>Discounts <strong>-{money(discountTotal)}</strong></span>
            <span>Total <strong>{money(total)}</strong></span>
          </div>
        </div>
      </section>
      <div className="confirm-fixed-footer">
        <button className="finish-order-button confirm-fixed-button" type="button" onClick={onFinish} disabled={busy || cart.length === 0}>
          {busy ? <Loader2 className="spin" size={20} /> : <CheckCircle2 size={20} />}
          <span>Confirm order</span>
        </button>
        <button className="scan-again-button confirm-secondary-button" type="button" onClick={onBack}>
          <Utensils size={18} />
          <span>Go to menu</span>
        </button>
      </div>
    </main>
  );
}

function OrderView({ order, pushEnabled, onMenu, onEnableNotifications, showNotificationButton, statusPulse, loading }) {
  const tone = statusTone[order?.status] || "neutral";

  return (
    <main className="customer-shell">
      <section className={statusPulse ? "customer-card status-change" : "customer-card"} aria-label="Current order">
        <BrandMark />
        <div className="order-view">
          <div className="order-topline">
            <div className="order-identity">
              <p className="eyebrow">Your order</p>
              <h1>{order.customerName}</h1>
              <p>Order #{order.orderNumber}</p>
            </div>
            <div className={`notification-bell bell-${tone}`} aria-hidden="true">
              {pushEnabled ? <BellRing size={26} /> : <Bell size={26} />}
            </div>
          </div>

          <div className={`order-stage stage-${tone}`}>
            <div className="stage-orbit" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="stage-icon">
              <StatusIcon status={order.status} loading={loading} />
            </div>
            <div className="stage-copy">
              <span>Status</span>
              <strong>{statusLabels[order.status] || "Updated"}</strong>
            </div>
          </div>

          <div className="order-receipt">
            {(order.items || []).map((item) => (
              <div className="receipt-row" key={`${item.menuItemId}-${item.option || ""}-${item.extras?.map((extra) => extra.extraId).join("-") || ""}`}>
                <span>
                  {item.quantity}x {item.name}
                  {itemDetailText(item) ? ` · ${itemDetailText(item)}` : ""}
                  {order.giftOrder ? " · Gift" : ""}
                </span>
                <strong>{order.giftOrder ? "Gift" : money(item.lineTotal)}</strong>
              </div>
            ))}
            {order.giftOrder ? (
              <div className="receipt-total">
                <span>Total</span>
                <strong>Gift</strong>
              </div>
            ) : (
              <>
                <div className="receipt-total">
                  <span>Discounts</span>
                  <strong>-{money(order.discountTotal)}</strong>
                </div>
                <div className="receipt-total">
                  <span>Paid</span>
                  <strong>{money(order.total)}</strong>
                </div>
              </>
            )}
            {order.notes ? (
              <div className="receipt-note">
                <span>Note</span>
                <p>{order.notes}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className={`status-pill status-${tone}`} role="status" aria-live="polite">
          <StatusIcon status={order?.status} loading={loading} />
          <span>{order.message || statusMessages[order.status]}</span>
        </div>

        <div className="customer-secondary-actions">
          {showNotificationButton ? (
            <button className="scan-again-button notification-button" type="button" onClick={onEnableNotifications}>
              <Bell size={18} />
              <span>Enable notifications</span>
            </button>
          ) : null}
          <button className="scan-again-button" type="button" onClick={onMenu}>
            <Utensils size={18} />
            <span>Go to menu</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function AccountHeader({ title }) {
  return (
    <header className="account-fixed-header">
      <div>
        <p className="eyebrow">Account</p>
        <h1>{title}</h1>
      </div>
    </header>
  );
}

function AccountFooter({ onMenu }) {
  return (
    <div className="account-fixed-footer">
      <button className="scan-again-button" type="button" onClick={onMenu}>
        <Utensils size={18} />
        <span>Go to menu</span>
      </button>
    </div>
  );
}

function HistoryView({ orders, onBack }) {
  return (
    <main className="account-page">
      <AccountHeader title="Order history" />
      <section className="account-scroll-area">
        <div className="confirm-panel account-panel">
        {orders.length === 0 ? <div className="menu-empty">No previous orders yet</div> : null}
        {orders.map((order) => (
          <div className="confirm-row" key={order.id}>
            <div>
              <strong>#{order.orderNumber}</strong>
              <span>{new Date(order.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })}</span>
              <span>{order.items?.map((item) => `${item.quantity}x ${item.name}`).join(", ")}</span>
            </div>
            <span>{order.giftOrder ? "Gift" : money(order.total)}</span>
          </div>
        ))}
        </div>
      </section>
      <AccountFooter onMenu={onBack} />
    </main>
  );
}

function ProfileView({ user, onBack, onRedeemGift, redeemingGiftId, message }) {
  const pendingGifts = (user?.gifts || []).filter((gift) => !gift.redeemed);

  return (
    <main className="account-page">
      <AccountHeader title="Profile" />
      <section className="account-scroll-area">
        <div className="confirm-panel account-panel">
          <div className="confirm-row">
            <div>
              <strong>{user?.displayName}</strong>
              <span>@{user?.username}</span>
            </div>
            <strong>{money(user?.credits)}</strong>
          </div>
          <div className="confirm-section-head">
            <strong>Welcome gifts</strong>
            <span>{pendingGifts.length} available</span>
          </div>
          {message ? <div className="promo-message">{message}</div> : null}
          {pendingGifts.length === 0 ? <div className="menu-empty">No gifts available right now</div> : null}
          {pendingGifts.map((gift) => (
            <div className="confirm-row gift-row" key={gift.id}>
              <div>
                <strong>{gift.name}</strong>
                <span>{gift.category}</span>
                <span>Gift item</span>
              </div>
              <button
                className="admin-primary"
                type="button"
                onClick={() => onRedeemGift(gift.id)}
                disabled={redeemingGiftId === gift.id}
              >
                {redeemingGiftId === gift.id ? <Loader2 className="spin" size={17} /> : <GiftIcon />}
                <span>{redeemingGiftId === gift.id ? "Redeeming..." : "Redeem"}</span>
              </button>
            </div>
          ))}
        </div>
      </section>
      <AccountFooter onMenu={onBack} />
    </main>
  );
}

function GiftIcon() {
  return <Sparkles size={17} />;
}

export default function CustomerApp() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const lastPingRef = useRef(localStorage.getItem("ready-order-last-ping") || "");
  const previousStatusRef = useRef("");
  const [customerToken, setCustomerToken] = useState(() => localStorage.getItem(CUSTOMER_TOKEN_KEY) || "");
  const [customerName, setCustomerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [menu, setMenu] = useState({ promotions: [], items: [], extras: [] });
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState("");
  const [order, setOrder] = useState(null);
  const [view, setView] = useState(customerName || localStorage.getItem(CUSTOMER_TOKEN_KEY) ? "menu" : "name");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [statusPulse, setStatusPulse] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => isRunningInstalled());
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [redeemingGiftId, setRedeemingGiftId] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() =>
    canNotify() ? Notification.permission : "unsupported"
  );

  const showNotificationButton = pushAvailable && !pushEnabled && notificationPermission !== "denied";
  const showInstallNotice = !isInstalled && !installDismissed;
  const showNotificationModal =
    isInstalled && pushAvailable && canNotify() && (!pushEnabled || notificationPermission !== "granted");

  const enableNotifications = useCallback(async () => {
    if (!canNotify()) return;
    setNotificationBusy(true);
    const pushConfig = await api.getPushConfig();
    if (!pushConfig.enabled || !pushConfig.publicKey) {
      setNotificationBusy(false);
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      const currentKey = subscription?.options?.applicationServerKey
        ? arrayBufferToBase64Url(subscription.options.applicationServerKey)
        : "";

      if (subscription && currentKey && currentKey !== pushConfig.publicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushConfig.publicKey)
        });
      }

      await api.savePushSubscription(deviceId, subscription.toJSON());
      setPushEnabled(true);
    } finally {
      setNotificationBusy(false);
    }
  }, [deviceId]);

  const refreshOrder = useCallback(async () => {
    try {
      const data = await api.getCustomerOrder(deviceId, customerToken);
      setOrder(data.order);
      if (data.user) setCurrentUser(data.user);

      if (data.order?.status && previousStatusRef.current && data.order.status !== previousStatusRef.current) {
        setStatusPulse(false);
        window.requestAnimationFrame(() => setStatusPulse(true));
      }

      if (data.order?.status) previousStatusRef.current = data.order.status;

      if (data.order?.notificationPingAt && data.order.notificationPingAt !== lastPingRef.current) {
        lastPingRef.current = data.order.notificationPingAt;
        localStorage.setItem("ready-order-last-ping", data.order.notificationPingAt);
        showLocalOrderNotification(data.order).catch(() => {});
      }
    } catch {
      // Polling should never block ordering.
    }
  }, [customerToken, deviceId]);

  useEffect(() => {
    api.getMenu().then(setMenu).catch(() => {});
    refreshOrder();
    const timer = window.setInterval(refreshOrder, 4000);
    return () => window.clearInterval(timer);
  }, [refreshOrder]);

  useEffect(() => {
    if (!customerToken) {
      setCurrentUser(null);
      return;
    }

    api.getCustomerMe(customerToken)
      .then((data) => setCurrentUser(data.user))
      .catch(() => {
        localStorage.removeItem(CUSTOMER_TOKEN_KEY);
        setCustomerToken("");
        setCurrentUser(null);
      });
  }, [customerToken]);

  useEffect(() => {
    async function checkPushState() {
      if (!canNotify()) return;
      const pushConfig = await api.getPushConfig();
      setPushAvailable(Boolean(pushConfig.enabled && pushConfig.publicKey));
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (Notification.permission === "granted" && subscription) {
        await api.savePushSubscription(deviceId, subscription.toJSON());
      }
      if (Notification.permission === "granted" && !subscription && pushConfig.enabled && pushConfig.publicKey) {
        await enableNotifications().catch(() => {});
        setNotificationPermission(Notification.permission);
        return;
      }
      setPushEnabled(Boolean(subscription && Notification.permission === "granted"));
      setNotificationPermission(Notification.permission);
    }
    checkPushState().catch(() => {});
  }, [deviceId, enableNotifications]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPromptEvent(event);
      setInstallDismissed(false);
      setIsInstalled(isRunningInstalled());
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setInstallDismissed(false);
      setInstallMessage("");
      enableNotifications().catch(() => {});
    }

    const displayModeQuery = window.matchMedia?.("(display-mode: standalone)");
    const handleDisplayModeChange = () => setIsInstalled(isRunningInstalled());

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayModeQuery?.addEventListener?.("change", handleDisplayModeChange);
    setIsInstalled(isRunningInstalled());

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayModeQuery?.removeEventListener?.("change", handleDisplayModeChange);
    };
  }, [enableNotifications]);

  async function installApp() {
    if (!installPromptEvent) {
      setInstallMessage("Use your browser menu and choose Add to Home Screen or Install App.");
      return;
    }

    installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      setInstallMessage("Installing app...");
    } else {
      setInstallMessage("Install the app to receive the best pickup alerts.");
    }
    setInstallPromptEvent(null);
  }

  function renderCustomerOverlays() {
    return (
      <>
        <InstallAppNotice
          visible={showInstallNotice}
          canInstall={Boolean(installPromptEvent)}
          message={installMessage}
          onInstall={installApp}
          onClose={() => setInstallDismissed(true)}
        />
        <NotificationRequiredModal
          visible={showNotificationModal}
          permission={notificationPermission}
          busy={notificationBusy}
          onEnable={enableNotifications}
        />
        <AccountAccessModal
          visible={loginModalOpen}
          busy={loginBusy}
          message={loginMessage}
          username={loginUsername}
          password={loginPassword}
          onUsernameChange={setLoginUsername}
          onPasswordChange={setLoginPassword}
          onClose={() => setLoginModalOpen(false)}
          onSubmit={async () => {
            setLoginBusy(true);
            setLoginMessage("");
            try {
              const data = await api.loginCustomer({ username: loginUsername, password: loginPassword });
              localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
              setCustomerToken(data.token);
              setCurrentUser(data.user);
              setCustomerName(data.user.displayName);
              localStorage.setItem(NAME_KEY, data.user.displayName);
              setLoginModalOpen(false);
              setView("menu");
            } catch (error) {
              setLoginMessage(error.message);
            } finally {
              setLoginBusy(false);
            }
          }}
        />
      </>
    );
  }

  function addItem(itemId, option = "", options = [], extras = []) {
    const item = menu.items.find((menuItem) => menuItem.id === itemId);
    if (!item) return;
    const cleanOption = option || item.options?.[0] || "";
    const selectedOptions = options.filter((selected) => selected.name && selected.value);
    const selectedExtras = extras.filter((extra) => extra.id && extra.name);
    const selectionKey =
      selectedOptions.length > 0 ? selectedOptions.map((selected) => `${selected.name}:${selected.value}`).join("|") : cleanOption;
    const extrasKey = selectedExtras.map((extra) => extra.id).sort().join(",");
    const cartKey = `${itemId}:${selectionKey}:extras:${extrasKey}`;
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.cartKey === cartKey);
      if (existing) {
        return current.map((cartItem) =>
          cartItem.cartKey === cartKey ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [
        ...current,
        {
          ...item,
          option: selectedOptions.length ? selectedOptions.map((selected) => selected.value).join(" / ") : cleanOption,
          options: selectedOptions,
          extras: selectedExtras,
          cartKey,
          quantity: 1
        }
      ];
    });
  }

  function removeItem(itemId, option = "", options = [], extras = [], fallbackCartKey = "") {
    const selectedOptions = options.filter((selected) => selected.name && selected.value);
    const selectedExtras = extras.filter((extra) => extra.id && extra.name);
    const selectionKey =
      selectedOptions.length > 0 ? selectedOptions.map((selected) => `${selected.name}:${selected.value}`).join("|") : option;
    const extrasKey = selectedExtras.map((extra) => extra.id).sort().join(",");
    const cartKey = `${itemId}:${selectionKey}:extras:${extrasKey}`;
    const targetCartKey = fallbackCartKey || cartKey;
    setCart((current) =>
      current
        .map((item) => (item.cartKey === targetCartKey ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  function addCartItem(cartKey) {
    setCart((current) =>
      current.map((item) =>
        item.cartKey === cartKey
          ? {
              ...item,
              quantity: item.quantity + 1,
              subtotal: typeof item.subtotal === "number" ? (item.subtotal / item.quantity) * (item.quantity + 1) : undefined,
              discountAmount:
                typeof item.discountAmount === "number"
                  ? (item.discountAmount / item.quantity) * (item.quantity + 1)
                  : undefined,
              lineTotal: typeof item.lineTotal === "number" ? (item.lineTotal / item.quantity) * (item.quantity + 1) : undefined
            }
          : item
      )
    );
  }

  function removeCartItem(cartKey) {
    setCart((current) =>
      current
        .map((item) =>
          item.cartKey === cartKey
            ? {
                ...item,
                quantity: item.quantity - 1,
                subtotal: typeof item.subtotal === "number" ? (item.subtotal / item.quantity) * (item.quantity - 1) : undefined,
                discountAmount:
                  typeof item.discountAmount === "number"
                    ? (item.discountAmount / item.quantity) * (item.quantity - 1)
                    : undefined,
                lineTotal: typeof item.lineTotal === "number" ? (item.lineTotal / item.quantity) * (item.quantity - 1) : undefined
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function deleteCartItem(cartKey) {
    setCart((current) => current.filter((item) => item.cartKey !== cartKey));
  }

  function addPromotionItem(promoItem) {
    setCart((current) => {
      const existing = current.find((item) => item.cartKey === promoItem.cartKey);
      if (!existing) return [...current, promoItem];

      return current.map((item) =>
        item.cartKey === promoItem.cartKey
          ? {
              ...item,
              quantity: item.quantity + 1,
              subtotal: item.subtotal + promoItem.subtotal,
              discountAmount: item.discountAmount + promoItem.discountAmount,
              lineTotal: item.lineTotal + promoItem.lineTotal
            }
          : item
      );
    });
  }

  async function finishOrder() {
    setLoading(true);
    try {
      const data = await api.createCustomerOrder({
        customerName,
        deviceId,
        notes,
        items: cart.map((item) => ({
          promoId: item.promoId,
          choices: item.choices,
          menuItemId: item.id,
          option: item.options?.length ? "" : item.option,
          options: item.options || [],
          extras: item.extras || [],
          quantity: item.quantity
        }))
      }, customerToken);
      setOrder(data.order);
      if (data.user) setCurrentUser(data.user);
      setCart([]);
      setNotes("");
      setView("order");
      if (showNotificationButton) enableNotifications().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  if (view === "name") {
    return (
      <>
        <NameGate
          initialName={customerName}
          onContinue={(name) => {
            setCustomerName(name);
            setView("menu");
          }}
          onSignIn={async () => {
            setLoginBusy(true);
            setLoginMessage("");
            try {
              const data = await api.loginCustomer({ username: loginUsername, password: loginPassword });
              localStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
              setCustomerToken(data.token);
              setCurrentUser(data.user);
              setCustomerName(data.user.displayName);
              localStorage.setItem(NAME_KEY, data.user.displayName);
              setView("menu");
            } catch (error) {
              setLoginMessage(error.message);
            } finally {
              setLoginBusy(false);
            }
          }}
          loginBusy={loginBusy}
          loginMessage={loginMessage}
          username={loginUsername}
          password={loginPassword}
          onUsernameChange={setLoginUsername}
          onPasswordChange={setLoginPassword}
        />
        {renderCustomerOverlays()}
      </>
    );
  }

  if (view === "history") {
    return (
      <>
        <HistoryView orders={history} onBack={() => setView("menu")} />
        {renderCustomerOverlays()}
      </>
    );
  }

  if (view === "profile" && currentUser) {
    return (
      <>
        <ProfileView
          user={currentUser}
          onBack={() => setView("menu")}
          message={profileMessage}
          redeemingGiftId={redeemingGiftId}
          onRedeemGift={async (giftId) => {
            if (!customerToken) return;
            setRedeemingGiftId(giftId);
            setProfileMessage("");
            try {
              const data = await api.redeemCustomerGift(customerToken, giftId, { deviceId });
              setCurrentUser(data.user);
              setOrder(data.order);
              setView("order");
            } catch (error) {
              setProfileMessage(error.message);
            } finally {
              setRedeemingGiftId("");
            }
          }}
        />
        {renderCustomerOverlays()}
      </>
    );
  }

  if (view === "confirm") {
    return (
      <>
        <ConfirmView
          cart={cart}
          notes={notes}
          onNotesChange={setNotes}
          onBack={() => setView("menu")}
          onAddItem={addCartItem}
          onRemoveItem={removeCartItem}
          onDeleteItem={deleteCartItem}
          onFinish={finishOrder}
          busy={loading}
        />
        {renderCustomerOverlays()}
      </>
    );
  }

  if (view === "order" && order) {
    return (
      <>
        <OrderView
          order={order}
          pushEnabled={pushEnabled}
          onMenu={() => setView("menu")}
          onEnableNotifications={enableNotifications}
          showNotificationButton={showNotificationButton}
          statusPulse={statusPulse}
          loading={loading}
        />
        {renderCustomerOverlays()}
      </>
    );
  }

  return (
    <>
      <MenuView
        customerName={customerName}
        currentUser={currentUser}
        menu={menu}
        cart={cart}
        onAdd={addItem}
        onAddPromo={addPromotionItem}
        onRemove={removeItem}
        onCheckout={() => setView("confirm")}
        onOpenOrder={() => order && setView("order")}
        onLoginClick={() => setLoginModalOpen(true)}
        onHistory={async () => {
          if (!customerToken) return;
          const data = await api.getCustomerHistory(customerToken);
          setHistory(data.orders || []);
          setView("history");
        }}
        onProfile={() => setView("profile")}
        onLogout={() => {
          localStorage.removeItem(CUSTOMER_TOKEN_KEY);
          setCustomerToken("");
          setCurrentUser(null);
          setLoginUsername("");
          setLoginPassword("");
          setView("menu");
        }}
        order={order}
      />
      {renderCustomerOverlays()}
    </>
  );
}
