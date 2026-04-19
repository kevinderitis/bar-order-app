const DEVICE_KEY = "ready-order-device-id";

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;

  const id =
    crypto?.randomUUID?.() ||
    `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(DEVICE_KEY, id);
  return id;
}
