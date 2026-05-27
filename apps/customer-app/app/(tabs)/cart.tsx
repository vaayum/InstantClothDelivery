import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { router } from "expo-router";
import RazorpayCheckout from "react-native-razorpay";
import { api, clearSession } from "../lib/api";
import { useCart } from "../context/CartContext";
import type { Address, PaymentMethod } from "../lib/types";

const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? "";

const PAYMENT_OPTIONS: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "COD"];

export default function CartScreen() {
  const { items, removeItem, updateQty, clearCart, totalPrice } = useCart();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [isTryOrder, setIsTryOrder] = useState(false);
  const [placing, setPlacing] = useState(false);

  const allTryable = items.length > 0 && items.every((i) => i.isTryable);
  const deliveryFee = paymentMethod === "COD" ? 2000 : 0;
  const total = totalPrice + deliveryFee;

  const loadAddresses = useCallback(async () => {
    try {
      const res = await api.get<Address[]>("/api/addresses");
      setAddresses(res.data);
      if (res.data.length > 0) setSelectedAddress(res.data[0]);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    }
  }, []);

  useEffect(() => { loadAddresses(); }, [loadAddresses]);

  async function placeOrder() {
    if (!selectedAddress) { Alert.alert("No address", "Add a delivery address in your Profile first."); return; }
    setPlacing(true);
    try {
      const res = await api.post<{ id: string; razorpayOrderId: string | null; totalAmount: number; deliveryFee: number }>(
        "/api/orders",
        {
          items: items.map((i) => ({ skuId: i.skuId, quantity: i.quantity })),
          addressId: selectedAddress.id,
          paymentMethod,
          isTryOrder: allTryable ? isTryOrder : false,
        }
      );

      const orderId = res.data.id;

      if (paymentMethod === "COD") {
        clearCart();
        router.replace(`/order/${orderId}`);
        return;
      }

      // Non-COD: open Razorpay checkout
      const rzpOrderId = res.data.razorpayOrderId;
      if (!rzpOrderId) {
        Alert.alert("Payment error", "Could not initiate payment. Please try again.");
        return;
      }

      const amount = res.data.totalAmount + res.data.deliveryFee;
      try {
        const payment = await RazorpayCheckout.open({
          description: "ThreadDash Order",
          currency: "INR",
          key: RAZORPAY_KEY_ID,
          amount,
          name: "ThreadDash",
          order_id: rzpOrderId,
          theme: { color: "#000000" },
        });

        await api.post("/api/payments/verify", {
          orderId,
          razorpayPaymentId: payment.razorpay_payment_id,
          razorpayOrderId: payment.razorpay_order_id,
          razorpaySignature: payment.razorpay_signature,
        });

        clearCart();
        router.replace(`/order/${orderId}`);
      } catch (payErr: unknown) {
        const desc = (payErr as { description?: string }).description;
        Alert.alert("Payment cancelled", desc ?? "Payment was not completed. Your order has been saved — try again from Orders.");
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const errorCode = (err as { response?: { data?: { error?: string } } }).response?.data?.error;

      if (status === 400 && errorCode === "no_delivery_address") {
        Alert.alert(
          "No delivery address",
          "Please set a delivery address first.",
          [
            { text: "Go to Profile", onPress: () => router.push("/(tabs)/profile") },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } else if (status === 409 && errorCode === "items_unavailable") {
        const unavailableSkuIds: string[] =
          (err as { response?: { data?: { unavailableSkuIds?: string[] } } }).response?.data?.unavailableSkuIds ?? [];
        const names = items
          .filter((i) => unavailableSkuIds.includes(i.skuId))
          .map((i) => `${i.productName} (${i.size})`)
          .join(", ");
        Alert.alert(
          "Item went out of stock",
          `${names || "One or more items"} just went out of stock. Remove it to continue.`
        );
      } else if (status === 409) {
        Alert.alert("Out of stock", "One or more items are not available.");
      } else if (status === 401) {
        await clearSession();
        router.replace("/login");
      } else {
        Alert.alert("Error", "Could not place order. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyIcon}>🛒</Text>
        <Text style={s.emptyTitle}>Your cart is empty</Text>
        <Text style={s.emptySub}>Browse the catalogue and add items</Text>
        <TouchableOpacity style={s.browseBtn} onPress={() => router.push("/(tabs)")}>
          <Text style={s.browseBtnText}>Browse</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <Text style={s.heading}>Cart</Text>

      {items.map((item) => (
        <View key={item.skuId} style={s.itemCard}>
          <View style={s.itemInfo}>
            <Text style={s.itemBrand}>{item.brand}</Text>
            <Text style={s.itemName}>{item.productName}</Text>
            <Text style={s.itemMeta}>{item.size} · {item.color}</Text>
          </View>
          <View style={s.itemRight}>
            <Text style={s.itemPrice}>₹{(item.price / 100).toFixed(0)}</Text>
            <View style={s.qtyRow}>
              <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.skuId, -1)}>
                <Text style={s.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.qty}>{item.quantity}</Text>
              <TouchableOpacity style={s.qtyBtn} onPress={() => updateQty(item.skuId, 1)}>
                <Text style={s.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => removeItem(item.skuId)}>
              <Text style={s.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {allTryable && (
        <TouchableOpacity style={s.tryRow} onPress={() => setIsTryOrder((v) => !v)}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={s.tryTitle}>Try Before You Keep</Text>
            <Text style={s.trySub}>30 min trial — keep what you love, return the rest</Text>
          </View>
          <View style={[s.toggle, isTryOrder && s.toggleOn]}>
            <View style={[s.thumb, isTryOrder && s.thumbOn]} />
          </View>
        </TouchableOpacity>
      )}

      <Text style={s.sectionLabel}>Deliver to</Text>
      {addresses.length === 0 ? (
        <Text style={s.noAddr}>Add a delivery address in your Profile first.</Text>
      ) : (
        addresses.map((addr) => (
          <TouchableOpacity
            key={addr.id}
            style={[s.addrCard, selectedAddress?.id === addr.id && s.addrSelected]}
            onPress={() => setSelectedAddress(addr)}
          >
            <Text style={s.addrLabel}>{addr.label}</Text>
            <Text style={s.addrText}>{addr.formattedAddress}</Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={s.sectionLabel}>Payment</Text>
      <View style={s.chipRow}>
        {PAYMENT_OPTIONS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[s.chip, paymentMethod === m && s.chipSelected]}
            onPress={() => setPaymentMethod(m)}
          >
            <Text style={[s.chipText, paymentMethod === m && s.chipTextSelected]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.summaryBox}>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Subtotal</Text>
          <Text style={s.summaryValue}>₹{(totalPrice / 100).toFixed(0)}</Text>
        </View>
        {deliveryFee > 0 && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Delivery fee</Text>
            <Text style={s.summaryValue}>₹{(deliveryFee / 100).toFixed(0)}</Text>
          </View>
        )}
        <View style={[s.summaryRow, s.totalRow]}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalValue}>₹{(total / 100).toFixed(0)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.orderBtn, placing && s.orderBtnDisabled]}
        onPress={placeOrder}
        disabled={placing}
      >
        {placing
          ? <ActivityIndicator color="#000" />
          : <Text style={s.orderBtnText}>
              {isTryOrder ? "Try Now" : "Place Order"} — ₹{(total / 100).toFixed(0)}
            </Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 20, paddingBottom: 48 },
  heading: { color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 20 },
  empty: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  emptySub: { color: "#666", fontSize: 15, marginBottom: 28 },
  browseBtn: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  browseBtnText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  itemCard: {
    backgroundColor: "#1a1a1a", borderRadius: 12, padding: 14,
    flexDirection: "row", justifyContent: "space-between", marginBottom: 12,
  },
  itemInfo: { flex: 1, marginRight: 12 },
  itemBrand: { color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  itemName: { color: "#fff", fontSize: 15, fontWeight: "600", marginTop: 2 },
  itemMeta: { color: "#888", fontSize: 13, marginTop: 2 },
  itemRight: { alignItems: "flex-end", gap: 6 },
  itemPrice: { color: "#22c55e", fontWeight: "bold", fontSize: 15 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    backgroundColor: "#2a2a2a", borderRadius: 6,
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
  },
  qtyBtnText: { color: "#fff", fontSize: 18, lineHeight: 22 },
  qty: { color: "#fff", fontSize: 15, fontWeight: "600", minWidth: 20, textAlign: "center" },
  remove: { color: "#ef4444", fontSize: 12 },
  tryRow: {
    backgroundColor: "#1a0a2e", borderRadius: 12, padding: 16,
    flexDirection: "row", alignItems: "center", marginBottom: 20,
  },
  tryTitle: { color: "#fff", fontWeight: "600", fontSize: 15 },
  trySub: { color: "#7c3aed", fontSize: 12, marginTop: 2 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: "#333", padding: 3 },
  toggleOn: { backgroundColor: "#7c3aed" },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  thumbOn: { alignSelf: "flex-end" },
  sectionLabel: {
    color: "#666", fontSize: 11, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 10, marginTop: 8,
  },
  noAddr: { color: "#555", fontSize: 14, marginBottom: 16 },
  addrCard: {
    backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 2, borderColor: "transparent",
  },
  addrSelected: { borderColor: "#3b82f6" },
  addrLabel: { color: "#fff", fontWeight: "600", marginBottom: 2 },
  addrText: { color: "#aaa", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { borderWidth: 1, borderColor: "#333", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chipSelected: { backgroundColor: "#fff", borderColor: "#fff" },
  chipText: { color: "#aaa", fontSize: 14 },
  chipTextSelected: { color: "#000", fontWeight: "600" },
  summaryBox: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { color: "#888", fontSize: 14 },
  summaryValue: { color: "#aaa", fontSize: 14 },
  totalRow: { borderTopWidth: 1, borderTopColor: "#2a2a2a", marginTop: 8, paddingTop: 12 },
  totalLabel: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  totalValue: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  orderBtn: { backgroundColor: "#fff", borderRadius: 14, padding: 20, alignItems: "center" },
  orderBtnDisabled: { backgroundColor: "#2a2a2a" },
  orderBtnText: { color: "#000", fontWeight: "bold", fontSize: 17 },
});
