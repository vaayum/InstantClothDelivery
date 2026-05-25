import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { api, saveSession } from "./lib/api";
import { getExpoPushToken } from "./lib/notifications";

export default function LoginScreen() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendOtp() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Enter a valid phone number."); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/send-otp", { phone: phone.trim() });
      setStep("otp");
    } catch {
      setError("Failed to send OTP. Check your number and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (otp.length < 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/auth/verify-otp", { phone: phone.trim(), otp });
      const { token, userId } = res.data as { token: string; userId: string };
      await saveSession(token, userId);
      getExpoPushToken().then((pushToken) => {
        if (pushToken) api.patch("/auth/fcm-token", { token: pushToken }).catch(() => {});
      });
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(status === 401 || status === 400 ? "Invalid OTP. Try again." : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>ThreadDash</Text>
      <Text style={s.subtitle}>Agent Login</Text>

      {step === "phone" ? (
        <>
          <TextInput
            style={s.input}
            placeholder="+91 98765 43210"
            placeholderTextColor="#555"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.btn} onPress={sendOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Send OTP</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.hint}>OTP sent to {phone}</Text>
          <TextInput
            style={s.input}
            placeholder="------"
            placeholderTextColor="#555"
            value={otp}
            onChangeText={setOtp}
            keyboardType="numeric"
            maxLength={6}
            autoFocus
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.btn} onPress={verifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.back} onPress={() => { setStep("phone"); setOtp(""); setError(""); }}>
            <Text style={s.backText}>← Change number</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", justifyContent: "center", padding: 32 },
  title: { fontSize: 32, fontWeight: "bold", color: "#fff", textAlign: "center" },
  subtitle: { fontSize: 16, color: "#888", textAlign: "center", marginBottom: 48 },
  hint: { color: "#aaa", marginBottom: 12 },
  input: {
    backgroundColor: "#222", color: "#fff", borderRadius: 10,
    padding: 16, fontSize: 20, marginBottom: 8, letterSpacing: 4,
  },
  error: { color: "#f55", marginBottom: 8, fontSize: 13 },
  btn: {
    backgroundColor: "#fff", borderRadius: 10,
    padding: 16, alignItems: "center", marginTop: 8,
  },
  btnText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  back: { marginTop: 20, alignItems: "center" },
  backText: { color: "#888", fontSize: 14 },
});
