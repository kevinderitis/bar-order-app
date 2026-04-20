import {
  Bell,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Utensils
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import { api } from "../lib/api.js";
import { getDeviceId } from "../lib/device.js";

const PUSH_LOG_PREFIX = "[ReadyOrderPush:Client]";
const NAME_KEY = "ready-order-customer-name";

const statusLabels = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready for pickup",
  delivered: "Delivered"
};

const statusTone = {
  pending: "warm",
  preparing: "warm",
  ready: "ready",
  delivered: "success"
};

const statusMessages = {
  pending: "Your order was received. We will start preparing it soon.",
  preparing: "Freshly in progress. We will send an alert as soon as it is time to pick up.",
  ready: "Please come to the pickup counter when you are ready.",
  delivered: "Thanks for ordering with us."
};

function money(value) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(value || 0);
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
  if (status === "ready" || status === "delivered") return <CheckCircle2 size={18} />;
  if (status === "pending" || status === "preparing") return <Clock3 size={18} />;
  return <Sparkles size={18} />;
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

function NameGate({ initialName, onContinue }) {
  const [name, setName] = useState(initialName || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
          <p className="eyebrow">Ready Order</p>
          <h1>Start your pickup</h1>
          <p>Choose a unique name so the bar can call your order.</p>
        </div>
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
          <span>Enter menu</span>
        </button>
        {message ? <div className="status-pill status-warm">{message}</div> : null}
      </form>
    </main>
  );
}

