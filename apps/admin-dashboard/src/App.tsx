import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import InventoryPage from './pages/InventoryPage'
import BinLocationsPage from './pages/BinLocationsPage'
import InboundPage from './pages/InboundPage'
import AdjustmentsPage from './pages/AdjustmentsPage'

const api = axios.create({ baseURL: "http://localhost:3000" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "orders" | "agents" | "warehouse" | "catalog" | "inventory";

type OrderStatus =
  | "PENDING" | "WAREHOUSE_PROCESSING" | "READY_FOR_PICKUP"
  | "AGENT_ASSIGNED" | "AGENT_EN_ROUTE" | "ARRIVED"
  | "TRIAL_IN_PROGRESS" | "DELIVERED" | "PARTIALLY_DELIVERED" | "RETURNED"
  | "COMPLETED" | "CANCELLED" | "RESCHEDULED";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  WAREHOUSE_PROCESSING: "#3b82f6",
  READY_FOR_PICKUP: "#8b5cf6",
  AGENT_ASSIGNED: "#06b6d4",
  AGENT_EN_ROUTE: "#0ea5e9",
  ARRIVED: "#f97316",
  TRIAL_IN_PROGRESS: "#a855f7",
  DELIVERED: "#22c55e",
  PARTIALLY_DELIVERED: "#f59e0b",
  RETURNED: "#6b7280",
  COMPLETED: "#22c55e",
  CANCELLED: "#ef4444",
  RESCHEDULED: "#6b7280",
  AVAILABLE: "#22c55e",
  OFF_DUTY: "#6b7280",
  EN_ROUTE_WAREHOUSE: "#3b82f6",
  EN_ROUTE_CUSTOMER: "#0ea5e9",
};

interface Stats {
  ordersByStatus: Record<string, number>;
  agentsByStatus: Record<string, number>;
  todayRevenuePaise: number;
  activePickingTasks: number;
}

interface AdminOrderItem {
  id: string;
  quantity: number;
  price: number;
  status: string;
  sku: { size: string; color: string; product: { name: string; brand: string } };
}

interface AdminOrder {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  deliveryFee: number;
  paymentMethod: string;
  paymentStatus: string;
  isTryOrder: boolean;
  createdAt: string;
  user: { phone: string; name: string };
  address: { label: string; formattedAddress: string };
  items: AdminOrderItem[];
}

interface AdminAgent {
  id: string;
  userId: string;
  status: string;
  vehicleType: string;
  totalDeliveries: number;
  currentLat: number | null;
  currentLng: number | null;
  assignments: { orderId: string; status: string }[];
}

interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  images: string[];
  isTryable: boolean;
}

interface CatalogBrand {
  id: string;
  name: string;
  logoUrl: string | null;
}

