import {
  Bell,
  Edit3,
  LogOut,
  PlusCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import { api } from "../lib/api.js";

const STATUSES = ["pending", "preparing", "ready", "delivered"];
const TABS = ["orders", "menu", "promotions"];

const statusLabels = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  delivered: "Delivered"
};

const emptyItemForm = {
  name: "",
  category: "",
  description: "",
  price: "",
  options: "",
  ingredients: "",
  discountPercent: 0,
  active: true,
  featured: false,
  sortOrder: 0
};

const emptyPromotionForm = {
  title: "",
  description: "",
  time: "",
  availableFrom: "",
  availableUntil: "",
  itemId: "",
  imageDataUrl: "",
  accent: "orange",
  active: true,
  sortOrder: 0
};

function money(value) {
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function listToText(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function promotionScheduleLabel(promotion) {
  if (promotion.availableFrom && promotion.availableUntil) {
    return `${promotion.availableFrom} - ${promotion.availableUntil} Thailand`;
  }

  return promotion.time || "All day";
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file"));
      return;
    }

    if (file.size > 1_800_000) {
      reject(new Error("Image must be under 1.8 MB"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function AdminTabs({ activeTab, onChange }) {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {TABS.map((tab) => (
        <button
          className={activeTab === tab ? "admin-tab admin-tab-active" : "admin-tab"}
          type="button"
          key={tab}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
}

function OrdersSection({ orders, onStatusChange, onPing, onDelete }) {
  return (
    <section className="admin-orders-grid" aria-label="Orders">
      {orders.length === 0 ? (
        <div className="empty-orders">No orders yet</div>
      ) : (
        orders.map((order) => (
          <article className="admin-order-card" key={order.id}>
            <div className="admin-order-head">
              <div>
                <span>#{order.orderNumber}</span>
                <h2>{order.customerName}</h2>
                <p>{formatDate(order.createdAt)}</p>
              </div>
              <strong>{money(order.total)}</strong>
            </div>

            <div className="admin-order-items">
              {order.items?.map((item) => (
                <div key={`${item.menuItemId}-${item.option || ""}`}>
                  <span>{item.quantity}x {item.name}{item.option ? ` · ${item.option}` : ""}</span>
                  <strong>{money(item.lineTotal)}</strong>
                </div>
              ))}
            </div>

            <div className="admin-order-total">
              <span>Discounts</span>
              <strong>-{money(order.discountTotal)}</strong>
            </div>

            {order.notes ? (
              <div className="admin-order-note">
                <span>Note</span>
                <p>{order.notes}</p>
              </div>
            ) : null}

            <div className="admin-order-controls">
              <select value={order.status} onChange={(event) => onStatusChange(order.id, event.target.value)}>
                {STATUSES.map((status) => (
                  <option value={status} key={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <button
                className="admin-icon-button"
                type="button"
                onClick={() => onPing(order.id)}
                disabled={!order.linkedDeviceId}
                aria-label={`Send notification ping to ${order.customerName}`}
                title="Send ping"
              >
                <Bell size={16} />
              </button>
              <button
                className="admin-icon-button admin-danger-button"
                type="button"
                onClick={() => onDelete(order.id, order.customerName)}
                aria-label={`Delete order for ${order.customerName}`}
                title="Delete order"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function MenuSection({ items, form, editingId, setForm, onSubmit, onEdit, onCancel, onDelete, onToggle }) {
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);

  return (
    <section className="admin-editor-grid" aria-label="Menu editor">
      <form className="admin-editor-form" onSubmit={onSubmit}>
        <div className="editor-form-head">
          <div>
            <p className="eyebrow">Menu</p>
            <h2>{editingId ? "Edit item" : "Create item"}</h2>
          </div>
          {editingId ? (
            <button className="admin-secondary" type="button" onClick={onCancel}>
              <X size={16} />
              <span>Cancel</span>
            </button>
          ) : null}
        </div>

        <label>
          <span>Name</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          <span>Category</span>
          <input
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            list="menu-categories"
          />
          <datalist id="menu-categories">
            {categories.map((category) => (
              <option value={category} key={category} />
            ))}
          </datalist>
        </label>
        <label>
          <span>Description</span>
          <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <div className="admin-form-row">
          <label>
            <span>Price</span>
            <input
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              inputMode="decimal"
            />
          </label>
          <label>
            <span>Discount %</span>
            <input
              value={form.discountPercent}
              onChange={(event) => setForm({ ...form, discountPercent: event.target.value })}
              inputMode="numeric"
            />
          </label>
        </div>
        <label>
          <span>Options, comma separated</span>
          <input value={form.options} onChange={(event) => setForm({ ...form, options: event.target.value })} />
        </label>
        <label>
          <span>Ingredients, comma separated</span>
          <input value={form.ingredients} onChange={(event) => setForm({ ...form, ingredients: event.target.value })} />
        </label>
        <div className="admin-checks">
          <label>
            <input
              checked={form.active}
              type="checkbox"
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            <span>Active</span>
          </label>
          <label>
            <input
              checked={form.featured}
              type="checkbox"
              onChange={(event) => setForm({ ...form, featured: event.target.checked })}
            />
            <span>Featured</span>
          </label>
        </div>
        <button className="admin-primary" type="submit">
          {editingId ? <Save size={17} /> : <PlusCircle size={17} />}
          <span>{editingId ? "Save item" : "Create item"}</span>
        </button>
      </form>

      <div className="admin-menu-list">
        {items.map((item) => (
          <article className={item.active ? "admin-menu-card" : "admin-menu-card admin-muted-card"} key={item.id}>
            <div>
              <span>{item.category}</span>
              <h3>{item.name}</h3>
              <p>{item.description || item.ingredients?.join(", ") || "No description"}</p>
              {item.options?.length ? <small>Options: {item.options.join(", ")}</small> : null}
            </div>
            <strong>{money(item.price)}</strong>
            <div className="admin-card-actions">
              <button className="admin-secondary" type="button" onClick={() => onToggle(item)}>
                {item.active ? "Disable" : "Activate"}
              </button>
              <button className="admin-icon-button" type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                <Edit3 size={15} />
              </button>
              <button
                className="admin-icon-button admin-danger-button"
                type="button"
                onClick={() => onDelete(item)}
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PromotionsSection({ promotions, menuItems, form, editingId, setForm, onSubmit, onEdit, onCancel, onDelete, onToggle }) {
  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imageDataUrl = await readImageAsDataUrl(file);
      setForm({ ...form, imageDataUrl });
    } catch (error) {
      window.alert(error.message);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="admin-editor-grid" aria-label="Promotions editor">
      <form className="admin-editor-form" onSubmit={onSubmit}>
        <div className="editor-form-head">
          <div>
            <p className="eyebrow">Promotions</p>
            <h2>{editingId ? "Edit promo" : "Create promo"}</h2>
          </div>
          {editingId ? (
            <button className="admin-secondary" type="button" onClick={onCancel}>
              <X size={16} />
              <span>Cancel</span>
            </button>
          ) : null}
        </div>
        <label>
          <span>Title</span>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          <span>Description</span>
          <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </label>
        <div className="admin-form-row">
          <label>
            <span>Display time</span>
            <input value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
          </label>
          <label>
            <span>Accent</span>
            <select value={form.accent} onChange={(event) => setForm({ ...form, accent: event.target.value })}>
              <option value="orange">Orange</option>
              <option value="green">Green</option>
              <option value="red">Red</option>
            </select>
          </label>
        </div>
        <div className="admin-form-row">
          <label>
            <span>Available from</span>
            <input
              value={form.availableFrom}
              onChange={(event) => setForm({ ...form, availableFrom: event.target.value })}
              type="time"
            />
          </label>
          <label>
            <span>Available until</span>
            <input
              value={form.availableUntil}
              onChange={(event) => setForm({ ...form, availableUntil: event.target.value })}
              type="time"
            />
          </label>
        </div>
        <label>
          <span>Button item</span>
          <select value={form.itemId} onChange={(event) => setForm({ ...form, itemId: event.target.value })}>
            <option value="">No item</option>
            {menuItems.map((item) => (
              <option value={item.slug} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Banner image</span>
          <input accept="image/*" type="file" onChange={handleImageChange} />
        </label>
        {form.imageDataUrl ? (
          <div className="admin-image-preview">
            <img src={form.imageDataUrl} alt="Promotion preview" />
            <button className="admin-secondary" type="button" onClick={() => setForm({ ...form, imageDataUrl: "" })}>
              Remove image
            </button>
          </div>
        ) : null}
        <div className="admin-checks">
          <label>
            <input
              checked={form.active}
              type="checkbox"
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            <span>Active</span>
          </label>
        </div>
        <button className="admin-primary" type="submit">
          {editingId ? <Save size={17} /> : <PlusCircle size={17} />}
          <span>{editingId ? "Save promo" : "Create promo"}</span>
        </button>
      </form>

      <div className="admin-menu-list">
        {promotions.map((promotion) => (
          <article
            className={promotion.active ? "admin-menu-card" : "admin-menu-card admin-muted-card"}
            key={promotion.id}
          >
            {promotion.imageDataUrl ? (
              <img className="admin-promo-thumb" src={promotion.imageDataUrl} alt="" aria-hidden="true" />
            ) : null}
            <div>
              <span>{promotionScheduleLabel(promotion)}</span>
              <h3>{promotion.title}</h3>
              <p>{promotion.description}</p>
              <small>{promotion.active ? "Active" : "Inactive"} · {promotion.accent}</small>
            </div>
            <div className="admin-card-actions">
              <button className="admin-secondary" type="button" onClick={() => onToggle(promotion)}>
                {promotion.active ? "Disable" : "Activate"}
              </button>
              <button
                className="admin-icon-button"
                type="button"
                onClick={() => onEdit(promotion)}
                aria-label={`Edit ${promotion.title}`}
              >
                <Edit3 size={15} />
              </button>
              <button
                className="admin-icon-button admin-danger-button"
                type="button"
                onClick={() => onDelete(promotion)}
                aria-label={`Delete ${promotion.title}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("ready-order-admin-token") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [activeTab, setActiveTab] = useState("orders");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState("");
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [editingPromotionId, setEditingPromotionId] = useState("");

  const loadOrders = useCallback(async () => {
    if (!token) return;
    const data = await api.getOrders(token);
    setOrders(data.orders);
  }, [token]);

  const loadMenu = useCallback(async () => {
    if (!token) return;
    const data = await api.getAdminMenuItems(token);
    setMenuItems(data.items);
  }, [token]);

  const loadPromotions = useCallback(async () => {
    if (!token) return;
    const data = await api.getAdminPromotions(token);
    setPromotions(data.promotions);
  }, [token]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      await Promise.all([loadOrders(), loadMenu(), loadPromotions()]);
    } catch (error) {
      setMessage(error.message);
      if (error.message.includes("session") || error.message.includes("Authentication")) {
        localStorage.removeItem("ready-order-admin-token");
        setToken("");
      }
    }
  }, [loadMenu, loadOrders, loadPromotions, token]);

  useEffect(() => {
    loadAll();
    const timer = window.setInterval(loadOrders, 5000);
    return () => window.clearInterval(timer);
  }, [loadAll, loadOrders]);

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

  function editItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      name: item.name,
      category: item.category,
      description: item.description || "",
      price: item.price,
      options: listToText(item.options),
      ingredients: listToText(item.ingredients),
      discountPercent: item.discountPercent || 0,
      active: item.active,
      featured: item.featured,
      sortOrder: item.sortOrder || 0
    });
  }

  async function submitItem(event) {
    event.preventDefault();
    setMessage("");
    try {
      const data = editingItemId
        ? await api.updateMenuItem(token, editingItemId, itemForm)
        : await api.createMenuItem(token, itemForm);
      setMessage(data.message);
      setItemForm(emptyItemForm);
      setEditingItemId("");
      await loadMenu();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleItem(item) {
    try {
      const data = await api.updateMenuItem(token, item.id, { ...item, active: !item.active });
      setMessage(data.message);
      await loadMenu();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      const data = await api.deleteMenuItem(token, item.id);
      setMessage(data.message);
      await loadMenu();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function editPromotion(promotion) {
    setEditingPromotionId(promotion.id);
    setPromotionForm({
      title: promotion.title,
      description: promotion.description,
      time: promotion.time || "",
      availableFrom: promotion.availableFrom || "",
      availableUntil: promotion.availableUntil || "",
      itemId: promotion.itemId || "",
      imageDataUrl: promotion.imageDataUrl || "",
      accent: promotion.accent || "orange",
      active: promotion.active,
      sortOrder: promotion.sortOrder || 0
    });
  }

  async function submitPromotion(event) {
    event.preventDefault();
    setMessage("");
    try {
      const data = editingPromotionId
        ? await api.updatePromotion(token, editingPromotionId, promotionForm)
        : await api.createPromotion(token, promotionForm);
      setMessage(data.message);
      setPromotionForm(emptyPromotionForm);
      setEditingPromotionId("");
      await loadPromotions();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function togglePromotion(promotion) {
    try {
      const data = await api.updatePromotion(token, promotion.id, { ...promotion, active: !promotion.active });
      setMessage(data.message);
      await loadPromotions();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deletePromotion(promotion) {
    if (!window.confirm(`Delete ${promotion.title}?`)) return;
    try {
      const data = await api.deletePromotion(token, promotion.id);
      setMessage(data.message);
      await loadPromotions();
    } catch (error) {
      setMessage(error.message);
    }
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
            <h1>Phangan Arena</h1>
          </div>
        </div>
        <div className="admin-actions">
          <button className="admin-secondary" type="button" onClick={loadAll}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
          <button className="admin-secondary" type="button" onClick={logout}>
            <LogOut size={16} />
            <span>Log out</span>
          </button>
        </div>
      </header>

      <AdminTabs activeTab={activeTab} onChange={setActiveTab} />
      {message ? <p className="admin-message">{message}</p> : null}

      {activeTab === "orders" ? (
        <OrdersSection
          orders={orders}
          onStatusChange={handleStatusChange}
          onPing={handlePing}
          onDelete={handleDelete}
        />
      ) : null}

      {activeTab === "menu" ? (
        <MenuSection
          items={menuItems}
          form={itemForm}
          editingId={editingItemId}
          setForm={setItemForm}
          onSubmit={submitItem}
          onEdit={editItem}
          onCancel={() => {
            setEditingItemId("");
            setItemForm(emptyItemForm);
          }}
          onDelete={deleteItem}
          onToggle={toggleItem}
        />
      ) : null}

      {activeTab === "promotions" ? (
        <PromotionsSection
          promotions={promotions}
          menuItems={menuItems}
          form={promotionForm}
          editingId={editingPromotionId}
          setForm={setPromotionForm}
          onSubmit={submitPromotion}
          onEdit={editPromotion}
          onCancel={() => {
            setEditingPromotionId("");
            setPromotionForm(emptyPromotionForm);
          }}
          onDelete={deletePromotion}
          onToggle={togglePromotion}
        />
      ) : null}
    </main>
  );
}