function MenuView({ customerName, menu, cart, onAdd, onRemove, onCheckout, onOpenOrder, order }) {
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => {
    const gross = item.price * item.quantity;
    const discount = gross * ((item.discountPercent || 0) / 100);
    return sum + gross - discount;
  }, 0);
  const categories = [...new Set(menu.items.map((item) => item.category))];

  return (
    <main className="menu-page">
      <header className="menu-header">
        <div>
          <p className="eyebrow">Pickup menu</p>
          <h1>Hi, {customerName}</h1>
        </div>
        <button className="menu-order-chip" type="button" onClick={onOpenOrder} disabled={!order}>
          <ShoppingBag size={17} />
          <span>{order ? `#${order.orderNumber}` : "No order"}</span>
        </button>
      </header>

      <section className="promo-carousel" aria-label="Promotions">
        {menu.promotions.map((promo) => (
          <button className={`promo-card promo-${promo.accent}`} type="button" key={promo.id} onClick={() => onAdd(promo.itemId)}>
            <span>Promo</span>
            <strong>{promo.title}</strong>
            <small>{promo.subtitle}</small>
          </button>
        ))}
      </section>

      <section className="menu-list" aria-label="Menu">
        {categories.map((category) => (
          <div className="menu-category" key={category}>
            <h2>{category}</h2>
            <div className="menu-items">
              {menu.items
                .filter((item) => item.category === category)
                .map((item) => {
                  const quantity = cart.find((cartItem) => cartItem.id === item.id)?.quantity || 0;

                  return (
                    <article className="menu-item-card" key={item.id}>
                      <div className="menu-item-icon">
                        <Utensils size={24} />
                      </div>
                      <div className="menu-item-copy">
                        <div>
                          <h3>{item.name}</h3>
                          <p>{item.description}</p>
                        </div>
                        <div className="menu-item-meta">
                          <strong>{money(item.price)}</strong>
                          {item.discountPercent ? <span>{item.discountPercent}% off</span> : null}
                        </div>
                      </div>
                      <div className="quantity-control">
                        <button type="button" onClick={() => onRemove(item.id)} disabled={!quantity} aria-label={`Remove ${item.name}`}>
                          <Minus size={16} />
                        </button>
                        <span>{quantity}</span>
                        <button type="button" onClick={() => onAdd(item.id)} aria-label={`Add ${item.name}`}>
                          <Plus size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      <div className="sticky-cart">
        <div>
          <span>{cartCount} items</span>
          <strong>{money(cartTotal)}</strong>
        </div>
        <button type="button" onClick={onCheckout} disabled={!cartCount}>
          Confirm order
        </button>
      </div>
    </main>
  );
}

function ConfirmView({ cart, onBack, onFinish, busy }) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity * ((item.discountPercent || 0) / 100),
    0
  );
  const total = subtotal - discountTotal;

  return (
    <main className="confirm-page">
      <header className="confirm-header">
        <button className="admin-secondary" type="button" onClick={onBack}>
          <ChevronLeft size={17} />
          <span>Menu</span>
        </button>
        <div>
          <p className="eyebrow">Confirm</p>
          <h1>Your order</h1>
        </div>
      </header>
      <section className="confirm-panel">
        {cart.map((item) => (
          <div className="confirm-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <span>Qty {item.quantity}</span>
            </div>
            <span>{money(item.price * item.quantity * (1 - (item.discountPercent || 0) / 100))}</span>
          </div>
        ))}
        <div className="totals-box">
          <span>Subtotal <strong>{money(subtotal)}</strong></span>
          <span>Discounts <strong>-{money(discountTotal)}</strong></span>
          <span>Total <strong>{money(total)}</strong></span>
        </div>
      </section>
      <button className="finish-order-button" type="button" onClick={onFinish} disabled={busy}>
        {busy ? <Loader2 className="spin" size={20} /> : <CheckCircle2 size={20} />}
        <span>Finish order</span>
      </button>
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
              <div className="receipt-row" key={item.menuItemId}>
                <span>{item.quantity}x {item.name}</span>
                <strong>{money(item.lineTotal)}</strong>
              </div>
            ))}
            <div className="receipt-total">
              <span>Discounts</span>
              <strong>-{money(order.discountTotal)}</strong>
            </div>
            <div className="receipt-total">
              <span>Paid</span>
              <strong>{money(order.total)}</strong>
            </div>
          </div>
        </div>

        <div className={`status-pill status-${tone}`} role="status" aria-live="polite">
          <StatusIcon status={order?.status} loading={loading} />
          <span>{statusMessages[order.status] || order.message}</span>
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

export default function CustomerApp() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const lastPingRef = useRef(localStorage.getItem("ready-order-last-ping") || "");
  const previousStatusRef = useRef("");
  const [customerName, setCustomerName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [menu, setMenu] = useState({ promotions: [], items: [] });
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [view, setView] = useState(customerName ? "menu" : "name");
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [statusPulse, setStatusPulse] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    canNotify() ? Notification.permission : "unsupported"
  );

  const showNotificationButton = pushAvailable && !pushEnabled && notificationPermission !== "denied";

  const enableNotifications = useCallback(async () => {
    if (!canNotify()) return;
    const pushConfig = await api.getPushConfig();
    if (!pushConfig.enabled || !pushConfig.publicKey) return;

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
  }, [deviceId]);

  const refreshOrder = useCallback(async () => {
    try {
      const data = await api.getCustomerOrder(deviceId);
      setOrder(data.order);

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
  }, [deviceId]);

  useEffect(() => {
    api.getMenu().then(setMenu).catch(() => {});
    refreshOrder();
    const timer = window.setInterval(refreshOrder, 4000);
    return () => window.clearInterval(timer);
  }, [refreshOrder]);

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
      setPushEnabled(Boolean(subscription && Notification.permission === "granted"));
      setNotificationPermission(Notification.permission);
    }
    checkPushState().catch(() => {});
  }, [deviceId]);

  function addItem(itemId) {
    const item = menu.items.find((menuItem) => menuItem.id === itemId);
    if (!item) return;
    setCart((current) => {
      const existing = current.find((cartItem) => cartItem.id === itemId);
      if (existing) {
        return current.map((cartItem) =>
          cartItem.id === itemId ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function removeItem(itemId) {
    setCart((current) =>
      current
        .map((item) => (item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0)
    );
  }

  async function finishOrder() {
    setLoading(true);
    try {
      const data = await api.createCustomerOrder({
        customerName,
        deviceId,
        items: cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity }))
      });
      setOrder(data.order);
      setCart([]);
      setView("order");
      if (showNotificationButton) enableNotifications().catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  if (view === "name") {
    return <NameGate initialName={customerName} onContinue={(name) => { setCustomerName(name); setView("menu"); }} />;
  }

  if (view === "confirm") {
    return <ConfirmView cart={cart} onBack={() => setView("menu")} onFinish={finishOrder} busy={loading} />;
  }

  if (view === "order" && order) {
    return (
      <OrderView
        order={order}
        pushEnabled={pushEnabled}
        onMenu={() => setView("menu")}
        onEnableNotifications={enableNotifications}
        showNotificationButton={showNotificationButton}
        statusPulse={statusPulse}
        loading={loading}
      />
    );
  }

  return (
    <MenuView
      customerName={customerName}
      menu={menu}
      cart={cart}
      onAdd={addItem}
      onRemove={removeItem}
      onCheckout={() => setView("confirm")}
      onOpenOrder={() => order && setView("order")}
      order={order}
    />
  );
}
