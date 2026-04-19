import { Bell, LogOut, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import { api } from "../lib/api.js";

const STATUSES = ["pending_link", "linked", "preparing", "ready", "delivered", "cancelled"];

const statusLabels = {
  pending_link: "Pending link",
  linked: "Linked",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("ready-order-admin-token") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const hasPending = useMemo(() => orders.some((order) => order.status === "pending_link"), [orders]);

  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getOrders(token);
      setOrders(data.orders);
    } catch (error) {
      setMessage(error.message);
      if (error.message.includes("session") || error.message.includes("Authentication")) {
        localStorage.removeItem("ready-order-admin-token");
        setToken("");
      }
    }
  }, [token]);

  useEffect(() => {
    loadOrders();
    const timer = window.setInterval(loadOrders, 5000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const data = await api.login({ username, password });
      localStorage.setItem("ready-order-admin-token", data.token);
      setToken(data.token);
      setUsername("");
      setPassword("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOrder(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await api.createOrder(token, customerName);
      setCustomerName("");
      setMessage("Order created");
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(orderId, status) {
    setMessage("");
    try {
      await api.updateStatus(token, orderId, status);
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handlePing(orderId) {
    setMessage("");
    try {
      const data = await api.pingOrder(token, orderId);
      setMessage(data.message);
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleDelete(orderId, customerName) {
    if (!window.confirm(`Delete order for ${customerName}?`)) return;

    setMessage("");
    try {
      const data = await api.deleteOrder(token, orderId);
      setMessage(data.message);
      await loadOrders();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function logout() {
    localStorage.removeItem("ready-order-admin-token");
    setToken("");
    setOrders([]);
  }

  if (!token) {
    return (
      <main className="admin-login-shell">
        <form className="login-panel" onSubmit={handleLogin}>
          <BrandMark compact />
          <div>
            <p className="eyebrow">Bar Admin</p>
            <h1>Sign in</h1>
          </div>
          <label>
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          <button className="admin-primary" type="submit" disabled={busy}>
            <ShieldCheck size={18} />
            <span>{busy ? "Signing in" : "Sign in"}</span>
          </button>
          {message ? <p className="admin-message">{message}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <BrandMark compact />
          <div>
            <p className="eyebrow">Bar Admin</p>
            <h1>Orders</h1>
          </div>
        </div>
        <div className="admin-actions">
          <button className="admin-secondary" type="button" onClick={loadOrders}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button className="admin-secondary" type="button" onClick={logout}>
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </header>

      <section className="admin-create">
        <form onSubmit={handleCreateOrder}>
          <label>
            <span>Customer name</span>
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="e.g. Alex Morgan"
              maxLength={80}
            />
          </label>
          <button className="admin-primary" type="submit" disabled={busy || !customerName.trim() || hasPending}>
            <Plus size={18} />
            <span>Create order</span>
          </button>
        </form>
        <p>{hasPending ? "Link the current pending order before creating another one." : "New orders start pending."}</p>
      </section>

      {message ? <p className="admin-message">{message}</p> : null}

      <section className="orders-panel" aria-label="Orders">
        <div className="orders-table orders-head">
          <span>Customer</span>
          <span>Status</span>
          <span>Linked</span>
          <span>Updated</span>
          <span>Actions</span>
        </div>
        {orders.length === 0 ? (
          <div className="empty-orders">No orders yet</div>
        ) : (
          orders.map((order) => (
            <div className="orders-table order-row" key={order.id}>
              <strong>{order.customerName}</strong>
              <select value={order.status} onChange={(event) => handleStatusChange(order.id, event.target.value)}>
                {STATUSES.map((status) => (
                  <option value={status} key={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <span>{order.linkedAt ? formatDate(order.linkedAt) : "-"}</span>
              <span>{formatDate(order.updatedAt)}</span>
              <div className="order-actions">
                <button
                  className="admin-icon-button"
                  type="button"
                  onClick={() => handlePing(order.id)}
                  disabled={!order.linkedDeviceId}
                  aria-label={`Send notification ping to ${order.customerName}`}
                  title="Send ping"
                >
                  <Bell size={16} />
                </button>
                <button
                  className="admin-icon-button admin-danger-button"
                  type="button"
                  onClick={() => handleDelete(order.id, order.customerName)}
                  aria-label={`Delete order for ${order.customerName}`}
                  title="Delete order"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
