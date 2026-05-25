import { useState } from "react";
import { api, PickingTask, PickingItem } from "../api";

interface Props {
  task: PickingTask;
  onBack: () => void;
  onComplete: () => void;
}

const ITEM_STATUS_STYLE: Record<string, React.CSSProperties> = {
  PENDING:       { background: "#f9fafb", borderColor: "#d1d5db" },
  FOUND:         { background: "#f0fdf4", borderColor: "#86efac" },
  NOT_AVAILABLE: { background: "#fff7ed", borderColor: "#fdba74" },
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING:       "Not scanned",
  FOUND:         "✓ Found",
  NOT_AVAILABLE: "✗ Not available",
};

export default function TaskPage({ task, onBack, onComplete }: Props) {
  const [items, setItems] = useState<PickingItem[]>(task.items);
  const [scanning, setScanning] = useState<string | null>(null);
  const [packing, setPacking] = useState(false);
  const [error, setError] = useState("");

  const allScanned = items.every(i => i.status !== "PENDING");
  const canPack = allScanned && task.status !== "PACKED";

  async function scanItem(item: PickingItem, status: "FOUND" | "NOT_AVAILABLE") {
    if (item.status !== "PENDING") return;
    setScanning(item.skuId);
    setError("");
    try {
      await api.post(`/api/warehouse/picking-queue/${task.orderId}/pick-item`, { skuId: item.skuId, status });
      setItems(prev => prev.map(i => i.skuId === item.skuId ? { ...i, status } : i));
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Scan failed");
    } finally {
      setScanning(null);
    }
  }

  async function markPackReady() {
    setPacking(true);
    setError("");
    try {
      await api.post(`/api/warehouse/picking-queue/${task.orderId}/pack-ready`);
      onComplete();
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Pack-ready failed");
      setPacking(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← Queue</button>
        <span style={s.brand}>ThreadDash Warehouse</span>
      </div>

      <div style={s.body}>
        <div style={s.titleRow}>
          <div>
            <h2 style={s.heading}>Order #{task.orderId.slice(-8).toUpperCase()}</h2>
            <p style={s.muted}>{items.length} item{items.length !== 1 ? "s" : ""} to pick</p>
          </div>
          <span style={s.statusChip}>{task.status.replace("_", " ")}</span>
        </div>

        {error && <p style={s.errorText}>{error}</p>}

        <div style={s.itemList}>
          {items.map(item => {
            const isBusy = scanning === item.skuId;
            return (
              <div key={item.skuId} style={{ ...s.itemCard, ...ITEM_STATUS_STYLE[item.status] }}>
                <div style={s.itemTop}>
                  <div>
                    <p style={s.skuCode}>{item.sku.sku}</p>
                    <p style={s.skuDetail}>{item.sku.color} · {item.sku.size} · qty {item.quantity}</p>
                  </div>
                  <span style={{
                    ...s.itemBadge,
                    color: item.status === "FOUND" ? "#166534" : item.status === "NOT_AVAILABLE" ? "#9a3412" : "#6b7280",
                  }}>
                    {ITEM_STATUS_LABEL[item.status]}
                  </span>
                </div>

                {item.status === "PENDING" && (
                  <div style={s.btnRow}>
                    <button style={{ ...s.scanBtn, ...s.foundBtn }} disabled={isBusy} onClick={() => scanItem(item, "FOUND")}>
                      {isBusy ? "…" : "✓ Found"}
                    </button>
                    <button style={{ ...s.scanBtn, ...s.naBtn }} disabled={isBusy} onClick={() => scanItem(item, "NOT_AVAILABLE")}>
                      {isBusy ? "…" : "✗ Not available"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          style={{ ...s.packBtn, opacity: canPack && !packing ? 1 : 0.5 }}
          disabled={!canPack || packing}
          onClick={markPackReady}
        >
          {packing ? "Marking ready…" : "📦 Mark Pack-Ready"}
        </button>

        {!allScanned && (
          <p style={{ ...s.muted, textAlign: "center" }}>Scan all items before marking pack-ready</p>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:       { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  header:     { background: "#1a1a2e", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 },
  backBtn:    { background: "none", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 },
  brand:      { fontWeight: 700, fontSize: 18 },
  body:       { maxWidth: 640, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 },
  titleRow:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  heading:    { margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a2e" },
  muted:      { margin: 0, color: "#6b7280", fontSize: 13 },
  statusChip: { background: "#dbeafe", color: "#1d4ed8", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  itemList:   { display: "flex", flexDirection: "column", gap: 10 },
  itemCard:   { borderRadius: 10, padding: "14px 16px", border: "1.5px solid", display: "flex", flexDirection: "column", gap: 10 },
  itemTop:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  skuCode:    { margin: 0, fontWeight: 700, fontSize: 15, color: "#111827" },
  skuDetail:  { margin: 0, fontSize: 13, color: "#6b7280" },
  itemBadge:  { fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  btnRow:     { display: "flex", gap: 8 },
  scanBtn:    { flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 600, border: "none", borderRadius: 8, cursor: "pointer" },
  foundBtn:   { background: "#16a34a", color: "#fff" },
  naBtn:      { background: "#ea580c", color: "#fff" },
  packBtn:    { padding: 16, fontSize: 16, fontWeight: 700, background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" },
  errorText:  { color: "#dc2626", fontSize: 13, margin: 0 },
};
