import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert, Switch,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, clearSession } from "../lib/api";
import type { Product, Sku, Address, PaymentMethod } from "../lib/types";

const PAYMENT_OPTIONS: PaymentMethod[] = ["UPI", "CARD", "NET_BANKING", "COD"];

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState<Sku | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [isTryOrder, setIsTryOrder] = useState(false);
  const [placing, setPlacing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, addrRes] = await Promise.all([
        api.get<Product>(`/api/catalog/${id}`),
        api.get<Address[]>("/api/addresses"),
      ]);
      setProduct(prodRes.data);
      setAddresses(addrRes.data);
      if (addrRes.data.length > 0) setSelectedAddress(addrRes.data[0]);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sizes = product ? [...new Set(product.skus.map((s) => s.size))] : [];
  const colorsForSize = selectedSize
    ? product?.skus.filter((s) => s.size === selectedSize) ?? []
    : [];

  function selectSize(size: string) {
    setSelectedSize(size);
    setSelectedSku(null);
  }

  function selectSku(sku: Sku) {
    setSelectedSku(sku);
  }

  async function placeOrder() {
    if (!selectedSku) { Alert.alert("Select a variant", "Please choose a size and color."); return; }
    if (!selectedAddress) { Alert.alert("No address", "Add a delivery address in your Profile first."); return; }
    setPlacing(true);
    try {
      const res = await api.post<{ id: string }>("/api/orders", {
        items: [{ skuId: selectedSku.id, quantity: 1 }],
        addressId: selectedAddress.id,
        paymentMethod,
        isTryOrder,
      });
      const orderId = res.data.id;
      await AsyncStorage.setItem("last_order_id", orderId);
      router.replace(`/order/${orderId}`);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409) Alert.alert("Out of stock", "This item is not available right now.");
      else if (status === 401) { await clearSession(); router.replace("/login"); }
      else Alert.alert("Error", "Could not place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }
  if (!product) {
    return <View style={s.center}><Text style={s.errorText}>Product not found.</Text></View>;
  }

  const canOrder = !!selectedSku && !!selectedAddress;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Hero placeholder */}
      <View style={s.hero}><Text style={s.heroEmoji}>👕</Text></View>

      {/* Product info */}
      <Text style={s.brand}>{product.brand} · {product.category}</Text>
      <Text style={s.name}>{product.name}</Text>
      <Text style={s.price}>₹{(product.price / 100).toFixed(0)}</Text>
      {product.description ? <Text style={s.desc}>{product.description}</Text> : null}

      {/* Size picker */}
      <Text style={s.sectionLabel}>Size</Text>
      <View style={s.chipRow}>
        {sizes.map((size) => (
          <TouchableOpacity
            key={size}
            style={[s.chip, selectedSize === size && s.chipSelected]}
            onPress={() => selectSize(size)}
          >
            <Text style={[s.chipText, selectedSize === size && s.chipTextSelected]}>{size}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Color picker */}
      {selectedSize && (
        <>
          <Text style={s.sectionLabel}>Color</Text>
          <View style={s.chipRow}>
            {colorsForSize.map((sku) => (
              <TouchableOpacity
                key={sku.id}
                style={[s.chip, selectedSku?.id === sku.id && s.chipSelected]}
                onPress={() => selectSku(sku)}
              >
                <Text style={[s.chipText, selectedSku?.id === sku.id && s.chipTextSelected]}>{sku.color}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Try toggle */}
      {product.isTryable && (
        <View style={s.tryRow}>
          <View>
            <Text style={s.tryTitle}>Try Before You Keep</Text>
            <Text style={s.trySub}>30 min trial. Keep what you love, return the rest.</Text>
          </View>
          <Switch
            value={isTryOrder}
            onValueChange={setIsTryOrder}
            trackColor={{ true: "#7c3aed" }}
            thumbColor="#fff"
          />
        </View>
      )}

      {/* Address selector */}
      <Text style={s.sectionLabel}>Deliver to</Text>
      {addresses.length === 0 ? (
        <Text style={s.noAddr}>Add a delivery address in your Profile first.</Text>
      ) : (
        addresses.map((addr) => (
          <TouchableOpacity
            key={addr.id}
            style={[s.addrCard, selectedAddress?.id === addr.id && s.addrCardSelected]}
            onPress={() => setSelectedAddress(addr)}
          >
            <Text style={s.addrLabel}>{addr.label}</Text>
            <Text style={s.addrText}>{addr.formattedAddress}</Text>
          </TouchableOpacity>
        ))
      )}

      {/* Payment method */}
      <Text style={s.sectionLabel}>Payment</Text>
      <View style={s.chipRow}>
        {PAYMENT_OPTIONS.map((method) => (
          <TouchableOpacity
            key={method}
            style={[s.chip, paymentMethod === method && s.chipSelected]}
            onPress={() => setPaymentMethod(method)}
          >
            <Text style={[s.chipText, paymentMethod === method && s.chipTextSelected]}>{method}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Place order */}
      <TouchableOpacity
        style={[s.orderBtn, !canOrder && s.orderBtnDisabled]}
        onPress={placeOrder}
        disabled={!canOrder || placing}
      >
        {placing
          ? <ActivityIndicator color="#000" />
          : <Text style={s.orderBtnText}>{isTryOrder ? "Try Now" : "Order Now"} — ₹{(product.price / 100).toFixed(0)}</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { paddingBottom: 48 },
  center: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: "#1a1a1a", height: 260,
    alignItems: "center", justifyContent: "center",
  },
  heroEmoji: { fontSize: 96 },
  brand: { color: "#888", fontSize: 13, marginTop: 16, marginHorizontal: 20, textTransform: "uppercase", letterSpacing: 0.5 },
  name: { color: "#fff", fontSize: 24, fontWeight: "bold", marginHorizontal: 20, marginTop: 4 },
  price: { color: "#22c55e", fontSize: 22, fontWeight: "bold", marginHorizontal: 20, marginTop: 4 },
  desc: { color: "#aaa", fontSize: 14, marginHorizontal: 20, marginTop: 8, lineHeight: 20 },
  sectionLabel: { color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginHorizontal: 20, marginTop: 24, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
  chip: { borderWidth: 1, borderColor: "#333", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chipSelected: { backgroundColor: "#fff", borderColor: "#fff" },
  chipText: { color: "#aaa", fontSize: 14 },
  chipTextSelected: { color: "#000", fontWeight: "600" },
  tryRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, margin: 20,
  },
  tryTitle: { color: "#fff", fontWeight: "600", fontSize: 15 },
  trySub: { color: "#888", fontSize: 12, marginTop: 2, maxWidth: 220 },
  noAddr: { color: "#555", fontSize: 14, marginHorizontal: 20 },
  addrCard: { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14, marginHorizontal: 20, marginBottom: 8, borderWidth: 2, borderColor: "transparent" },
  addrCardSelected: { borderColor: "#3b82f6" },
  addrLabel: { color: "#fff", fontWeight: "600", marginBottom: 2 },
  addrText: { color: "#aaa", fontSize: 13 },
  orderBtn: { backgroundColor: "#fff", borderRadius: 14, padding: 20, alignItems: "center", margin: 20 },
  orderBtnDisabled: { backgroundColor: "#2a2a2a" },
  orderBtnText: { color: "#000", fontWeight: "bold", fontSize: 17 },
  errorText: { color: "#ef4444", fontSize: 16 },
});
