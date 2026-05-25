import { useState } from "react";
import { api, saveSession } from "../api";

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendOtp() {
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/send-otp", { phone });
      setStep("otp");
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (!warehouseId.trim()) { setError("Warehouse ID is required"); return; }
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone, otp });
      saveSession(data.token, warehouseId.trim());
      onLogin();
    } catch (e: any) {
      setError(e.response?.data?.error ?? "Invalid OTP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>ThreadDash</h1>
        <p style={s.sub}>Warehouse Staff Login</p>

        {step === "phone" ? (
          <>
            <label style={s.label}>Phone number</label>
            <input style={s.input} type="tel" placeholder="+91 98765 00001"
              value={phone} onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendOtp()} />
            <button style={s.btn} onClick={sendOtp} disabled={loading || !phone}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <label style={s.label}>OTP (sent to {phone})</label>
            <input style={s.input} type="text" placeholder="123456" maxLength={6}
              value={otp} onChange={e => setOtp(e.target.value)} autoFocus />
            <label style={s.label}>Warehouse ID</label>
            <input style={s.input} type="text" placeholder="wh-hsr-1"
              value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && verifyOtp()} />
            <button style={s.btn} onClick={verifyOtp} disabled={loading || !otp}>
              {loading ? "Verifying…" : "Login"}
            </button>
            <button style={s.link} onClick={() => setStep("phone")}>Change number</button>
          </>
        )}

        {error && <p style={s.error}>{error}</p>}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" },
  card: { background: "#fff", borderRadius: 12, padding: "40px 32px", width: "100%", maxWidth: 380, boxShadow: "0 2px 16px rgba(0,0,0,.10)", display: "flex", flexDirection: "column", gap: 12 },
  title: { margin: 0, fontSize: 26, fontWeight: 700, color: "#1a1a2e" },
  sub: { margin: 0, fontSize: 14, color: "#666" },
  label: { fontSize: 13, fontWeight: 600, color: "#444" },
  input: { padding: "12px 14px", fontSize: 16, border: "1.5px solid #d0d5dd", borderRadius: 8, outline: "none" },
  btn: { padding: 14, fontSize: 16, fontWeight: 600, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },
  link: { background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, textAlign: "center", padding: 0 },
  error: { color: "#dc2626", fontSize: 13, margin: 0 },
};
