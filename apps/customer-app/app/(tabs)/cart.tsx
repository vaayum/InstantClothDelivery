import { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api, clearSession } from "../lib/api";
import { useCart } from "../context/CartContext";
import type { Address, MeResponse, PaymentMethod } from "../lib/types";
import { T } from "../lib/theme";

const PAYMENT_OPTIONS: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "COD"];

export default function CartScreen() {
  const { items, removeItem, updateQty, clearCart, totalPrice } = useCart();
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [isTryOrder, setIsTryOrder] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [couponCode, setCouponCode] = useState("");

  const allTryable = items.length > 0 && items.every((i) => i.isTryable);
  const deliveryFee = paymentMethod === "COD" ? 2000 : 0;
  const total = totalPrice + deliveryFee;

  const loadPrimaryAddress = useCallback(async () => {
    try {
      const [addrRes, meRes] = await Promise.all([
        api.get<Address[]>("/api/addresses"),
        api.get<MeResponse>("/api/me"),
      ]);
      const primaryId = meRes.data.user.primaryAddressId;
      const primary = addrRes.data.find((a) => a.id === primaryId) ?? addrRes.data[0] ?? null;
      setSelectedAddress(primary);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    }
  }, []);

  useFocusEffect(useCallback(() => { loadPrimaryAddress(); }, [loadPrimaryAddress]));

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
      if (paymentMethod === "COD") { clearCart(); router.replace(`/order/${orderId}`); return; }
      const rzpOrderId = res.data.razorpayOrderId;
      if (!rzpOrderId) { Alert.alert("Payment error", "Could not initiate payment. Please try again."); return; }
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
        Alert.alert("No delivery address", "Please set a delivery address first.", [
          { text: "Go to Profile", onPress: () => router.push("/(tabs)/profile") },
          { text: "Cancel", style: "cancel" },
        ]);
      } else if (status === 409 && errorCode === "items_unavailable") {
        const unavailableSkuIds: string[] =
          (err as { response?: { data?: { unavailableSkuIds?: string[] } } }).response?.data?.unavailableSkuIds ?? [];
        const names = items
          .filter((i) => unavailableSkuIds.includes(i.skuId))
          .map((i) => `${i.productName} (${i.size})`)
          .join(", ");
        Alert.alert("Item went out of stock", `${names || "One or more items"} just went out of stock. Remove it to continue.`);
      } else if (status === 409) {
        Alert.alert("Out of stock", "One or more items are not available.");
      } else if (status === 401) {
        await clearSession(); router.replace("/login");
      } else {
        Alert.alert("Error", "Could not place order. Please try again.");
      }
    } finally { setPlacing(false); }
  }

  if (items.length === 0) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyIcon}>👜</Text>
        <Text style={s.emptyTitle}>YOUR BAG IS EMPTY</Text>
        <Text style={s.emptySub}>Add items to it now</Text>
        <TouchableOpacity style={s.browseBtn} onPress={() => router.push("/(tabs)")}>
          <Text style={s.browseBtnText}>SHOP NOW</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.pageHeader}>
        <Text style={s.heading}>MY BAG</Text>
        <Text style={s.itemCount}>{items.length} item{items.length !== 1 ? "s" : ""}</Text>
      </View>

      {/* Coupon row */}
      <View style={s.couponRow}>
        <Ionicons name="pricetag-outline" size={18} color={T.mid} style={s.couponIcon} />
        <TextInput
          style={s.couponInput}
          placeholder="Apply Coupon"
          placeholderTextColor={T.gray}
          value={couponCode}
          onChangeText={setCouponCode}
          autoCapitalize="characters"
        />
        {couponCode.length > 0 && (
          <TouchableOpacity onPress={() => setCouponCode("")}>
            <Text style={s.couponApply}>APPLY</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Delivery address */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>DELIVER TO</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/profile")}>
            <Text style={s.changeLink}>CHANGE</Text>
          </TouchableOpacity>
        </View>
        {selectedAddress ? (
          <View style={s.addrCard}>
            <View style={s.addrTag}><Text style={s.addrTagText}>{selectedAddress.label.toUpperCase()}</Text></View>
            <View style={s.addrTextRow}>
              <Ionicons name="location-outline" size={14} color={T.mid} style={s.addrIcon} />
              <Text style={[s.addrText, s.addrTextFlex]}>{selectedAddress.formattedAddress}</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => router.push("/(tabs)/profile")}>
            <Text style={s.noAddr}>Add a delivery address →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Cart items */}
      {items.map((item) => (
        <View key={item.skuId} style={s.itemCard}>
          <View style={s.itemImgBlock}>
            <Text style={s.itemEmoji}>👕</Text>
          </View>
          <View style={s.itemInfo}>
            <Text style={s.itemBrand}>{item.brand}</Text>
            <Text style={s.itemName}>{item.productName}</Text>
            <Text style={s.itemMeta}>{item.size} · {item.color}</Text>
            <Text style={s.itemPrice}>₹{(item.price / 100).toFixed(0)}</Text>
            <View style={s.itemActions}>
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
                <Text style={s.removeText}>REMOVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}

      {/* Try Before Keep toggle */}
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

      {/* Payment method */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>PAYMENT</Text>
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
      </View>

      {/* Price summary */}
      <View style={s.summaryBox}>
        <Text style={s.summaryTitle}>PRICE DETAILS</Text>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Total MRP</Text>
          <Text style={s.summaryValue}>₹{(totalPrice / 100).toFixed(0)}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Discount on MRP</Text>
          <Text style={[s.summaryValue, { color: T.green }]}>– ₹0</Text>
        </View>
        {deliveryFee > 0 && (
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Delivery Fee</Text>
            <Text style={s.summaryValue}>₹{(deliveryFee / 100).toFixed(0)}</Text>
          </View>
        )}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total Amount</Text>
          <Text style={s.totalValue}>₹{(total / 100).toFixed(0)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[s.placeBtn, placing && s.placeBtnDisabled]}
        onPress={placeOrder}
        disabled={placing}
      >
        {placing
          ? <ActivityIndicator color={T.white} />
          : <Text style={s.placeBtnText}>
              {isTryOrder ? "TRY NOW" : "PLACE ORDER"} — ₹{(total / 100).toFixed(0)}
            </Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.lightBg },
  content: { paddingBottom: 48 },

  pageHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: T.white, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 8,
  },
  heading: { fontSize: 16, fontWeight: T.bold, color: T.dark, letterSpacing: 1, fontFamily: T.font.bold },
  itemCount: { fontSize: 13, color: T.gray, fontFamily: T.font.regular },

  section: { backgroundColor: T.white, padding: 16, marginBottom: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: T.bold, color: T.dark, letterSpacing: 0.8, fontFamily: T.font.bold },
  changeLink: { fontSize: 12, fontWeight: T.bold, color: T.pink, fontFamily: T.font.bold },

  addrCard: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  addrTag: { backgroundColor: T.green, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 },
  addrTagText: { color: T.white, fontSize: 10, fontWeight: T.bold, fontFamily: T.font.bold },
  addrText: { flex: 1, fontSize: 13, color: T.mid, lineHeight: 18, fontFamily: T.font.regular },
  noAddr: { color: T.pink, fontSize: 13, fontFamily: T.font.regular },

  itemCard: {
    backgroundColor: T.white, flexDirection: "row", padding: 16,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  itemImgBlock: {
    width: 80, height: 100, backgroundColor: T.lightBg, borderRadius: T.radius,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  itemEmoji: { fontSize: 36 },
  itemInfo: { flex: 1 },
  itemBrand: { fontSize: 13, fontWeight: T.bold, color: T.dark, fontFamily: T.font.bold },
  itemName: { fontSize: 13, color: T.mid, marginTop: 2, fontFamily: T.font.regular },
  itemMeta: { fontSize: 12, color: T.gray, marginTop: 2, fontFamily: T.font.regular },
  itemPrice: { fontSize: 15, fontWeight: T.bold, color: T.dark, marginTop: 6, fontFamily: T.font.bold },
  itemActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  qtyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: T.border, borderRadius: T.radius, paddingHorizontal: 8,
  },
  qtyBtn: { paddingVertical: 4 },
  qtyBtnText: { fontSize: 18, color: T.dark },
  qty: { fontSize: 14, fontWeight: T.bold, color: T.dark, minWidth: 20, textAlign: "center", fontFamily: T.font.bold },
  removeText: { fontSize: 12, fontWeight: T.bold, color: T.gray, letterSpacing: 0.5, fontFamily: T.font.bold },

  tryRow: {
    backgroundColor: T.white, flexDirection: "row", alignItems: "center",
    padding: 16, borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 8,
  },
  tryTitle: { fontSize: 13, fontWeight: T.bold, color: T.dark, fontFamily: T.font.bold },
  trySub: { fontSize: 12, color: T.gray, marginTop: 2, fontFamily: T.font.regular },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: T.border, padding: 3 },
  toggleOn: { backgroundColor: T.pink },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: T.white },
  thumbOn: { alignSelf: "flex-end" },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: T.radius, paddingHorizontal: 14, paddingVertical: 7 },
  chipSelected: { backgroundColor: T.dark, borderColor: T.dark },
  chipText: { color: T.mid, fontSize: 13, fontFamily: T.font.regular },
  chipTextSelected: { color: T.white, fontWeight: T.bold, fontFamily: T.font.bold },

  summaryBox: { backgroundColor: T.white, padding: 16, marginTop: 8, marginBottom: 8 },
  summaryTitle: { fontSize: 12, fontWeight: T.bold, color: T.dark, letterSpacing: 0.8, marginBottom: 14, fontFamily: T.font.bold },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  summaryLabel: { fontSize: 13, color: T.mid, fontFamily: T.font.regular },
  summaryValue: { fontSize: 13, color: T.dark, fontFamily: T.font.regular },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12, marginTop: 4,
  },
  totalLabel: { fontSize: 14, fontWeight: T.bold, color: T.dark, fontFamily: T.font.bold },
  totalValue: { fontSize: 14, fontWeight: T.bold, color: T.dark, fontFamily: T.font.bold },

  placeBtn: { backgroundColor: T.pink, margin: 16, paddingVertical: 16, alignItems: "center", borderRadius: T.radius },
  placeBtnDisabled: { opacity: 0.5 },
  placeBtnText: { color: T.white, fontWeight: T.bold, fontSize: 14, letterSpacing: 1, fontFamily: T.font.semi },

  empty: { flex: 1, backgroundColor: T.white, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: T.bold, color: T.dark, marginBottom: 8, letterSpacing: 1, fontFamily: T.font.bold },
  emptySub: { color: T.gray, fontSize: 14, marginBottom: 28, fontFamily: T.font.regular },
  browseBtn: { backgroundColor: T.pink, borderRadius: T.radius, paddingHorizontal: 32, paddingVertical: 14 },
  browseBtnText: { color: T.white, fontWeight: T.bold, fontSize: 14, letterSpacing: 1, fontFamily: T.font.bold },

  couponRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: T.white,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.border,
    paddingHorizontal: 16, paddingVertical: 12,
    marginBottom: 8,
  },
  couponIcon: { marginRight: 10 },
  couponInput: {
    flex: 1, fontSize: 14, color: T.dark,
    fontFamily: T.font.regular,
  },
  couponApply: {
    color: T.pink, fontFamily: T.font.semi, fontSize: 13,
  },
  addrTextRow: { flexDirection: "row", alignItems: "flex-start" },
  addrIcon: { marginTop: 2, marginRight: 6 },
  addrTextFlex: { flex: 1 },
});
