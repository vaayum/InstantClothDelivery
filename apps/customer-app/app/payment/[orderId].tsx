import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import RazorpayCheckout from "../lib/razorpay";
import { api, clearSession } from "../lib/api";

const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? "";

const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  CARD: "Credit / Debit Card",
  NET_BANKING: "Net Banking",
  COD: "Cash on Delivery",
};

const METHOD_ICONS: Record<string, string> = {
  UPI: "📲",
  CARD: "💳",
  NET_BANKING: "🏦",
  COD: "💵",
};

export default function PaymentScreen() {
  const { orderId, rzpOrderId, amount, method, itemCount, isTryOrder } =
    useLocalSearchParams<{
      orderId: string;
      rzpOrderId: string;
      amount: string;
      method: string;
      itemCount: string;
      isTryOrder: string;
    }>();

  const [paying, setPaying] = useState(false);
  const amountNum = Number(amount ?? "0");
  const isTry = isTryOrder === "true";
  const displayAmount = (amountNum / 100).toFixed(0);

  async function handlePay() {
    if (!rzpOrderId) {
      Alert.alert("Error", "Payment reference missing. Go back and try again.");
      return;
    }
    setPaying(true);
    try {
      const payment = await RazorpayCheckout.open({
        description: isTry ? "ThreadDash — Try Before You Keep" : "ThreadDash Order",
        currency: "INR",
        key: RAZORPAY_KEY_ID,
        amount: amountNum,
        name: "ThreadDash",
        order_id: rzpOrderId,
        theme: { color: "#6d28d9" },
      });

      await api.post("/api/payments/verify", {
        orderId,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpayOrderId: payment.razorpay_order_id,
        razorpaySignature: payment.razorpay_signature,
      });

      router.replace(`/order/${orderId}`);
    } catch (err: unknown) {
      const desc = (err as { description?: string }).description;
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); return; }
      if (desc) {
        Alert.alert(
          "Payment not completed",
          `${desc}\n\nYour order is saved — retry from the Orders tab.`,
          [
            { text: "Retry", onPress: handlePay },
            { text: "View Order", onPress: () => router.replace(`/order/${orderId}`) },
          ]
        );
      } else {
        Alert.alert("Error", "Could not verify payment. Check your Orders tab.");
        router.replace(`/order/${orderId}`);
      }
    } finally {
      setPaying(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={s.heading}>Confirm Payment</Text>
        <Text style={s.subheading}>Review your order before paying</Text>

        {/* Order summary */}
        <View style={s.card}>
          <Text style={s.cardLabel}>ORDER SUMMARY</Text>
          <View style={s.row}>
            <Text style={s.rowKey}>Items</Text>
            <Text style={s.rowVal}>{itemCount ?? "—"} item{Number(itemCount) !== 1 ? "s" : ""}</Text>
          </View>
          {isTry && (
            <View style={s.tryBanner}>
              <Text style={s.tryBannerText}>⏱  Try Before You Keep — 30-min trial</Text>
            </View>
          )}
          <View style={[s.row, s.totalRow]}>
            <Text style={s.totalKey}>Total</Text>
            <Text style={s.totalVal}>₹{displayAmount}</Text>
          </View>
        </View>

        {/* Payment method */}
        <View style={s.card}>
          <Text style={s.cardLabel}>PAYMENT METHOD</Text>
          <View style={s.methodRow}>
            <Text style={s.methodIcon}>{METHOD_ICONS[method ?? ""] ?? "💳"}</Text>
            <Text style={s.methodName}>{METHOD_LABELS[method ?? ""] ?? method}</Text>
          </View>
        </View>

        <Text style={s.secure}>🔒  Secured by Razorpay · PCI DSS compliant</Text>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.payBtn, paying && s.payBtnDisabled]}
          onPress={handlePay}
          disabled={paying}
          activeOpacity={0.85}
        >
          {paying
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.payBtnText}>Pay ₹{displayAmount}  →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8f9ff" },
  content: { padding: 20, paddingBottom: 24 },

  backBtn: { marginBottom: 20 },
  backText: { color: "#5300b7", fontSize: 15, fontWeight: "600" },
  heading: { fontSize: 28, fontWeight: "700", color: "#0b1c30", marginBottom: 4 },
  subheading: { fontSize: 14, color: "#7b7486", marginBottom: 24 },

  card: {
    backgroundColor: "#ffffff", borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: "#e5eeff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardLabel: {
    fontSize: 10, fontWeight: "700", color: "#7b7486",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 14,
  },

  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowKey: { color: "#7b7486", fontSize: 14 },
  rowVal: { color: "#0b1c30", fontSize: 14, fontWeight: "600" },

  tryBanner: {
    backgroundColor: "#ede9fe", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginVertical: 8,
  },
  tryBannerText: { color: "#5300b7", fontSize: 13, fontWeight: "600" },

  totalRow: { borderTopWidth: 1, borderTopColor: "#e5eeff", marginTop: 8, paddingTop: 12 },
  totalKey: { color: "#0b1c30", fontSize: 16, fontWeight: "700" },
  totalVal: { color: "#0b1c30", fontSize: 20, fontWeight: "800" },

  methodRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  methodIcon: { fontSize: 24 },
  methodName: { color: "#0b1c30", fontSize: 16, fontWeight: "600" },

  secure: { color: "#7b7486", fontSize: 12, textAlign: "center", marginTop: 4 },

  footer: {
    padding: 20, paddingBottom: 32,
    backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e5eeff",
  },
  payBtn: { backgroundColor: "#6d28d9", borderRadius: 14, paddingVertical: 18, alignItems: "center" },
  payBtnDisabled: { opacity: 0.55 },
  payBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 18 },
});
