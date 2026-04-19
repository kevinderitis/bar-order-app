import { Bell, BellRing, CheckCircle2, Clock3, Loader2, QrCode, Sparkles } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import { api } from "../lib/api.js";
import { getDeviceId } from "../lib/device.js";

const QRScanner = lazy(() => import("../components/QRScanner.jsx"));
const PUSH_LOG_PREFIX = "[ReadyOrderPush:Client]";

const statusLabels = {
  pending_link: "Pending link",
  linked: "Being prepared",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const statusTone = {
  linked: "warm",
  preparing: "warm",
  ready: "ready",
  delivered: "success",
  cancelled: "danger"
};

const statusMessages = {
  pending_link: "Scan the QR code to link your order.",
  linked: "We are working on it now and will notify you when pickup is available.",
  preparing: "Freshly in progress. We will send an alert as soon as it is time to pick up.",
  ready: "Please come to the pickup counter when you are ready.",
  delivered: "Thanks for ordering with us.",
  cancelled: "Please check with the bar team."
};

function StatusIcon({ status, loading }) {
  if (loading) return <Loader2 className="spin" size={18} />;
  if (status === "ready" || status === "delivered") return <CheckCircle2 size={18} />;
  if (status === "linked" || status === "preparing") return <Clock3 size={18} />;
  return <Sparkles size={18} />;
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

async function showLocalOrderNotification(order) {
  console.info(PUSH_LOG_PREFIX, "local notification requested", {
    canNotify: canNotify(),
    permission: canNotify() ? Notification.permission : "unsupported",
    orderId: order?.id,
    status: order?.status,
    notificationPingAt: order?.notificationPingAt,
    notificationMessage: order?.notificationMessage
  });

  if (!canNotify() || Notification.permission !== "granted") {
    console.warn(PUSH_LOG_PREFIX, "local notification skipped", {
      canNotify: canNotify(),
      permission: canNotify() ? Notification.permission : "unsupported"
    });
    return;
  }

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
    data: {
      url: "/"
    }
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
    throw error;
  }
}

export default function CustomerApp() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const lastPingRef = useRef(localStorage.getItem("ready-order-last-ping") || "");
  const previousStatusRef = useRef("");
  const [order, setOrder] = useState(null);
  const [message, setMessage] = useState("Scan the QR code to link your order");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [notificationPrompt, setNotificationPrompt] = useState("hidden");
  const [statusPulse, setStatusPulse] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    canNotify() ? Notification.permission : "unsupported"
  );
  const tone = statusTone[order?.status] || "neutral";
  const hasLinkedOrder = Boolean(order);
  const showNotificationButton = pushAvailable && !pushEnabled && notificationPermission !== "denied";
  const showNotificationPrompt = notificationPrompt !== "hidden" && showNotificationButton;

  const enableNotifications = useCallback(async () => {
    try {
      if (!canNotify()) {
        setMessage("Push notifications are not supported on this browser");
        return;
      }

      const pushConfig = await api.getPushConfig();

      if (!pushConfig.enabled || !pushConfig.publicKey) {
        setMessage("Push notifications are not configured yet");
        return;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission !== "granted") {
        setMessage("Notifications were not enabled");
        return;
      }

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
      try {
        await registration.showNotification("Notifications enabled", {
          body: "We'll notify you when your order is ready for pickup.",
          icon: "/icons/icon.svg",
          badge: "/icons/icon.svg",
          tag: "ready-order-enabled",
          renotify: true
        });
      } catch {
        // The subscription is still valid even if the OS suppresses the immediate test notification.
      }
      setPushEnabled(true);
      setNotificationPrompt("hidden");
      setMessage("Notifications enabled. We'll notify you when it's ready for pickup.");
    } catch {
      setMessage("Unable to enable notifications");
    }
  }, [deviceId]);

  const dismissNotificationPrompt = useCallback(() => {
    setNotificationPrompt("closing");
    window.setTimeout(() => setNotificationPrompt("hidden"), 420);
  }, []);

  const refreshOrder = useCallback(async () => {
    try {
      const data = await api.getCustomerOrder(deviceId);
      setOrder(data.order);
      if (data.order) setMessage(statusMessages[data.order.status] || data.order.message);
      if (!data.order) setMessage("Scan the QR code to link your order");

      if (data.order?.status && previousStatusRef.current && data.order.status !== previousStatusRef.current) {
        setStatusPulse(false);
        window.requestAnimationFrame(() => setStatusPulse(true));
      }

      if (data.order?.status) {
        previousStatusRef.current = data.order.status;
      }

      if (data.order?.notificationPingAt && data.order.notificationPingAt !== lastPingRef.current) {
        console.info(PUSH_LOG_PREFIX, "notificationPingAt changed", {
          previous: lastPingRef.current,
          next: data.order.notificationPingAt,
          order: data.order
        });
        lastPingRef.current = data.order.notificationPingAt;
        localStorage.setItem("ready-order-last-ping", data.order.notificationPingAt);
        showLocalOrderNotification(data.order).catch(() => {});
      }
    } catch {
      setMessage("Unable to refresh order status");
    }
  }, [deviceId]);

  useEffect(() => {
    refreshOrder();
    const timer = window.setInterval(refreshOrder, 4000);
    return () => window.clearInterval(timer);
  }, [refreshOrder]);

  useEffect(() => {
    let active = true;

    async function checkPushState() {
      if (!canNotify()) return;

      try {
        const pushConfig = await api.getPushConfig();
        if (!active) return;

        setPushAvailable(Boolean(pushConfig.enabled && pushConfig.publicKey));
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        const currentKey = subscription?.options?.applicationServerKey
          ? arrayBufferToBase64Url(subscription.options.applicationServerKey)
          : "";

        if (subscription && currentKey && currentKey !== pushConfig.publicKey) {
          await subscription.unsubscribe();
          subscription = null;
        }

        if (Notification.permission === "granted" && pushConfig.enabled && pushConfig.publicKey) {
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(pushConfig.publicKey)
            });
          }

          await api.savePushSubscription(deviceId, subscription.toJSON());
        }

        if (!active) return;
        setPushEnabled(Boolean(subscription && Notification.permission === "granted"));
        setNotificationPermission(Notification.permission);
      } catch {
        if (active) setPushAvailable(false);
      }
    }

    checkPushState();

    return () => {
      active = false;
    };
  }, [deviceId]);

  useEffect(() => {
    if (
      hasLinkedOrder &&
      pushAvailable &&
      !pushEnabled &&
      notificationPermission === "default" &&
      notificationPrompt === "hidden"
    ) {
      const timer = window.setTimeout(() => setNotificationPrompt("open"), 520);
      return () => window.clearTimeout(timer);
    }
  }, [hasLinkedOrder, notificationPermission, notificationPrompt, pushAvailable, pushEnabled]);

  const handleScan = useCallback(
    async (qrCode) => {
      setScannerOpen(false);
      setLoading(true);
      try {
        const data = await api.linkOrder(qrCode, deviceId);
        setOrder(data.order);
        setMessage(statusMessages[data.order?.status] || data.message);
        if (pushAvailable && !pushEnabled && notificationPermission === "default") {
          setNotificationPrompt("open");
        }
      } catch (error) {
        setMessage(error.message || "No pending order found");
      } finally {
        setLoading(false);
      }
    },
    [deviceId, notificationPermission, pushAvailable, pushEnabled]
  );

  return (
    <main className="customer-shell">
      <section className={statusPulse ? "customer-card status-change" : "customer-card"} aria-label="Order link">
        <BrandMark />

        {hasLinkedOrder ? (
          <div className="order-view" aria-label="Current order">
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
          </div>
        ) : (
          <>
            <div className="customer-copy">
              <p className="eyebrow">Ready Order</p>
              <h1>Ready to pick up?</h1>
              <p>Scan the QR code to link your order</p>
            </div>

            <button className="scan-button" type="button" onClick={() => setScannerOpen(true)} disabled={loading}>
              {loading ? <Loader2 className="spin" size={24} /> : <QrCode size={26} />}
              <span>Scan QR</span>
            </button>
          </>
        )}

        <div className={`status-pill status-${tone}`} role="status" aria-live="polite">
          <StatusIcon status={order?.status} loading={loading} />
          <span>{message}</span>
        </div>

        {hasLinkedOrder ? (
          <div className="customer-secondary-actions">
            {showNotificationButton && notificationPrompt === "hidden" ? (
              <button
                className={notificationPrompt === "closing" ? "scan-again-button notification-button button-pop" : "scan-again-button notification-button"}
                type="button"
                onClick={() => setNotificationPrompt("open")}
              >
                <Bell size={18} />
                <span>Enable notifications</span>
              </button>
            ) : null}
            <button className="scan-again-button" type="button" onClick={() => setScannerOpen(true)} disabled={loading}>
              <QrCode size={18} />
              <span>Scan again</span>
            </button>
          </div>
        ) : null}
      </section>

      {scannerOpen ? (
        <Suspense
          fallback={
            <div className="scanner-overlay" role="status">
              <Loader2 className="spin" size={28} />
            </div>
          }
        >
          <QRScanner onClose={() => setScannerOpen(false)} onScan={handleScan} />
        </Suspense>
      ) : null}

      {showNotificationPrompt ? (
        <div
          className={
            notificationPrompt === "closing" ? "notification-modal-overlay modal-closing" : "notification-modal-overlay"
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-title"
        >
          <div className="notification-modal">
            <div className="modal-bell" aria-hidden="true">
              <BellRing size={34} />
            </div>
            <div className="modal-copy">
              <p className="eyebrow">Pickup alerts</p>
              <h2 id="notification-title">Know exactly when it is ready</h2>
              <p>Allow notifications so we can let you know the moment your order is ready for pickup.</p>
            </div>
            <div className="modal-actions">
              <button className="modal-primary" type="button" onClick={enableNotifications}>
                <BellRing size={18} />
                <span>Enable notifications</span>
              </button>
              <button className="modal-secondary" type="button" onClick={dismissNotificationPrompt}>
                <span>Not now</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