interface WarehouseData {
  id: string;
  name: string;
  address: string;
  activeOrderCount: number;
  _count: { pickingTasks: number };
  inventory: {
    id: string;
    quantityAvailable: number;
    quantityReserved: number;
    sku: { size: string; color: string; product: { name: string; brand: string } };
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      backgroundColor: STATUS_COLORS[status] ?? "#374151",
      color: "#fff",
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 0.5,
      whiteSpace: "nowrap",
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post<{ token: string }>("/auth/admin-login", { secret });
      localStorage.setItem("admin_token", res.data.token);
      onLogin();
    } catch {
      setError("Invalid secret");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: 16, padding: 40, width: 360, display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>ThreadDash</h1>
          <p style={{ color: "#555", fontSize: 14, margin: "6px 0 0" }}>Admin access</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Admin Secret</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoFocus
            style={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none" }}
          />
        </div>
        {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading || !secret} style={{ backgroundColor: "#fff", color: "#0a0a0a", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Verifying…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Stats>("/api/admin/stats");
      setStats(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <Spinner />;
  if (!stats) return <p style={{ color: "#888" }}>Failed to load stats.</p>;

  const totalOrders = Object.values(stats.ordersByStatus).reduce((a, b) => a + b, 0);
  const activeOrders = (stats.ordersByStatus["AGENT_EN_ROUTE"] ?? 0) +
    (stats.ordersByStatus["ARRIVED"] ?? 0) +
    (stats.ordersByStatus["TRIAL_IN_PROGRESS"] ?? 0);
  const onlineAgents = (stats.agentsByStatus["AVAILABLE"] ?? 0) +
    (stats.agentsByStatus["EN_ROUTE_WAREHOUSE"] ?? 0) +
    (stats.agentsByStatus["EN_ROUTE_CUSTOMER"] ?? 0);

  return (
    <div>
      <h2 style={s.sectionTitle}>Overview</h2>
      <div style={s.statGrid}>
        <StatCard label="Total Orders" value={totalOrders} />
        <StatCard label="Active Deliveries" value={activeOrders} accent="#3b82f6" />
        <StatCard label="Agents Online" value={onlineAgents} accent="#22c55e" />
        <StatCard label="Today's Revenue" value={rupees(stats.todayRevenuePaise)} accent="#a855f7" />
        <StatCard label="Picking Tasks" value={stats.activePickingTasks} accent="#f59e0b" />
      </div>

      <h3 style={s.subTitle}>Orders by Status</h3>
      <div style={s.barGroup}>
        {Object.entries(stats.ordersByStatus).map(([status, count]) => (
          <div key={status} style={s.barRow}>
            <StatusBadge status={status} />
            <div style={{ flex: 1, backgroundColor: "#1a1a1a", borderRadius: 4, height: 12, overflow: "hidden", margin: "0 12px" }}>
              <div style={{ width: `${Math.min(100, (count / (totalOrders || 1)) * 100)}%`, backgroundColor: STATUS_COLORS[status] ?? "#374151", height: "100%", borderRadius: 4 }} />
            </div>
            <span style={{ color: "#fff", fontWeight: 700, minWidth: 28, textAlign: "right" }}>{count}</span>
          </div>
        ))}
      </div>

      <h3 style={s.subTitle}>Agents by Status</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {Object.entries(stats.agentsByStatus).map(([status, count]) => (
          <div key={status} style={s.miniCard}>
            <StatusBadge status={status} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 20, marginTop: 6 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent = "#fff" }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={s.statCard}>
      <p style={{ color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>{label}</p>
      <p style={{ color: accent, fontSize: 28, fontWeight: 800, margin: "8px 0 0" }}>{value}</p>
    </div>
  );
}

// ─── Order Detail Modal ───────────────────────────────────────────────────────

const CANCELLABLE: OrderStatus[] = ["PENDING", "WAREHOUSE_PROCESSING", "READY_FOR_PICKUP", "AGENT_ASSIGNED"];

function OrderDetailModal({ order, onClose, onCancelled }: {
  order: AdminOrder;
  onClose: () => void;
  onCancelled: (id: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  async function handleCancel() {
    if (!confirm(`Cancel order #${order.id.slice(-8).toUpperCase()}?`)) return;
    setCancelling(true);
    setError("");
    try {
      await api.post(`/api/admin/orders/${order.id}/cancel`);
      onCancelled(order.id);
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? "Cancel failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "#111", border: "1px solid #222", borderRadius: 16, width: "100%", maxWidth: 620, maxHeight: "85vh", overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: 0 }}>
              #{order.id.slice(-8).toUpperCase()}
            </h2>
            <p style={{ color: "#555", fontSize: 12, margin: "4px 0 0" }}>{new Date(order.createdAt).toLocaleString("en-IN")}</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <StatusBadge status={order.status} />
            <button onClick={onClose} style={{ background: "none", border: "1px solid #333", color: "#888", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Customer & Address */}
        <div style={{ backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14, display: "flex", gap: 24 }}>
          <div>
            <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>Customer</p>
            <p style={{ color: "#fff", margin: 0, fontWeight: 600 }}>{order.user?.phone ?? "—"}</p>
            {order.user?.name && <p style={{ color: "#888", fontSize: 13, margin: "2px 0 0" }}>{order.user.name}</p>}
          </div>
          <div>
            <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>Address</p>
            <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>{order.address?.label}</p>
            <p style={{ color: "#666", fontSize: 12, margin: "2px 0 0" }}>{order.address?.formattedAddress}</p>
          </div>
        </div>

        {/* Items */}
        <div>
          <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>Items ({order.items.length})</p>
          <table style={{ ...s.table, fontSize: 13 }}>
            <thead>
              <tr>{["Product", "Size", "Color", "Qty", "Price", "Status"].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} style={s.tr}>
                  <td style={s.td}><span style={{ color: "#fff" }}>{item.sku.product.name}</span><br /><span style={{ color: "#666", fontSize: 11 }}>{item.sku.product.brand}</span></td>
                  <td style={{ ...s.td, textAlign: "center", color: "#aaa" }}>{item.sku.size}</td>
                  <td style={{ ...s.td, color: "#aaa" }}>{item.sku.color}</td>
                  <td style={{ ...s.td, textAlign: "center", color: "#fff", fontWeight: 700 }}>{item.quantity}</td>
                  <td style={{ ...s.td, color: "#22c55e", fontWeight: 700 }}>{rupees(item.price * item.quantity)}</td>
                  <td style={s.td}><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Summary */}
        <div style={{ backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ color: "#555", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>Payment</p>
            <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>{order.paymentMethod} · <StatusBadge status={order.paymentStatus ?? "PENDING"} /></p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: "#555", fontSize: 11, margin: "0 0 4px" }}>Total</p>
            <p style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: 0 }}>{rupees(order.totalAmount + order.deliveryFee)}</p>
            {order.deliveryFee > 0 && <p style={{ color: "#555", fontSize: 12, margin: "2px 0 0" }}>incl. ₹{(order.deliveryFee / 100)} delivery fee</p>}
            {order.isTryOrder && <p style={{ color: "#a855f7", fontSize: 12, margin: "2px 0 0" }}>Try Before You Keep</p>}
          </div>
        </div>

        {/* Cancel */}
        {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}
        {CANCELLABLE.includes(order.status) && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{ backgroundColor: "transparent", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
          >
            {cancelling ? "Cancelling…" : "Cancel Order"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING", "WAREHOUSE_PROCESSING", "READY_FOR_PICKUP",
  "AGENT_ASSIGNED", "AGENT_EN_ROUTE", "ARRIVED",
  "TRIAL_IN_PROGRESS", "DELIVERED", "PARTIALLY_DELIVERED", "RETURNED",
  "COMPLETED", "CANCELLED", "RESCHEDULED",
];

function OrdersView() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selected, setSelected] = useState<AdminOrder | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (status) params.set("status", status);
      const res = await api.get<AdminOrder[]>(`/api/admin/orders?${params}`);
      setOrders(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(statusFilter); }, [load, statusFilter]);

  return (
    <div>
      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onCancelled={(id) => setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: "CANCELLED" } : o))}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ ...s.sectionTitle, margin: 0 }}>Orders</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={s.select}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={s.table}>
            <thead>
              <tr>
                {["Order ID", "Status", "Customer", "Address", "Items", "Amount", "Payment", "Try?", "Time"].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  style={{ ...s.tr, cursor: "pointer" }}
                  onClick={() => setSelected(o)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#161616")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                >
                  <td style={s.td}><code style={{ color: "#aaa", fontSize: 12 }}>#{o.id.slice(-8).toUpperCase()}</code></td>
                  <td style={s.td}><StatusBadge status={o.status} /></td>
                  <td style={s.td}><span style={{ color: "#fff" }}>{o.user?.phone ?? "—"}</span></td>
                  <td style={s.td}><span style={{ color: "#aaa", fontSize: 12 }}>{o.address?.label}</span></td>
                  <td style={{ ...s.td, textAlign: "center" }}>{o.items.length}</td>
                  <td style={{ ...s.td, color: "#22c55e", fontWeight: 700 }}>{rupees(o.totalAmount + o.deliveryFee)}</td>
                  <td style={s.td}><span style={{ color: "#888", fontSize: 12 }}>{o.paymentMethod}</span></td>
                  <td style={{ ...s.td, textAlign: "center" }}>{o.isTryOrder ? <span style={{ color: "#a855f7" }}>✓</span> : "—"}</td>
                  <td style={{ ...s.td, color: "#666", fontSize: 12 }}>{timeAgo(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p style={{ color: "#555", textAlign: "center", padding: 32 }}>No orders found.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Agents ───────────────────────────────────────────────────────────────────

const AGENT_STATUSES = ["AVAILABLE", "EN_ROUTE_WAREHOUSE", "EN_ROUTE_CUSTOMER", "OFF_DUTY"];

function AgentsView() {
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api.get<AdminAgent[]>("/api/admin/agents")
      .then((r) => setAgents(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const filtered = statusFilter ? agents.filter((a) => a.status === statusFilter) : agents;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ ...s.sectionTitle, margin: 0 }}>Agents ({filtered.length})</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={s.select}>
          <option value="">All statuses</option>
          {AGENT_STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              {["Agent ID", "Status", "Vehicle", "Deliveries", "Active Order", "Location"].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const active = a.assignments?.[0];
              return (
                <tr key={a.id} style={s.tr}>
                  <td style={s.td}><code style={{ color: "#aaa", fontSize: 12 }}>#{a.id.slice(-8).toUpperCase()}</code></td>
                  <td style={s.td}><StatusBadge status={a.status} /></td>
                  <td style={{ ...s.td, color: "#888" }}>{a.vehicleType}</td>
                  <td style={{ ...s.td, textAlign: "center", color: "#fff", fontWeight: 700 }}>{a.totalDeliveries}</td>
                  <td style={s.td}>
                    {active
                      ? <span style={{ color: "#3b82f6", fontSize: 12 }}>#{active.orderId.slice(-8).toUpperCase()} <StatusBadge status={active.status} /></span>
                      : <span style={{ color: "#555" }}>—</span>}
                  </td>
                  <td style={{ ...s.td, color: "#666", fontSize: 12 }}>
                    {a.currentLat != null ? `${a.currentLat.toFixed(4)}, ${a.currentLng?.toFixed(4)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p style={{ color: "#555", textAlign: "center", padding: 32 }}>No agents found.</p>}
      </div>
    </div>
  );
}

// ─── Warehouse ────────────────────────────────────────────────────────────────

function WarehouseView() {
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get<WarehouseData[]>("/api/admin/warehouse")
      .then((r) => setWarehouses(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      {warehouses.map((wh) => {
        const filteredInv = wh.inventory.filter((inv) => {
          const q = search.toLowerCase();
          return !q
            || inv.sku.product.name.toLowerCase().includes(q)
            || inv.sku.product.brand.toLowerCase().includes(q)
            || inv.sku.color.toLowerCase().includes(q)
            || inv.sku.size.toLowerCase().includes(q);
        });

        return (
          <div key={wh.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h2 style={{ ...s.sectionTitle, margin: 0 }}>{wh.name}</h2>
                <p style={{ color: "#888", fontSize: 13, margin: "4px 0 0" }}>{wh.address}</p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <StatCard label="Active Orders" value={wh.activeOrderCount} accent="#3b82f6" />
                <StatCard label="Picking Tasks" value={wh._count.pickingTasks} accent="#f59e0b" />
              </div>
            </div>

            <input
              style={{ ...s.select, width: 280, marginBottom: 16 }}
              placeholder="Search inventory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <table style={s.table}>
              <thead>
                <tr>
                  {["Product", "Brand", "Size", "Color", "Available", "Reserved", "Stock Health"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInv.map((inv) => {
                  const total = inv.quantityAvailable + inv.quantityReserved;
                  const pct = total ? inv.quantityAvailable / total : 0;
                  const healthColor = pct > 0.5 ? "#22c55e" : pct > 0.2 ? "#f59e0b" : "#ef4444";
                  return (
                    <tr key={inv.id} style={s.tr}>
                      <td style={s.td}><span style={{ color: "#fff" }}>{inv.sku.product.name}</span></td>
                      <td style={{ ...s.td, color: "#888" }}>{inv.sku.product.brand}</td>
                      <td style={{ ...s.td, textAlign: "center", color: "#aaa" }}>{inv.sku.size}</td>
                      <td style={{ ...s.td, color: "#aaa" }}>{inv.sku.color}</td>
                      <td style={{ ...s.td, textAlign: "center", color: "#22c55e", fontWeight: 700 }}>{inv.quantityAvailable}</td>
                      <td style={{ ...s.td, textAlign: "center", color: "#f59e0b" }}>{inv.quantityReserved}</td>
                      <td style={{ ...s.td }}>
                        <div style={{ backgroundColor: "#1a1a1a", borderRadius: 4, height: 8, width: 80, overflow: "hidden" }}>
                          <div style={{ width: `${pct * 100}%`, backgroundColor: healthColor, height: "100%", borderRadius: 4 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

function CatalogView() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [brands, setBrands] = useState<CatalogBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api.get<CatalogProduct[]>("/api/catalog"),
      api.get<CatalogBrand[]>("/api/brands"),
    ])
      .then(([pRes, bRes]) => {
        setProducts(pRes.data);
        setBrands(bRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function uploadProductImage(product: CatalogProduct, file: File) {
    const key = product.id;
    setUploading((u) => ({ ...u, [key]: true }));
    setUploadErrors((e) => ({ ...e, [key]: "" }));
    try {
      const { data: presign } = await api.post<{ uploadUrl: string; cdnUrl: string }>(
        "/api/media/presign",
        { entityType: "product", entityId: product.id, contentType: file.type }
      );
      await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      await api.post(`/api/media/products/${product.id}/images`, { cdnUrl: presign.cdnUrl });
      setProducts((prev) =>
        prev.map((p) => p.id === product.id ? { ...p, images: [...p.images, presign.cdnUrl] } : p)
      );
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Upload failed";
      setUploadErrors((err) => ({ ...err, [key]: msg }));
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  }

  async function uploadBrandLogo(brand: CatalogBrand, file: File) {
    const key = `brand-${brand.id}`;
    setUploading((u) => ({ ...u, [key]: true }));
    setUploadErrors((e) => ({ ...e, [key]: "" }));
    try {
      const { data: presign } = await api.post<{ uploadUrl: string; cdnUrl: string }>(
        "/api/media/presign",
        { entityType: "brand", entityId: brand.id, contentType: file.type }
      );
      await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      await api.patch(`/api/media/brands/${brand.id}/logo`, { logoUrl: presign.cdnUrl });
      setBrands((prev) =>
        prev.map((b) => b.id === brand.id ? { ...b, logoUrl: presign.cdnUrl } : b)
      );
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? "Upload failed";
      setUploadErrors((err) => ({ ...err, [key]: msg }));
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <h2 style={s.sectionTitle}>Catalog</h2>

      {/* Products */}
      <h3 style={s.subTitle}>Products ({products.length})</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              {["Product", "Brand", "Category", "Images", "Upload"].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const key = product.id;
              return (
                <tr key={key} style={s.tr}>
                  <td style={s.td}>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{product.name}</span>
                    {product.isTryable && (
                      <span style={{ color: "#a855f7", fontSize: 10, fontWeight: 700, marginLeft: 6, verticalAlign: "middle" }}>TRY</span>
                    )}
                  </td>
                  <td style={{ ...s.td, color: "#888" }}>{product.brand}</td>
                  <td style={{ ...s.td, color: "#666" }}>{product.category}</td>
                  <td style={s.td}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {product.images.slice(0, 4).map((url, i) => (
                        <img key={i} src={url} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #222" }} />
                      ))}
                      {product.images.length === 0 && <span style={{ color: "#444", fontSize: 12 }}>No images</span>}
                    </div>
                  </td>
                  <td style={s.td}>
                    <label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        disabled={uploading[key]}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadProductImage(product, file);
                          e.target.value = "";
                        }}
                      />
                      <span style={{
                        display: "inline-block",
                        backgroundColor: "#1a1a1a",
                        color: uploading[key] ? "#555" : "#fff",
                        border: "1px solid #333",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: uploading[key] ? "wait" : "pointer",
                        userSelect: "none",
                      }}>
                        {uploading[key] ? "Uploading…" : "+ Image"}
                      </span>
                    </label>
                    {uploadErrors[key] && (
                      <p style={{ color: "#ef4444", fontSize: 11, margin: "4px 0 0" }}>{uploadErrors[key]}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Brands */}
      <h3 style={{ ...s.subTitle, marginTop: 40 }}>Brand Logos ({brands.length})</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={s.table}>
          <thead>
            <tr>
              {["Brand", "Current Logo", "Upload"].map((h) => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => {
              const key = `brand-${brand.id}`;
              return (
                <tr key={brand.id} style={s.tr}>
                  <td style={s.td}><span style={{ color: "#fff", fontWeight: 600 }}>{brand.name}</span></td>
                  <td style={s.td}>
                    {brand.logoUrl ? (
                      <img src={brand.logoUrl} alt={brand.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 22, border: "1px solid #222" }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 18, fontWeight: 800, border: "1px solid #222" }}>
                        {brand.name[0]}
                      </div>
                    )}
                  </td>
                  <td style={s.td}>
                    <label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        disabled={uploading[key]}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadBrandLogo(brand, file);
                          e.target.value = "";
                        }}
                      />
                      <span style={{
                        display: "inline-block",
                        backgroundColor: "#1a1a1a",
                        color: uploading[key] ? "#555" : "#fff",
                        border: "1px solid #333",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: uploading[key] ? "wait" : "pointer",
                        userSelect: "none",
                      }}>
                        {uploading[key] ? "Uploading…" : (brand.logoUrl ? "Replace Logo" : "+ Logo")}
                      </span>
                    </label>
                    {uploadErrors[key] && (
                      <p style={{ color: "#ef4444", fontSize: 11, margin: "4px 0 0" }}>{uploadErrors[key]}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Spinner() {
  return <div style={{ color: "#888", textAlign: "center", padding: 48 }}>Loading…</div>;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "agents", label: "Agents" },
  { id: "warehouse", label: "Warehouse" },
  { id: "catalog", label: "Catalog" },
  { id: "inventory", label: "Inventory" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [authed, setAuthed] = useState(() => !!localStorage.getItem("admin_token"));
  const [inventorySubTab, setInventorySubTab] = useState<'overview' | 'bins' | 'inbound' | 'adjustments'>('overview')
  const [inventoryWarehouseId, setInventoryWarehouseId] = useState<string>('')

  // Fetch first warehouse ID for Inventory pages
  useEffect(() => {
    if (tab === 'inventory' && !inventoryWarehouseId) {
      api.get<{ id: string }[]>('/api/admin/warehouse')
        .then(r => { if (r.data[0]) setInventoryWarehouseId(r.data[0].id) })
        .catch(() => {})
    }
  }, [tab, inventoryWarehouseId])

  if (!authed) {
    return <LoginView onLogin={() => setAuthed(true)} />;
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: "#111", borderBottom: "1px solid #222", padding: "0 32px", display: "flex", alignItems: "center", gap: 32 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, padding: "16px 0", color: "#fff" }}>
          ThreadDash <span style={{ color: "#888", fontWeight: 400 }}>Admin</span>
        </h1>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "18px 16px",
                fontSize: 14,
                fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? "#fff" : "#666",
                borderBottom: tab === t.id ? "2px solid #fff" : "2px solid transparent",
                transition: "color 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => { localStorage.removeItem("admin_token"); setAuthed(false); }}
          style={{ background: "none", border: "1px solid #333", color: "#666", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
        >
          Logout
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 32 }}>
        {tab === "overview" && <OverviewView />}
        {tab === "orders" && <OrdersView />}
        {tab === "agents" && <AgentsView />}
        {tab === "warehouse" && <WarehouseView />}
        {tab === "catalog" && <CatalogView />}
        {tab === 'inventory' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #222', paddingBottom: '12px' }}>
              {([['overview', 'Stock Overview'], ['bins', 'Bin Locations'], ['inbound', 'Inbound Receiving'], ['adjustments', 'Adjustments']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setInventorySubTab(key)}
                  style={{ padding: '6px 14px', background: inventorySubTab === key ? '#4a90e2' : '#222', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            {!inventoryWarehouseId && <p style={{ color: '#888' }}>Loading warehouse…</p>}
            {inventoryWarehouseId && inventorySubTab === 'overview'     && <InventoryPage warehouseId={inventoryWarehouseId} />}
            {inventoryWarehouseId && inventorySubTab === 'bins'         && <BinLocationsPage warehouseId={inventoryWarehouseId} />}
            {inventoryWarehouseId && inventorySubTab === 'inbound'      && <InboundPage warehouseId={inventoryWarehouseId} />}
            {inventoryWarehouseId && inventorySubTab === 'adjustments'  && <AdjustmentsPage warehouseId={inventoryWarehouseId} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  sectionTitle: { fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 20 } as React.CSSProperties,
  subTitle: { fontSize: 16, fontWeight: 700, color: "#aaa", marginTop: 32, marginBottom: 12 } as React.CSSProperties,
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 8 } as React.CSSProperties,
  statCard: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 20 } as React.CSSProperties,
  miniCard: { backgroundColor: "#1a1a1a", borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column" as const },
  barGroup: { display: "flex", flexDirection: "column" as const, gap: 10 },
  barRow: { display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, color: "#555", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 1, padding: "8px 12px", borderBottom: "1px solid #1a1a1a", whiteSpace: "nowrap" as const },
  td: { padding: "12px 12px", borderBottom: "1px solid #141414", color: "#aaa", verticalAlign: "middle" as const } as React.CSSProperties,
  tr: { transition: "background 0.1s" } as React.CSSProperties,
  select: { backgroundColor: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" } as React.CSSProperties,
};
