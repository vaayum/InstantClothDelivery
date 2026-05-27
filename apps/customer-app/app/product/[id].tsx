import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, clearSession } from "../lib/api";
import { useCart } from "../context/CartContext";
import type { Product, Sku } from "../lib/types";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState<Sku | null>(null);
  const [added, setAdded] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { addItem, clearCart } = useCart();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Product>(`/api/catalog/${id}`);
      setProduct(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sizes = product ? [...new Set(product.skus.map((s) => s.size))] : [];
  const colorsForSize = selectedSize ? product?.skus.filter((s) => s.size === selectedSize) ?? [] : [];

  function handleAddToCart() {
    if (!selectedSku || !product) {
      Alert.alert("Select a variant", "Please choose a size and color first.");
      return;
    }
    if (selectedSku.available === false) {
      Alert.alert("Unavailable", "This variant is not available at your store.");
      return;
    }
    addItem({
      skuId: selectedSku.id,
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      size: selectedSku.size,
      color: selectedSku.color,
      price: product.price,
      isTryable: product.isTryable,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  async function handleSwitchStore() {
    if (!selectedSku?.alternativeWarehouseId) return;
    Alert.alert(
      "Switch store?",
      "Your cart will be cleared. Delivery may take longer from the other store.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          style: "destructive",
          onPress: async () => {
            setSwitching(true);
            try {
              await api.patch("/api/users/me/pinned-warehouse", {
                warehouseId: selectedSku.alternativeWarehouseId,
              });
              clearCart();
              router.replace("/(tabs)");
            } catch {
              Alert.alert("Error", "Could not switch store. Please try again.");
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }
  if (!product) {
    return <View style={s.center}><Text style={s.errorText}>Product not found.</Text></View>;
  }

  const selectedSkuUnavailable = selectedSku?.available === false;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.hero}><Text style={s.heroEmoji}>👕</Text></View>

      <Text style={s.brand}>{product.brand} · {product.category}</Text>
      <Text style={s.name}>{product.name}</Text>
      <Text style={s.price}>₹{(product.price / 100).toFixed(0)}</Text>
      {product.description ? <Text style={s.desc}>{product.description}</Text> : null}
      {product.isTryable && (
        <View style={s.tryBadge}><Text style={s.tryBadgeText}>Try Before You Keep eligible</Text></View>
      )}

      <Text style={s.sectionLabel}>Size</Text>
      <View style={s.chipRow}>
        {sizes.map((size) => (
          <TouchableOpacity
            key={size}
            style={[s.chip, selectedSize === size && s.chipSelected]}
            onPress={() => { setSelectedSize(size); setSelectedSku(null); }}
          >
            <Text style={[s.chipText, selectedSize === size && s.chipTextSelected]}>{size}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedSize && (
        <>
          <Text style={s.sectionLabel}>Color</Text>
          <View style={s.chipRow}>
            {colorsForSize.map((sku) => {
              const unavailable = sku.available === false;
              return (
                <TouchableOpacity
                  key={sku.id}
                  style={[
                    s.chip,
                    selectedSku?.id === sku.id && s.chipSelected,
                    unavailable && s.chipUnavailable,
                  ]}
                  onPress={() => setSelectedSku(sku)}
                >
                  <Text style={[
                    s.chipText,
                    selectedSku?.id === sku.id && s.chipTextSelected,
                    unavailable && s.chipTextUnavailable,
                  ]}>
                    {sku.color}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {selectedSkuUnavailable && (
        <Text style={s.oosNote}>
          {selectedSku?.alternativeWarehouseId
            ? "Not available at your store"
            : "Unavailable near you"}
        </Text>
      )}

      <TouchableOpacity
        style={[
          s.addBtn,
          added && s.addBtnDone,
          (!selectedSku || selectedSkuUnavailable) && s.addBtnDisabled,
        ]}
        onPress={handleAddToCart}
        disabled={!selectedSku || selectedSkuUnavailable}
      >
        <Text style={[s.addBtnText, added && { color: "#fff" }]}>
          {added ? "Added to Cart ✓" : "Add to Cart"}
        </Text>
      </TouchableOpacity>

      {selectedSkuUnavailable && selectedSku?.alternativeWarehouseId && (
        <TouchableOpacity style={s.switchBtn} onPress={handleSwitchStore} disabled={switching}>
          {switching
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.switchBtnText}>Switch store</Text>}
        </TouchableOpacity>
      )}

      {added && (
        <TouchableOpacity style={s.goCartBtn} onPress={() => router.push("/(tabs)/cart")}>
          <Text style={s.goCartText}>Go to Cart →</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { paddingBottom: 48 },
  center: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: "#1a1a1a", height: 260, alignItems: "center", justifyContent: "center" },
  heroEmoji: { fontSize: 96 },
  brand: { color: "#888", fontSize: 13, marginTop: 16, marginHorizontal: 20, textTransform: "uppercase", letterSpacing: 0.5 },
  name: { color: "#fff", fontSize: 24, fontWeight: "bold", marginHorizontal: 20, marginTop: 4 },
  price: { color: "#22c55e", fontSize: 22, fontWeight: "bold", marginHorizontal: 20, marginTop: 4 },
  desc: { color: "#aaa", fontSize: 14, marginHorizontal: 20, marginTop: 8, lineHeight: 20 },
  tryBadge: {
    backgroundColor: "#1a0a2e", borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 6, marginHorizontal: 20, marginTop: 10, alignSelf: "flex-start",
  },
  tryBadgeText: { color: "#a78bfa", fontSize: 12, fontWeight: "600" },
  sectionLabel: { color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginHorizontal: 20, marginTop: 24, marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
  chip: { borderWidth: 1, borderColor: "#333", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chipSelected: { backgroundColor: "#fff", borderColor: "#fff" },
  chipText: { color: "#aaa", fontSize: 14 },
  chipTextSelected: { color: "#000", fontWeight: "600" },
  chipUnavailable: { opacity: 0.4 },
  chipTextUnavailable: { textDecorationLine: "line-through" },
  oosNote: { color: "#ef4444", fontSize: 13, marginHorizontal: 20, marginTop: 12 },
  addBtn: { backgroundColor: "#fff", borderRadius: 14, padding: 20, alignItems: "center", margin: 20, marginBottom: 0 },
  addBtnDone: { backgroundColor: "#22c55e" },
  addBtnDisabled: { backgroundColor: "#2a2a2a" },
  addBtnText: { color: "#000", fontWeight: "bold", fontSize: 17 },
  switchBtn: { backgroundColor: "#374151", borderRadius: 14, padding: 16, alignItems: "center", marginHorizontal: 20, marginTop: 10 },
  switchBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  goCartBtn: { alignItems: "center", padding: 16 },
  goCartText: { color: "#3b82f6", fontSize: 15, fontWeight: "600" },
  errorText: { color: "#ef4444", fontSize: 16 },
});
