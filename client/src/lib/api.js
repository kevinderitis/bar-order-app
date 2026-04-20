const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

export const api = {
  login: (body) => request("/admin/login", { method: "POST", body }),
  getOrders: (token) => request("/admin/orders", { token }),
  createOrder: (token, customerName) =>
    request("/admin/orders", { method: "POST", token, body: { customerName } }),
  updateStatus: (token, id, status) =>
    request(`/admin/orders/${id}/status`, { method: "PATCH", token, body: { status } }),
  pingOrder: (token, id) => request(`/admin/orders/${id}/ping`, { method: "POST", token }),
  deleteOrder: (token, id) => request(`/admin/orders/${id}`, { method: "DELETE", token }),
  getAdminMenuItems: (token) => request("/admin/menu-items", { token }),
  createMenuItem: (token, body) => request("/admin/menu-items", { method: "POST", token, body }),
  updateMenuItem: (token, id, body) => request(`/admin/menu-items/${id}`, { method: "PATCH", token, body }),
  deleteMenuItem: (token, id) => request(`/admin/menu-items/${id}`, { method: "DELETE", token }),
  getAdminPromotions: (token) => request("/admin/promotions", { token }),
  createPromotion: (token, body) => request("/admin/promotions", { method: "POST", token, body }),
  updatePromotion: (token, id, body) => request(`/admin/promotions/${id}`, { method: "PATCH", token, body }),
  deletePromotion: (token, id) => request(`/admin/promotions/${id}`, { method: "DELETE", token }),
  getMenu: () => request("/customer/menu"),
  checkNameAvailability: (name) => request(`/customer/name-availability?name=${encodeURIComponent(name)}`),
  createCustomerOrder: (body) => request("/customer/orders", { method: "POST", body }),
  getCustomerOrder: (deviceId) => request(`/customer/order?deviceId=${encodeURIComponent(deviceId)}`),
  getPushConfig: () => request("/customer/push-config"),
  savePushSubscription: (deviceId, subscription) =>
    request("/customer/push-subscriptions", {
      method: "POST",
      body: { deviceId, subscription }
    })
};
