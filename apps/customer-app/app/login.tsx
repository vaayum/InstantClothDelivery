import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
    if (digits.length < 10) { setError("Enter a valid 10-digit number."); return; }
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
      const res = await api.post<{ token: string; user: { id: string } }>("/auth/verify-otp", {
        phone: phone.trim(),
        otp,
      });
      await saveSession(res.data.token, res.data.user.id);
      await AsyncStorage.setItem("customer_phone", phone.trim());
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
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.header}>
          <Text style={s.brand}>ThreadDash</Text>
          <Text style={s.tagline}>Try before you keep</Text>
        </View>

        <View style={s.card}>
          {step === "phone" ? (
            <>
              <Text style={s.cardTitle}>Welcome back</Text>
              <Text style={s.cardSubtitle}>
                Enter your phone number to access your wardrobe.
              </Text>

              <Text style={s.inputLabel}>PHONE NUMBER</Text>
              <View style={s.phoneRow}>
                <View style={s.countryCode}>
                  <Text style={s.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={s.phoneInput}
                  placeholder="98765 43210"
                  placeholderTextColor="#7b7486"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoFocus
                />
              </View>

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={sendOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Get OTP  →</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.cardTitle}>Verify OTP</Text>
              <Text style={s.cardSubtitle}>
                6-digit code sent to {phone}
              </Text>

              <Text style={s.inputLabel}>ONE-TIME PASSWORD</Text>
              <TextInput
                style={s.otpInput}
                placeholder="• • • • • •"
                placeholderTextColor="#7b7486"
                value={otp}
                onChangeText={setOtp}
                keyboardType="numeric"
                maxLength={6}
                autoFocus
              />

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.btn, (loading || otp.length < 6) && s.btnDisabled]}
                onPress={verifyOtp}
                disabled={loading || otp.length < 6}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Verify  →</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={s.backBtn}
                onPress={() => { setStep("phone"); setOtp(""); setError(""); }}
              >
                <Text style={s.backBtnText}>← Change number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={s.footer}>© 2025 ThreadDash · Terms · Privacy</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8f9ff" },
  kav: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },

  header: { alignItems: "center", marginBottom: 32 },
  brand: { fontSize: 32, fontWeight: "700", color: "#5300b7", letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: "#7b7486", marginTop: 4, letterSpacing: 0.5 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: { fontSize: 28, fontWeight: "700", color: "#0b1c30", marginBottom: 6 },
  cardSubtitle: { fontSize: 14, color: "#7b7486", lineHeight: 20, marginBottom: 24 },

  inputLabel: {
    fontSize: 11, fontWeight: "700", color: "#5300b7",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8,
  },
  phoneRow: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: "#ccc3d7",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
  },
  countryCode: {
    backgroundColor: "#eff4ff",
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRightWidth: 1.5,
    borderRightColor: "#ccc3d7",
  },
  countryCodeText: { fontSize: 16, fontWeight: "600", color: "#0b1c30" },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#0b1c30",
    backgroundColor: "#ffffff",
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: "#ccc3d7",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 8,
    color: "#0b1c30",
    textAlign: "center",
    marginBottom: 8,
  },

  error: { color: "#ba1a1a", fontSize: 13, marginBottom: 8 },

  btn: {
    backgroundColor: "#6d28d9",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#ffffff", fontWeight: "700", fontSize: 16 },

  backBtn: { marginTop: 16, alignItems: "center" },
  backBtnText: { color: "#7b7486", fontSize: 14 },

  footer: { textAlign: "center", color: "#ccc3d7", fontSize: 11, marginTop: 32 },
});
