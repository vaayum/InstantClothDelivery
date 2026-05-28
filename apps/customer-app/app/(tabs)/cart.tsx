import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { router } from "expo-router";
import { api, clearSession } from "../lib/api";
import { useCart } from "../context/CartContext";
import type { Address, PaymentMethod } from "../lib/types";

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

  function handleAddressSelect(addr: Address) {
    if (!selectedAddress || selectedAddress.id === addr.id) {
      setSelectedAddress(addr);
      return;
    }
    Alert.alert(
      "Change delivery address?",
      "Items in your cart may not be available at this address. You'll be notified at checkout if anything can't be fulfilled.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Change", onPress: () => setSelectedAddress(addr) },
      ]
    );
  }

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

      // Non-COD: navigate to dedicated payment screen
      const rzpOrderId = res.data.razorpayOrderId;
      if (!rzpOrderId) {
        Alert.alert("Payment error", "Could not initiate payment. Please try again.");
        return;
      }

      clearCart();
      router.push({
        pathname: `/payment/${orderId}`,
        params: {
          rzpOrderId,
          amount: String(res.data.totalAmount + res.data.deliveryFee),
          method: paymentMethod,
          itemCount: String(items.length),
          isTryOrder: String(allTryable ? isTryOrder : false),
        },
      });
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
            onPress={() => handleAddressSelect(addr)}
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
  scroll: { flex: 1, backgroundColor: "#f8f9ff" },
  content: { padding: 20, paddingBottom: 48 },
  heading: { color: "#0b1c30", fontSize: 28, fontWeight: "700", marginBottom: 20 },
  empty: { flex: 1, backgroundColor: "#f8f9ff", alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: "#0b1c30", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  emptySub: { color: "#7b7486", fontSize: 15, marginBottom: 28 },
  browseBtn: { backgroundColor: "#6d28d9", borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  browseBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  itemCard: {
    backgroundColor: "#ffffff", borderRadius: 14, padding: 14,
    flexDirection: "row", justifyContent: "space-between", marginBottom: 12,
    borderWidth: 1, borderColor: "#e5eeff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  itemInfo: { flex: 1, marginRight: 12 },
  itemBrand: { color: "#7b7486", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  itemName: { color: "#0b1c30", fontSize: 15, fontWeight: "600", marginTop: 2 },
  itemMeta: { color: "#7b7486", fontSize: 13, marginTop: 2 },
  itemRight: { alignItems: "flex-end", gap: 6 },
  itemPrice: { color: "#5300b7", fontWeight: "700", fontSize: 15 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    backgroundColor: "#eff4ff", borderRadius: 8,
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#d3e4fe",
  },
  qtyBtnText: { color: "#0b1c30", fontSize: 18, lineHeight: 22, fontWeight: "600" },
  qty: { color: "#0b1c30", fontSize: 15, fontWeight: "600", minWidth: 20, textAlign: "center" },
  remove: { color: "#ba1a1a", fontSize: 12, fontWeight: "600" },
  tryRow: {
    backgroundColor: "#ede9fe", borderRadius: 14, padding: 16,
    flexDirection: "row", alignItems: "center", marginBottom: 20,
    borderWidth: 1, borderColor: "#dac5ff",
  },
  tryTitle: { color: "#0b1c30", fontWeight: "700", fontSize: 15 },
  trySub: { color: "#5300b7", fontSize: 12, marginTop: 2 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: "#ccc3d7", padding: 3 },
  toggleOn: { backgroundColor: "#6d28d9" },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" },
  thumbOn: { alignSelf: "flex-end" },
  sectionLabel: {
    color: "#7b7486", fontSize: 11, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 1.2, marginBottom: 10, marginTop: 8,
  },
  noAddr: { color: "#7b7486", fontSize: 14, marginBottom: 16 },
  addrCard: {
    backgroundColor: "#ffffff", borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 2, borderColor: "#e5eeff",
  },
  addrSelected: { borderColor: "#6d28d9", backgroundColor: "#f5f0ff" },
  addrLabel: { color: "#0b1c30", fontWeight: "700", marginBottom: 2 },
  addrText: { color: "#7b7486", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { borderWidth: 1.5, borderColor: "#ccc3d7", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#ffffff" },
  chipSelected: { backgroundColor: "#6d28d9", borderColor: "#6d28d9" },
  chipText: { color: "#4a4455", fontSize: 14 },
  chipTextSelected: { color: "#ffffff", fontWeight: "700" },
  summaryBox: {
    backgroundColor: "#ffffff", borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#e5eeff",
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { color: "#7b7486", fontSize: 14 },
  summaryValue: { color: "#4a4455", fontSize: 14 },
  totalRow: { borderTopWidth: 1, borderTopColor: "#e5eeff", marginTop: 8, paddingTop: 12 },
  totalLabel: { color: "#0b1c30", fontSize: 16, fontWeight: "700" },
  totalValue: { color: "#0b1c30", fontSize: 16, fontWeight: "700" },
  orderBtn: { backgroundColor: "#6d28d9", borderRadius: 14, padding: 20, alignItems: "center" },
  orderBtnDisabled: { opacity: 0.55 },
  orderBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 17 },
});
