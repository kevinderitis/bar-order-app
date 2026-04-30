import {
  Bell,
  ChevronDown,
  Edit3,
  LogOut,
  PlusCircle,
  Save,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import { api } from "../lib/api.js";

const STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered"];
const TABS = ["orders", "reports", "users", "gifts", "menu", "extras", "promotions"];
const ORDER_PAGE_SIZE = 10;

const statusLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
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

const emptyExtraForm = {
  name: "",
  price: "",
  active: true,
  sortOrder: 0
};

const emptyUserForm = {
  username: "",
  displayName: "",
  password: "",
  credits: 0,
  active: true
};

const emptyGiftItemForm = {
  name: "",
  category: "",
  description: "",
  active: true,
  sortOrder: 0
};

function orderItemDetails(item) {
  const extras = item.extras?.length ? `Extras: ${item.extras.map((extra) => extra.name).join(", ")}` : "";
  return [item.option, extras].filter(Boolean).join(" · ");
}

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

function todayInThailand() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function availableStatusesForOrder(order) {
  return STATUSES.filter((status) => status !== "confirmed" || Number(order.creditsCharged || 0) > 0 || order.status === "confirmed");
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

function AdminModal({ title, eyebrow, children, onClose }) {
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <section className="admin-modal-panel">
        <div className="editor-form-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button className="admin-icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function OrdersSection({ orders, onStatusChange, onPing, onDelete }) {
  const [page, setPage] = useState(1);
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredOrders = useMemo(
    () => (statusFilter === "all" ? orders : orders.filter((order) => order.status === statusFilter)),
    [orders, statusFilter]
  );
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleOrders = filteredOrders.slice((safePage - 1) * ORDER_PAGE_SIZE, safePage * ORDER_PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="admin-orders-panel" aria-label="Orders">
      <div className="admin-users-toolbar">
        <div>
          <p className="eyebrow">Orders</p>
          <h2>Live orders</h2>
        </div>
        <div className="admin-filter-group" role="tablist" aria-label="Order status filter">
          {[
            { value: "all", label: "All" },
            { value: "confirmed", label: "Confirmed" },
            { value: "pending", label: "Pending" },
            { value: "preparing", label: "Preparing" },
            { value: "ready", label: "Ready" },
            { value: "delivered", label: "Delivered" }
          ].map((filter) => (
            <button
              key={filter.value}
              className={statusFilter === filter.value ? "admin-filter-button admin-filter-button-active" : "admin-filter-button"}
              type="button"
              onClick={() => {
                setStatusFilter(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="empty-orders">{orders.length === 0 ? "No orders yet" : "No orders match this filter"}</div>
      ) : (
        <>
          <div className="admin-orders-table">
            <div className="admin-orders-head">
              <span>Order</span>
              <span>Customer</span>
              <span>Status</span>
              <span>Total</span>
              <span>Actions</span>
            </div>
            {visibleOrders.map((order) => {
              const expanded = expandedOrderId === order.id;

              return (
                <article className={expanded ? "admin-order-row admin-order-row-open" : "admin-order-row"} key={order.id}>
                  <button
                    className="admin-order-summary"
                    type="button"
                    onClick={() => setExpandedOrderId(expanded ? "" : order.id)}
                    aria-expanded={expanded}
                  >
                    <span>
                      <strong>#{order.orderNumber}</strong>
                      <small>{formatDate(order.createdAt)}</small>
                    </span>
                    <span>
                      <strong>{order.customerName}</strong>
                      <small>{order.giftOrder ? "Gift order" : `${order.items?.length || 0} lines`}</small>
                    </span>
                    <span className={`admin-status-badge admin-status-${order.status}`}>{statusLabels[order.status]}</span>
                    <strong>{money(order.total)}</strong>
                    <ChevronDown className="admin-row-chevron" size={18} />
                  </button>

                  {expanded ? (
                    <div className="admin-order-expanded">
                      <div className="admin-order-items">
                        {order.items?.map((item) => (
                          <div key={`${item.menuItemId}-${item.option || ""}-${item.extras?.map((extra) => extra.extraId).join("-") || ""}`}>
                            <span>{item.quantity}x {item.name}{orderItemDetails(item) ? ` · ${orderItemDetails(item)}` : ""}</span>
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
                          {availableStatusesForOrder(order).map((status) => (
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
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="admin-pagination">
            <span>Page {safePage} of {pageCount}</span>
            <div>
              <button className="admin-secondary" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage === 1}>
                Previous
              </button>
              <button className="admin-secondary" type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={safePage === pageCount}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MenuSection({
  items,
  form,
  editingId,
  modalOpen,
  setForm,
  onSubmit,
  onEdit,
  onCreate,
  onCancel,
  onDelete,
  onToggle
}) {
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))], [items]);

  return (
    <section className="admin-list-section" aria-label="Menu editor">
      <div className="admin-section-toolbar">
        <div>
          <p className="eyebrow">Menu</p>
          <h2>Menu items</h2>
        </div>
        <button className="admin-primary" type="button" onClick={onCreate}>
          <PlusCircle size={17} />
          <span>Create item</span>
        </button>
      </div>

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

      {modalOpen ? (
        <AdminModal title={editingId ? "Edit item" : "Create item"} eyebrow="Menu" onClose={onCancel}>
          <form className="admin-editor-form" onSubmit={onSubmit}>
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
        </AdminModal>
      ) : null}
    </section>
  );
}

function ExtrasSection({
  extras,
  form,
  editingId,
  modalOpen,
  setForm,
  onSubmit,
  onEdit,
  onCreate,
  onCancel,
  onDelete,
  onToggle
}) {
  return (
    <section className="admin-list-section" aria-label="Extras editor">
      <div className="admin-section-toolbar">
        <div>
          <p className="eyebrow">Extras</p>
          <h2>Food add-ons</h2>
        </div>
        <button className="admin-primary" type="button" onClick={onCreate}>
          <PlusCircle size={17} />
          <span>Create extra</span>
        </button>
      </div>

      <div className="admin-menu-list">
        {extras.map((extra) => (
          <article className={extra.active ? "admin-menu-card" : "admin-menu-card admin-muted-card"} key={extra.id}>
            <div>
              <span>{extra.active ? "Active extra" : "Inactive extra"}</span>
              <h3>{extra.name}</h3>
              <p>Available for food items</p>
            </div>
            <strong>{money(extra.price)}</strong>
            <div className="admin-card-actions">
              <button className="admin-secondary" type="button" onClick={() => onToggle(extra)}>
                {extra.active ? "Disable" : "Activate"}
              </button>
              <button className="admin-icon-button" type="button" onClick={() => onEdit(extra)} aria-label={`Edit ${extra.name}`}>
                <Edit3 size={15} />
              </button>
              <button
                className="admin-icon-button admin-danger-button"
                type="button"
                onClick={() => onDelete(extra)}
                aria-label={`Delete ${extra.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {modalOpen ? (
        <AdminModal title={editingId ? "Edit extra" : "Create extra"} eyebrow="Extras" onClose={onCancel}>
          <form className="admin-editor-form" onSubmit={onSubmit}>
            <label>
              <span>Name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              <span>Price</span>
              <input
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                inputMode="decimal"
              />
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
            </div>
            <button className="admin-primary" type="submit">
              {editingId ? <Save size={17} /> : <PlusCircle size={17} />}
              <span>{editingId ? "Save extra" : "Create extra"}</span>
            </button>
          </form>
        </AdminModal>
      ) : null}
    </section>
  );
}

function GiftItemsSection({
  giftItems,
  form,
  editingId,
  modalOpen,
  setForm,
  onSubmit,
  onEdit,
  onCreate,
  onCancel,
  onDelete,
  onToggle
}) {
  return (
    <section className="admin-list-section" aria-label="Gift items editor">
      <div className="admin-section-toolbar">
        <div>
          <p className="eyebrow">Gifts</p>
          <h2>Gift catalog</h2>
        </div>
        <button className="admin-primary" type="button" onClick={onCreate}>
          <PlusCircle size={17} />
          <span>Create gift item</span>
        </button>
      </div>

      <div className="admin-menu-list">
        {giftItems.map((item) => (
          <article className={item.active ? "admin-menu-card" : "admin-menu-card admin-muted-card"} key={item.id}>
            <div>
              <span>{item.category}</span>
              <h3>{item.name}</h3>
              <p>{item.description || "Gift only item"}</p>
            </div>
            <strong>{item.active ? "Gift" : "Inactive"}</strong>
            <div className="admin-card-actions">
              <button className="admin-secondary" type="button" onClick={() => onToggle(item)}>
                {item.active ? "Disable" : "Activate"}
              </button>
              <button className="admin-icon-button" type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                <Edit3 size={15} />
              </button>
              <button className="admin-icon-button admin-danger-button" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}>
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {modalOpen ? (
        <AdminModal title={editingId ? "Edit gift item" : "Create gift item"} eyebrow="Gifts" onClose={onCancel}>
          <form className="admin-editor-form" onSubmit={onSubmit}>
            <label>
              <span>Name</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              <span>Category</span>
              <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </label>
            <label>
              <span>Description</span>
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <div className="admin-checks">
              <label>
                <input checked={form.active} type="checkbox" onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                <span>Active</span>
              </label>
            </div>
            <button className="admin-primary" type="submit">
              {editingId ? <Save size={17} /> : <PlusCircle size={17} />}
              <span>{editingId ? "Save gift item" : "Create gift item"}</span>
            </button>
          </form>
        </AdminModal>
      ) : null}
    </section>
  );
}

function UsersSection({
  users,
  giftItems,
  form,
  editingId,
  modalOpen,
  setForm,
  onSubmit,
  onEdit,
  onCreate,
  onCancel,
  onToggle,
  onAddCredits,
  onAssignGift
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [giftTarget, setGiftTarget] = useState(null);
  const [giftMenuItemId, setGiftMenuItemId] = useState("");
  const [giftBusy, setGiftBusy] = useState(false);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const matchesQuery = normalizedQuery
        ? user.username.toLowerCase().includes(normalizedQuery) ||
          user.displayName.toLowerCase().includes(normalizedQuery)
        : true;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.active) ||
        (statusFilter === "inactive" && !user.active);

      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter, users]);

  async function handleCreditsSubmit(event) {
    event.preventDefault();
    if (!creditTarget) return;

    setCreditBusy(true);
    const success = await onAddCredits(creditTarget, creditAmount);
    setCreditBusy(false);

    if (!success) return;

    setCreditTarget(null);
    setCreditAmount("");
  }

  async function handleGiftSubmit(event) {
    event.preventDefault();
    if (!giftTarget) return;

    setGiftBusy(true);
    const success = await onAssignGift(giftTarget, giftMenuItemId);
    setGiftBusy(false);

    if (!success) return;

    setGiftTarget(null);
    setGiftMenuItemId("");
  }

  return (
    <section className="admin-list-section" aria-label="Users editor">
      <div className="admin-section-toolbar">
        <div>
          <p className="eyebrow">Users</p>
          <h2>Customer accounts</h2>
        </div>
        <button className="admin-primary" type="button" onClick={onCreate}>
          <PlusCircle size={17} />
          <span>Create user</span>
        </button>
      </div>

      <div className="admin-users-toolbar">
        <label className="admin-search-field">
          <span>Search users</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or username"
          />
        </label>

        <div className="admin-filter-group" role="tablist" aria-label="User status filter">
          {[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" }
          ].map((filter) => (
            <button
              key={filter.value}
              className={statusFilter === filter.value ? "admin-filter-button admin-filter-button-active" : "admin-filter-button"}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-menu-list">
        {filteredUsers.length === 0 ? (
          <div className="empty-orders">No users found</div>
        ) : filteredUsers.map((user) => (
          <article className={user.active ? "admin-menu-card" : "admin-menu-card admin-muted-card"} key={user.id}>
            <div>
              <span>@{user.username}</span>
              <h3>{user.displayName}</h3>
              <p>
                {user.active ? "Active account" : "Inactive account"}
                {user.gifts?.filter((gift) => !gift.redeemed).length
                  ? ` · ${user.gifts.filter((gift) => !gift.redeemed).length} gifts pending`
                  : ""}
              </p>
            </div>
            <strong>{money(user.credits)}</strong>
            <div className="admin-card-actions">
              <button
                className="admin-secondary"
                type="button"
                onClick={() => {
                  setGiftTarget(user);
                  setGiftMenuItemId(giftItems.find((item) => item.active)?.slug || giftItems[0]?.slug || "");
                }}
              >
                Gift item
              </button>
              <button
                className="admin-primary admin-primary-compact"
                type="button"
                onClick={() => {
                  setCreditTarget(user);
                  setCreditAmount("");
                }}
              >
                <PlusCircle size={15} />
                <span>Add credits</span>
              </button>
              <button className="admin-secondary" type="button" onClick={() => onToggle(user)}>
                {user.active ? "Disable" : "Activate"}
              </button>
              <button className="admin-icon-button" type="button" onClick={() => onEdit(user)} aria-label={`Edit ${user.displayName}`}>
                <Edit3 size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {creditTarget ? (
        <AdminModal title="Add credits" eyebrow={`@${creditTarget.username}`} onClose={() => setCreditTarget(null)}>
          <form className="admin-editor-form" onSubmit={handleCreditsSubmit}>
            <label>
              <span>Current balance</span>
              <input value={money(creditTarget.credits)} readOnly />
            </label>
            <label>
              <span>Credits to add</span>
              <input
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                autoFocus
              />
            </label>
            <button className="admin-primary" type="submit" disabled={creditBusy}>
              <PlusCircle size={17} />
              <span>{creditBusy ? "Adding..." : "Add credits"}</span>
            </button>
          </form>
        </AdminModal>
      ) : null}

      {giftTarget ? (
        <AdminModal title="Assign gift" eyebrow={`@${giftTarget.username}`} onClose={() => setGiftTarget(null)}>
          <form className="admin-editor-form" onSubmit={handleGiftSubmit}>
            <label>
              <span>Menu item</span>
              <select value={giftMenuItemId} onChange={(event) => setGiftMenuItemId(event.target.value)}>
                <option value="">Select a gift item</option>
                {giftItems.filter((item) => item.active).map((item) => (
                  <option value={item.slug} key={item.id}>
                    {item.category} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-primary" type="submit" disabled={giftBusy || !giftMenuItemId}>
              <PlusCircle size={17} />
              <span>{giftBusy ? "Assigning..." : "Assign gift"}</span>
            </button>
          </form>
        </AdminModal>
      ) : null}

      {modalOpen ? (
        <AdminModal title={editingId ? "Edit user" : "Create user"} eyebrow="Users" onClose={onCancel}>
          <form className="admin-editor-form" onSubmit={onSubmit}>
            <label>
              <span>Username</span>
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
            </label>
            <label>
              <span>Display name</span>
              <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label>
              <span>{editingId ? "New password (optional)" : "Password"}</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>
            <label>
              <span>Credits</span>
              <input
                value={form.credits}
                onChange={(event) => setForm({ ...form, credits: event.target.value })}
                inputMode="decimal"
              />
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
            </div>
            <button className="admin-primary" type="submit">
              {editingId ? <Save size={17} /> : <PlusCircle size={17} />}
              <span>{editingId ? "Save user" : "Create user"}</span>
            </button>
          </form>
        </AdminModal>
      ) : null}
    </section>
  );
}

function ReportsSection({ reportDate, setReportDate, report, onRefresh, loading }) {
  const rows = report?.rows || [];
  const byUser = report?.byUser || [];
  const totals = report?.totals || { totalAmount: 0, orderCount: 0, userCount: 0 };

  return (
    <section className="admin-list-section" aria-label="Daily reports">
      <div className="admin-section-toolbar">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Daily consumption</h2>
        </div>
        <div className="admin-reports-actions">
          <label className="admin-search-field">
            <span>Thailand day</span>
            <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
          </label>
          <button className="admin-primary" type="button" onClick={onRefresh} disabled={loading}>
            <span>{loading ? "Loading..." : "Load report"}</span>
          </button>
        </div>
      </div>

      <div className="admin-report-summary">
        <article className="admin-report-card">
          <span>Total</span>
          <strong>{money(totals.totalAmount)}</strong>
        </article>
        <article className="admin-report-card">
          <span>Orders</span>
          <strong>{totals.orderCount}</strong>
        </article>
        <article className="admin-report-card">
          <span>Users</span>
          <strong>{totals.userCount}</strong>
        </article>
      </div>

      <div className="admin-report-layout">
        <section className="admin-report-panel">
          <div className="admin-report-panel-head">
            <h3>By user</h3>
            <small>{reportDate}</small>
          </div>
          {byUser.length === 0 ? (
            <div className="empty-orders">No orders for this day</div>
          ) : (
            <div className="admin-report-user-list">
              {byUser.map((entry) => (
                <article className="admin-report-user-row" key={entry.key}>
                  <div>
                    <strong>{entry.label}</strong>
                    <small>{entry.guest ? "Guest" : `@${entry.username}`}</small>
                  </div>
                  <div>
                    <small>{entry.orderCount} orders</small>
                    <strong>{money(entry.total)}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="admin-report-panel">
          <div className="admin-report-panel-head">
            <h3>Orders</h3>
            <small>{rows.length} rows</small>
          </div>
          {rows.length === 0 ? (
            <div className="empty-orders">No orders for this day</div>
          ) : (
            <div className="admin-report-rows">
              {rows.map((row) => (
                <article className="admin-report-order-row" key={row.id}>
                  <div>
                    <strong>#{row.orderNumber}</strong>
                    <small>{formatDate(row.createdAt)}</small>
                  </div>
                  <div>
                    <strong>{row.displayName || row.customerName}</strong>
                    <small>{row.guestOrder ? "Guest" : `@${row.username}`}</small>
                  </div>
                  <div>
                    <strong>{money(row.total)}</strong>
                    <small>{statusLabels[row.status]}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function PromotionsSection({
  promotions,
  menuItems,
  form,
  editingId,
  modalOpen,
  setForm,
  onSubmit,
  onEdit,
  onCreate,
  onCancel,
  onDelete,
  onToggle
}) {
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
    <section className="admin-list-section" aria-label="Promotions editor">
      <div className="admin-section-toolbar">
        <div>
          <p className="eyebrow">Promotions</p>
          <h2>Promotion banners</h2>
        </div>
        <button className="admin-primary" type="button" onClick={onCreate}>
          <PlusCircle size={17} />
          <span>Create promo</span>
        </button>
      </div>

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

      {modalOpen ? (
        <AdminModal title={editingId ? "Edit promo" : "Create promo"} eyebrow="Promotions" onClose={onCancel}>
          <form className="admin-editor-form" onSubmit={onSubmit}>
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
        </AdminModal>
      ) : null}
    </section>
  );
}
export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem("ready-order-admin-token") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [giftItems, setGiftItems] = useState([]);
  const [extras, setExtras] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [reportDate, setReportDate] = useState(() => todayInThailand());
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("orders");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState("");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [giftItemForm, setGiftItemForm] = useState(emptyGiftItemForm);
  const [editingGiftItemId, setEditingGiftItemId] = useState("");
  const [giftItemModalOpen, setGiftItemModalOpen] = useState(false);
  const [extraForm, setExtraForm] = useState(emptyExtraForm);
  const [editingExtraId, setEditingExtraId] = useState("");
  const [extraModalOpen, setExtraModalOpen] = useState(false);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [editingPromotionId, setEditingPromotionId] = useState("");
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);

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

  const loadGiftItems = useCallback(async () => {
    if (!token) return;
    const data = await api.getAdminGiftItems(token);
    setGiftItems(data.items);
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    const data = await api.getAdminUsers(token);
    setUsers(data.users);
  }, [token]);

  const loadReport = useCallback(async (date = reportDate) => {
    if (!token || !date) return;
    setReportLoading(true);
    try {
      const data = await api.getAdminDailyReport(token, date);
      setReport(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setReportLoading(false);
    }
  }, [reportDate, token]);

  const loadPromotions = useCallback(async () => {
    if (!token) return;
    const data = await api.getAdminPromotions(token);
    setPromotions(data.promotions);
  }, [token]);

  const loadExtras = useCallback(async () => {
    if (!token) return;
    const data = await api.getAdminExtras(token);
    setExtras(data.extras);
  }, [token]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      await Promise.all([loadOrders(), loadUsers(), loadGiftItems(), loadMenu(), loadExtras(), loadPromotions()]);
    } catch (error) {
      setMessage(error.message);
      if (error.message.includes("session") || error.message.includes("Authentication")) {
        localStorage.removeItem("ready-order-admin-token");
        setToken("");
      }
    }
  }, [loadExtras, loadGiftItems, loadMenu, loadOrders, loadPromotions, loadUsers, token]);

  useEffect(() => {
    loadAll();
    const timer = window.setInterval(loadOrders, 5000);
    return () => window.clearInterval(timer);
  }, [loadAll, loadOrders]);

  useEffect(() => {
    if (token && activeTab === "reports") {
      loadReport(reportDate);
    }
  }, [activeTab, loadReport, reportDate, token]);

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
    setUsers([]);
    setGiftItems([]);
    setMenuItems([]);
    setExtras([]);
    setPromotions([]);
    setReport(null);
  }

  function editItem(item) {
    setEditingItemId(item.id);
    setItemModalOpen(true);
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

  function editUser(user) {
    setEditingUserId(user.id);
    setUserModalOpen(true);
    setUserForm({
      username: user.username,
      displayName: user.displayName,
      password: "",
      credits: user.credits,
      active: user.active
    });
  }

  function createUser() {
    setEditingUserId("");
    setUserForm(emptyUserForm);
    setUserModalOpen(true);
  }

  async function submitUser(event) {
    event.preventDefault();
    setMessage("");
    try {
      const data = editingUserId
        ? await api.updateAdminUser(token, editingUserId, userForm)
        : await api.createAdminUser(token, userForm);
      setMessage(data.message);
      setUserForm(emptyUserForm);
      setEditingUserId("");
      setUserModalOpen(false);
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleUser(user) {
    try {
      const data = await api.updateAdminUser(token, user.id, { ...user, active: !user.active, password: "" });
      setMessage(data.message);
      await loadUsers();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function addUserCredits(user, amount) {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Enter a valid credit amount");
      return false;
    }

    try {
      const data = await api.updateAdminUser(token, user.id, {
        ...user,
        credits: Number(user.credits || 0) + parsedAmount,
        password: ""
      });
      setMessage(data.message);
      await loadUsers();
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    }
  }

  async function assignUserGift(user, menuItemId) {
    if (!menuItemId) {
      setMessage("Choose a gift item");
      return false;
    }

    try {
      const data = await api.assignAdminUserGift(token, user.id, { giftItemId: menuItemId });
      setMessage(data.message);
      await loadUsers();
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    }
  }

  function createItem() {
    setEditingItemId("");
    setItemForm(emptyItemForm);
    setItemModalOpen(true);
  }

  function editGiftItem(item) {
    setEditingGiftItemId(item.id);
    setGiftItemModalOpen(true);
    setGiftItemForm({
      name: item.name,
      category: item.category,
      description: item.description || "",
      active: item.active,
      sortOrder: item.sortOrder || 0
    });
  }

  function createGiftItem() {
    setEditingGiftItemId("");
    setGiftItemForm(emptyGiftItemForm);
    setGiftItemModalOpen(true);
  }

  async function submitGiftItem(event) {
    event.preventDefault();
    setMessage("");
    try {
      const data = editingGiftItemId
        ? await api.updateAdminGiftItem(token, editingGiftItemId, giftItemForm)
        : await api.createAdminGiftItem(token, giftItemForm);
      setMessage(data.message);
      setGiftItemForm(emptyGiftItemForm);
      setEditingGiftItemId("");
      setGiftItemModalOpen(false);
      await loadGiftItems();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleGiftItem(item) {
    try {
      const data = await api.updateAdminGiftItem(token, item.id, { ...item, active: !item.active });
      setMessage(data.message);
      await loadGiftItems();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteGiftItem(item) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      const data = await api.deleteAdminGiftItem(token, item.id);
      setMessage(data.message);
      await loadGiftItems();
    } catch (error) {
      setMessage(error.message);
    }
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
      setItemModalOpen(false);
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

  function editExtra(extra) {
    setEditingExtraId(extra.id);
    setExtraModalOpen(true);
    setExtraForm({
      name: extra.name,
      price: extra.price,
      active: extra.active,
      sortOrder: extra.sortOrder || 0
    });
  }

  function createExtra() {
    setEditingExtraId("");
    setExtraForm(emptyExtraForm);
    setExtraModalOpen(true);
  }

  async function submitExtra(event) {
    event.preventDefault();
    setMessage("");
    try {
      const data = editingExtraId
        ? await api.updateExtra(token, editingExtraId, extraForm)
        : await api.createExtra(token, extraForm);
      setMessage(data.message);
      setExtraForm(emptyExtraForm);
      setEditingExtraId("");
      setExtraModalOpen(false);
      await loadExtras();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleExtra(extra) {
    try {
      const data = await api.updateExtra(token, extra.id, { ...extra, active: !extra.active });
      setMessage(data.message);
      await loadExtras();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteExtra(extra) {
    if (!window.confirm(`Delete ${extra.name}?`)) return;
    try {
      const data = await api.deleteExtra(token, extra.id);
      setMessage(data.message);
      await loadExtras();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function editPromotion(promotion) {
    setEditingPromotionId(promotion.id);
    setPromotionModalOpen(true);
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

  function createPromotion() {
    setEditingPromotionId("");
    setPromotionForm(emptyPromotionForm);
    setPromotionModalOpen(true);
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
      setPromotionModalOpen(false);
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

      {activeTab === "reports" ? (
        <ReportsSection
          reportDate={reportDate}
          setReportDate={setReportDate}
          report={report}
          onRefresh={() => loadReport(reportDate)}
          loading={reportLoading}
        />
      ) : null}

      {activeTab === "users" ? (
        <UsersSection
          users={users}
          giftItems={giftItems}
          form={userForm}
          editingId={editingUserId}
          modalOpen={userModalOpen}
          setForm={setUserForm}
          onSubmit={submitUser}
          onEdit={editUser}
          onCreate={createUser}
          onCancel={() => {
            setEditingUserId("");
            setUserForm(emptyUserForm);
            setUserModalOpen(false);
          }}
          onToggle={toggleUser}
          onAddCredits={addUserCredits}
          onAssignGift={assignUserGift}
        />
      ) : null}

      {activeTab === "gifts" ? (
        <GiftItemsSection
          giftItems={giftItems}
          form={giftItemForm}
          editingId={editingGiftItemId}
          modalOpen={giftItemModalOpen}
          setForm={setGiftItemForm}
          onSubmit={submitGiftItem}
          onEdit={editGiftItem}
          onCreate={createGiftItem}
          onCancel={() => {
            setEditingGiftItemId("");
            setGiftItemForm(emptyGiftItemForm);
            setGiftItemModalOpen(false);
          }}
          onDelete={deleteGiftItem}
          onToggle={toggleGiftItem}
        />
      ) : null}

      {activeTab === "menu" ? (
        <MenuSection
          items={menuItems}
          form={itemForm}
          editingId={editingItemId}
          modalOpen={itemModalOpen}
          setForm={setItemForm}
          onSubmit={submitItem}
          onEdit={editItem}
          onCreate={createItem}
          onCancel={() => {
            setEditingItemId("");
            setItemForm(emptyItemForm);
            setItemModalOpen(false);
          }}
          onDelete={deleteItem}
          onToggle={toggleItem}
        />
      ) : null}

      {activeTab === "extras" ? (
        <ExtrasSection
          extras={extras}
          form={extraForm}
          editingId={editingExtraId}
          modalOpen={extraModalOpen}
          setForm={setExtraForm}
          onSubmit={submitExtra}
          onEdit={editExtra}
          onCreate={createExtra}
          onCancel={() => {
            setEditingExtraId("");
            setExtraForm(emptyExtraForm);
            setExtraModalOpen(false);
          }}
          onDelete={deleteExtra}
          onToggle={toggleExtra}
        />
      ) : null}

      {activeTab === "promotions" ? (
        <PromotionsSection
          promotions={promotions}
          menuItems={menuItems}
          form={promotionForm}
          editingId={editingPromotionId}
          modalOpen={promotionModalOpen}
          setForm={setPromotionForm}
          onSubmit={submitPromotion}
          onEdit={editPromotion}
          onCreate={createPromotion}
          onCancel={() => {
            setEditingPromotionId("");
            setPromotionForm(emptyPromotionForm);
            setPromotionModalOpen(false);
          }}
          onDelete={deletePromotion}
          onToggle={togglePromotion}
        />
      ) : null}
    </main>
  );
}
