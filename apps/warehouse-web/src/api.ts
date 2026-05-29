import axios from "axios";

export const api = axios.create({ baseURL: "http://localhost:3000" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("wh_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getWarehouseId(): string {
  return localStorage.getItem("wh_warehouse_id") ?? "";
}

export function saveSession(token: string, warehouseId: string) {
  localStorage.setItem("wh_token", token);
  localStorage.setItem("wh_warehouse_id", warehouseId);
}

export function clearSession() {
  localStorage.removeItem("wh_token");
  localStorage.removeItem("wh_warehouse_id");
}

export type PickingItemStatus = "PENDING" | "FOUND" | "NOT_AVAILABLE";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "PACKED";

export interface PickingItem {
  id: string;
  skuId: string;
  quantity: number;
  status: PickingItemStatus;
  scannedAt: string | null;
  sku: { id: string; size: string; color: string; sku: string };
  binLocationCode: string | null;
}

export interface PickingTask {
  id: string;
  orderId: string;
  warehouseId: string;
  status: TaskStatus;
  slaDeadline: string;
  items: PickingItem[];
}
