import { useState, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { api, saveSession } from "./lib/api";
import { getExpoPushToken } from "./lib/notifications";
import { T } from "./lib/theme";

export default function LoginScreen() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const otpRefs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);

  async function sendOtp() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Enter a valid 10-digit number."); return; }
    setLoading(true); setError("");
    try {
      await api.post("/auth/send-otp", { phone: phone.trim() });
      setStep("otp");
    } catch { setError("Failed to send OTP. Check your number and try again."); }
    finally { setLoading(false); }
  }

  async function verifyOtp() {
    const code = otp.join("");
    if (code.length < 6) return;
    setLoading(true); setError("");
    try {
      const res = await api.post<{ token: string; user: { id: string } }>("/auth/verify-otp", {
        phone: phone.trim(), otp: code,
      });
      await saveSession(res.data.token, res.data.user.id);
      await AsyncStorage.setItem("customer_phone", phone.trim());
      getExpoPushToken().then((t) => { if (t) api.patch("/auth/fcm-token", { token: t }).catch(() => {}); });
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(status === 401 || status === 400 ? "Invalid OTP. Try again." : "Something went wrong.");
    } finally { setLoading(false); }
  }

  function handleOtpChange(val: string, idx: number) {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
    if (!digit && idx > 0) otpRefs.current[idx - 1]?.focus();
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === "ios" ? "padding" : "height"}>

        <View style={s.logoBlock}>
          <Text style={s.logoText}>myntra</Text>
          <Text style={s.logoSub}>FASHION DELIVERED IN 30 MINS</Text>
        </View>

        <View style={s.card}>
          {step === "phone" ? (
            <>
              <Text style={s.title}>India's #1 Fashion App</Text>
              <Text style={s.sub}>Login or Sign up</Text>

              <View style={s.phoneRow}>
                <View style={s.cc}><Text style={s.ccText}>+91</Text></View>
                <TextInput
                  style={s.phoneInput}
                  placeholder="Mobile number"
                  placeholderTextColor={T.gray}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoFocus
                  maxLength={10}
                />
              </View>

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={sendOtp}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={T.white} />
                  : <Text style={s.btnText}>CONTINUE</Text>}
              </TouchableOpacity>

              <Text style={s.terms}>
                By continuing, I agree to the{" "}
                <Text style={s.termsLink}>Terms of Use</Text> &{" "}
                <Text style={s.termsLink}>Privacy Policy</Text>
              </Text>
            </>
          ) : (
            <>
              <Text style={s.title}>Enter OTP</Text>
              <Text style={s.sub}>Sent to +91 {phone}</Text>

              <View style={s.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { otpRefs.current[i] = r; }}
                    style={[s.otpBox, digit ? s.otpBoxFilled : null]}
                    value={digit}
                    onChangeText={(v) => handleOtpChange(v, i)}
                    keyboardType="numeric"
                    maxLength={1}
                    autoFocus={i === 0}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {!!error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity
                style={[s.btn, (loading || otp.join("").length < 6) && s.btnDisabled]}
                onPress={verifyOtp}
                disabled={loading || otp.join("").length < 6}
              >
                {loading
                  ? <ActivityIndicator color={T.white} />
                  : <Text style={s.btnText}>VERIFY</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setStep("phone"); setOtp(["","","","","",""]); setError(""); }}
                style={s.changeNum}
              >
                <Text style={s.changeNumText}>Change mobile number</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.white },
  kav: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },

  logoBlock: { alignItems: "center", marginBottom: 36 },
  logoText: { fontSize: 40, fontFamily: T.font.bold, color: T.pink, letterSpacing: -1 },
  logoSub: { fontSize: 10, color: T.gray, letterSpacing: 2, marginTop: 2, fontFamily: T.font.regular },

  card: { backgroundColor: T.white, borderRadius: T.radiusMd, borderWidth: 1, borderColor: T.border, padding: 24 },
  title: { fontSize: 20, fontFamily: T.font.bold, color: T.dark, marginBottom: 4 },
  sub: { fontSize: 13, color: T.gray, marginBottom: 24, fontFamily: T.font.regular },

  phoneRow: { flexDirection: "row", borderWidth: 1, borderColor: T.border, borderRadius: T.radius, overflow: "hidden", marginBottom: 16 },
  cc: { backgroundColor: T.lightBg, paddingHorizontal: 14, justifyContent: "center", borderRightWidth: 1, borderRightColor: T.border },
  ccText: { fontSize: 15, fontFamily: T.font.semi, color: T.dark },
  phoneInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: T.dark, fontFamily: T.font.regular },

  otpRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  otpBox: {
    width: 44, height: 50, borderWidth: 1, borderColor: T.border, borderRadius: T.radius,
    fontSize: 22, fontFamily: T.font.bold, color: T.dark, textAlign: "center",
    backgroundColor: T.lightBg,
  },
  otpBoxFilled: { borderColor: T.pink, backgroundColor: T.white },

  error: { color: T.pink, fontSize: 12, marginBottom: 8, fontFamily: T.font.regular },

  btn: { backgroundColor: T.pink, borderRadius: T.radius, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: T.white, fontFamily: T.font.bold, fontSize: 14, letterSpacing: 1 },

  terms: { fontSize: 11, color: T.gray, textAlign: "center", marginTop: 20, lineHeight: 17, fontFamily: T.font.regular },
  termsLink: { color: T.pink, fontFamily: T.font.regular },

  changeNum: { marginTop: 20, alignItems: "center" },
  changeNumText: { color: T.pink, fontSize: 13, fontFamily: T.font.semi },
});
