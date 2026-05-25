import { useEffect, useState, useCallback } from "react";
import { api, getWarehouseId, clearSession, PickingTask } from "../api";

interface Props {
  onSelectTask: (task: PickingTask) => void;
  onReturns: () => void;
  onLogout: () => void;
}

function slaColor(deadline: string): string {
  const minsLeft = (new Date(deadline).getTime() - Date.now()) / 60000;
  if (minsLeft < 10) return "#dc2626";
  if (minsLeft < 20) return "#d97706";
  return "#16a34a";
}

function slaLabel(deadline: string): string {
  const minsLeft = Math.round((new Date(deadline).getTime() - Date.now()) / 60000);
  if (minsLeft < 0) return "OVERDUE";
  return `${minsLeft}m left`;
}

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  PENDING:     { background: "#e5e7eb", color: "#374151" },
  IN_PROGRESS: { background: "#dbeafe", color: "#1d4ed8" },
  PACKED:      { background: "#dcfce7", color: "#166534" },
};

export default function QueuePage({ onSelectTask, onReturns, onLogout }: Props) {
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const whId = getWarehouseId();
    try {
      const { data } = await api.get<PickingTask[]>(`/api/warehouse/picking-queue/${whId}`);
      setTasks(data);
      setError("");
    } catch (e: any) {
      if (e.response?.status === 401) { clearSession(); onLogout(); return; }
      setError("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.brand}>ThreadDash Warehouse</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.logoutBtn} onClick={onReturns}>Returns</button>
          <button style={s.logoutBtn} onClick={() => { clearSession(); onLogout(); }}>Logout</button>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.topRow}>
          <h2 style={s.heading}>Picking Queue</h2>
          <button style={s.refreshBtn} onClick={load}>↻ Refresh</button>
        </div>

        {loading && <p style={s.muted}>Loading…</p>}
        {error && <p style={s.errorText}>{error}</p>}

        {!loading && tasks.length === 0 && (
          <div style={s.empty}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>No active tasks</p>
            <p style={s.muted}>Queue is clear — check back soon.</p>
          </div>
        )}

        {tasks.map(task => {
          const pending = task.items.filter(i => i.status === "PENDING").length;
          const total = task.items.length;
          const pct = total > 0 ? ((total - pending) / total) * 100 : 0;
          return (
            <div key={task.id} style={s.card} onClick={() => onSelectTask(task)}>
              <div style={s.cardTop}>
                <span style={s.orderId}>#{task.orderId.slice(-8).toUpperCase()}</span>
                <span style={{ ...s.badge, ...STATUS_BADGE[task.status] }}>
                  {task.status.replace("_", " ")}
                </span>
              </div>
              <div style={s.cardMid}>
                <span style={{ ...s.sla, color: slaColor(task.slaDeadline) }}>
                  ⏱ {slaLabel(task.slaDeadline)}
                </span>
                <span style={s.muted}>{total - pending}/{total} scanned</span>
              </div>
              <div style={s.progressTrack}>
                <div style={{ ...s.progressBar, width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  header:       { background: "#1a1a2e", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  brand:        { fontWeight: 700, fontSize: 18 },
  logoutBtn:    { background: "none", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 },
  body:         { maxWidth: 640, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 12 },
  topRow:       { display: "flex", justifyContent: "space-between", alignItems: "center" },
  heading:      { margin: 0, fontSize: 20, fontWeight: 700, color: "#1a1a2e" },
  refreshBtn:   { background: "none", border: "1.5px solid #d0d5dd", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13, color: "#374151" },
  card:         { background: "#fff", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 },
  cardTop:      { display: "flex", justifyContent: "space-between", alignItems: "center" },
  orderId:      { fontWeight: 700, fontSize: 15, color: "#1a1a2e" },
  badge:        { borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 },
  cardMid:      { display: "flex", justifyContent: "space-between", fontSize: 13 },
  sla:          { fontWeight: 600 },
  muted:        { color: "#6b7280", fontSize: 13 },
  progressTrack:{ height: 6, background: "#e5e7eb", borderRadius: 99 },
  progressBar:  { height: "100%", background: "#2563eb", borderRadius: 99, transition: "width .3s" },
  empty:        { textAlign: "center", padding: "60px 0", color: "#374151" },
  errorText:    { color: "#dc2626", fontSize: 14 },
};
