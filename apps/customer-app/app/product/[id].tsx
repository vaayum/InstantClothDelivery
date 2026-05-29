import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, clearSession } from "../lib/api";
import { useCart } from "../context/CartContext";
import { T } from "../lib/theme";
import type { Product, Sku } from "../lib/types";

function RatingRow({ rating = 4.2, count = 312 }: { rating?: number; count?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={r.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= full ? "star" : half && i === full + 1 ? "star-half" : "star-outline"}
          size={14}
          color="#F5C518"
        />
      ))}
      <Text style={r.text}>{rating} ({count} ratings)</Text>
    </View>
  );
}
const r = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginVertical: 8 },
  text: { marginLeft: 6, fontSize: 13, color: T.mid, fontFamily: T.font.regular },
});

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
    return <View style={s.center}><ActivityIndicator size="large" color={T.pink} /></View>;
  }
  if (!product) {
    return <View style={s.center}><Text style={s.errorText}>Product not found.</Text></View>;
  }

  const selectedSkuUnavailable = selectedSku?.available === false;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.imageBox}>
        <Text style={s.heroEmoji}>👕</Text>
      </View>

      <Text style={s.brand}>{product.brand} · {product.category}</Text>
      <Text style={s.name}>{product.name}</Text>
      <RatingRow />
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
        <Text style={s.addBtnText}>
          {added ? "ADDED TO BAG ✓" : "ADD TO BAG"}
        </Text>
      </TouchableOpacity>

      {selectedSkuUnavailable && selectedSku?.alternativeWarehouseId && (
        <TouchableOpacity style={s.switchBtn} onPress={handleSwitchStore} disabled={switching}>
          {switching
            ? <ActivityIndicator color={T.white} size="small" />
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
  scroll:   { flex: 1, backgroundColor: T.white },
  content:  { paddingBottom: 48 },
  center:   { flex: 1, backgroundColor: T.white, alignItems: "center", justifyContent: "center" },

  imageBox: {
    width: "100%",
    aspectRatio: 0.75,
    backgroundColor: T.lightBg,
    alignItems: "center",
    justifyContent: "center",
  },
  heroEmoji: { fontSize: 96 },

  brand: {
    color: T.gray, fontSize: 12, marginTop: 16, marginHorizontal: 20,
    textTransform: "uppercase", letterSpacing: 0.8, fontFamily: T.font.bold,
  },
  name: {
    color: T.dark, fontSize: 20, marginHorizontal: 20, marginTop: 4,
    fontFamily: T.font.semi, lineHeight: 26,
  },
  price: {
    color: T.dark, fontSize: 22, marginHorizontal: 20, marginTop: 4,
    fontFamily: T.font.bold,
  },
  desc: {
    color: T.mid, fontSize: 14, marginHorizontal: 20, marginTop: 8,
    lineHeight: 20, fontFamily: T.font.regular,
  },
  tryBadge: {
    backgroundColor: T.pinkLight, borderRadius: T.radiusMd,
    paddingHorizontal: 12, paddingVertical: 6,
    marginHorizontal: 20, marginTop: 10, alignSelf: "flex-start",
  },
  tryBadgeText: { color: T.pink, fontSize: 12, fontFamily: T.font.semi },

  sectionLabel: {
    color: T.gray, fontSize: 12, textTransform: "uppercase",
    letterSpacing: 1, marginHorizontal: 20, marginTop: 24, marginBottom: 10,
    fontFamily: T.font.bold,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
  chip: { borderWidth: 1, borderColor: T.border, borderRadius: T.radius, paddingHorizontal: 16, paddingVertical: 8 },
  chipSelected: { backgroundColor: T.dark, borderColor: T.dark },
  chipText: { color: T.mid, fontSize: 14, fontFamily: T.font.regular },
  chipTextSelected: { color: T.white, fontFamily: T.font.semi },
  chipUnavailable: { opacity: 0.4 },
  chipTextUnavailable: { textDecorationLine: "line-through" },

  oosNote: { color: T.red, fontSize: 13, marginHorizontal: 20, marginTop: 12, fontFamily: T.font.regular },

  addBtn: {
    backgroundColor: T.pink, borderRadius: T.radius,
    paddingVertical: 16, alignItems: "center",
    marginHorizontal: 20, marginTop: 20,
  },
  addBtnDone: { backgroundColor: T.green },
  addBtnDisabled: { backgroundColor: T.lightBg },
  addBtnText: {
    color: T.white, fontFamily: T.font.semi, fontSize: 14,
    letterSpacing: 1, textTransform: "uppercase",
  },

  switchBtn: {
    backgroundColor: T.mid, borderRadius: T.radius, paddingVertical: 14,
    alignItems: "center", marginHorizontal: 20, marginTop: 10,
  },
  switchBtnText: { color: T.white, fontFamily: T.font.semi, fontSize: 14 },

  goCartBtn: { alignItems: "center", padding: 16 },
  goCartText: { color: T.pink, fontSize: 15, fontFamily: T.font.semi },

  errorText: { color: T.red, fontSize: 16, fontFamily: T.font.regular },
});
