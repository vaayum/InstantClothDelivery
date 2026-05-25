import { useState } from "react";
import { api } from "../api";

type Condition = "GOOD" | "DAMAGED" | "TAGS_MISSING";

interface Props {
  onBack: () => void;
}

const CONDITION_LABELS: Record<Condition, string> = {
  GOOD: "Good — restock",
  DAMAGED: "Damaged",
  TAGS_MISSING: "Tags missing",
};

const CONDITION_COLORS: Record<Condition, string> = {
  GOOD: "#16a34a",
  DAMAGED: "#dc2626",
  TAGS_MISSING: "#d97706",
};

export default function ReturnsPage({ onBack }: Props) {
  const [orderItemId, setOrderItemId] = useState("");
  const [condition, setCondition] = useState<Condition>("GOOD");
  const [reason, setReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderItemId.trim()) { setError("Order Item ID is required"); return; }
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/warehouse/returns/receive", {
        orderItemId: orderItemId.trim(),
        condition,
        reason: reason.trim() || undefined,
        photoUrl: photoUrl.trim() || undefined,
      });
      setSuccess(true);
      setOrderItemId("");
      setCondition("GOOD");
      setReason("");
      setPhotoUrl("");
    } catch (e: any) {
      const msg = e.response?.data?.error ?? "Submission failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← Back</button>
        <span style={s.brand}>Receive Return</span>
        <span />
      </div>

      <div style={s.body}>
        {success && (
          <div style={s.successBanner}>
            Return recorded successfully.{" "}
            <button style={s.successLink} onClick={() => setSuccess(false)}>
              Record another
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={s.card}>
          <div style={s.field}>
            <label style={s.label}>Order Item ID</label>
            <input
              style={s.input}
              value={orderItemId}
              onChange={(e) => setOrderItemId(e.target.value)}
              placeholder="Scan or paste item ID"
              autoFocus
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Condition</label>
            <div style={s.conditionRow}>
              {(["GOOD", "DAMAGED", "TAGS_MISSING"] as Condition[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{
                    ...s.conditionBtn,
                    ...(condition === c
                      ? { background: CONDITION_COLORS[c], color: "#fff", borderColor: CONDITION_COLORS[c] }
                      : {}),
                  }}
                  onClick={() => setCondition(c)}
                >
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Reason <span style={s.optional}>(optional)</span></label>
            <textarea
              style={s.textarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. stain on sleeve, missing button…"
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Photo URL <span style={s.optional}>(optional)</span></label>
            <input
              style={s.input}
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://cdn.threaddash.in/…"
            />
          </div>

          {error && <p style={s.errorText}>{error}</p>}

          <button type="submit" style={s.submitBtn} disabled={submitting}>
            {submitting ? "Submitting…" : "Record Return"}
          </button>
        </form>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  header:       { background: "#1a1a2e", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  brand:        { fontWeight: 700, fontSize: 18 },
  backBtn:      { background: "none", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 },
  body:         { maxWidth: 560, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 },
  card:         { background: "#fff", borderRadius: 10, padding: "20px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", display: "flex", flexDirection: "column", gap: 18 },
  field:        { display: "flex", flexDirection: "column", gap: 6 },
  label:        { fontWeight: 600, fontSize: 14, color: "#374151" },
  optional:     { fontWeight: 400, color: "#9ca3af", fontSize: 13 },
  input:        { border: "1.5px solid #d0d5dd", borderRadius: 7, padding: "9px 12px", fontSize: 14, outline: "none" },
  textarea:     { border: "1.5px solid #d0d5dd", borderRadius: 7, padding: "9px 12px", fontSize: 14, resize: "vertical", outline: "none", fontFamily: "inherit" },
  conditionRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  conditionBtn: { border: "1.5px solid #d0d5dd", borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", background: "#fff", color: "#374151" },
  submitBtn:    { background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  errorText:    { color: "#dc2626", fontSize: 14, margin: 0 },
  successBanner:{ background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "12px 16px", fontSize: 14, fontWeight: 500 },
  successLink:  { background: "none", border: "none", color: "#166534", fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0, fontSize: 14 },
};
