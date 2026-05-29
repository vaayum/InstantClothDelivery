import { useCallback, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, router } from "expo-router";
import { api, clearSession } from "../lib/api";
import { useWishlist } from "../context/WishlistContext";
import { T } from "../lib/theme";
import type { Product } from "../lib/types";

function isProductAvailable(product: Product): boolean {
  return product.skus.some((s) => s.available === true);
}

export default function WishlistScreen() {
  const { wishlistIds, remove: removeFromWishlist, refresh: refreshWishlist } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedWarehouseId, setPinnedWarehouseId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const meRes = await api.get<{ user: { pinnedWarehouseId: string | null } }>("/api/me");
      const wid = meRes.data.user.pinnedWarehouseId;
      setPinnedWarehouseId(wid);

      if (wishlistIds.size === 0) { setProducts([]); return; }

      const url = wid ? `/api/catalog?warehouseId=${wid}` : "/api/catalog";
      const res = await api.get<Product[]>(url);
      setProducts(res.data.filter((p) => wishlistIds.has(p.id)));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [wishlistIds]);

  useFocusEffect(useCallback(() => {
    refreshWishlist().then(() => load());
  }, [load, refreshWishlist]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={T.pink} /></View>;
  }

  if (products.length === 0) {
    return (
      <View style={s.center}>
        <Ionicons name="heart-outline" size={56} color={T.pink} style={{ marginBottom: 12 }} />
        <Text style={s.emptyTitle}>No saved items</Text>
        <Text style={s.emptySub}>Tap the heart on any product to save it here</Text>
        <TouchableOpacity style={s.browseBtn} onPress={() => router.push("/(tabs)")}>
          <Text style={s.browseBtnText}>Browse Catalog</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListHeaderComponent={
          !pinnedWarehouseId ? (
            <View style={s.noLocBanner}>
              <Text style={s.noLocText}>Set your location to see which items can be delivered to you</Text>
            </View>
          ) : null
        }
        contentContainerStyle={s.list}
        renderItem={({ item }) => {
          const available = isProductAvailable(item);
          return (
            <View style={s.row}>
              <TouchableOpacity
                style={[s.card, !available && s.cardUnavailable]}
                onPress={() => available ? router.push(`/product/${item.id}`) : undefined}
                activeOpacity={available ? 0.85 : 1}
              >
                <View style={s.info}>
                  <Text style={s.brand} numberOfLines={1}>{item.brand}</Text>
                  <Text style={s.name} numberOfLines={2}>{item.name}</Text>
                  {available
                    ? <Text style={s.price}>₹{(item.price / 100).toFixed(0)}</Text>
                    : <Text style={s.unavailable}>
                        {pinnedWarehouseId ? "Not available in your area" : "Set location to check availability"}
                      </Text>
                  }
                </View>
                {available && (
                  <View style={s.availBadge}><Text style={s.availText}>Available</Text></View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.removeBtn} onPress={() => removeFromWishlist(item.id)}>
                <Ionicons name="close" size={18} color={T.gray} />
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.lightBg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.lightBg, padding: 32 },
  list: { padding: 16, paddingBottom: 48 },
  emptyTitle: { fontSize: 20, fontFamily: T.font.bold, color: T.dark, marginBottom: 6 },
  emptySub: { color: T.mid, textAlign: "center", marginBottom: 24, fontFamily: T.font.regular },
  browseBtn: { backgroundColor: T.pink, borderRadius: T.radius, paddingHorizontal: 28, paddingVertical: 12 },
  browseBtnText: { color: T.white, fontFamily: T.font.semi },
  noLocBanner: { backgroundColor: T.pinkLight, borderRadius: T.radiusMd, padding: 12, marginBottom: 12 },
  noLocText: { color: T.pinkDark, fontSize: 13, textAlign: "center", fontFamily: T.font.regular },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  card: {
    flex: 1, backgroundColor: T.white, borderRadius: T.radiusMd, padding: 14,
    borderWidth: 1, borderColor: T.border,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  cardUnavailable: { opacity: 0.65 },
  info: { flex: 1, marginRight: 8 },
  brand: { color: T.gray, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: T.font.bold },
  name: { color: T.dark, fontFamily: T.font.semi, fontSize: 14, marginTop: 2 },
  price: { color: T.dark, fontFamily: T.font.bold, marginTop: 4 },
  unavailable: { color: T.gray, fontSize: 12, marginTop: 4, fontStyle: "italic", fontFamily: T.font.regular },
  availBadge: { backgroundColor: T.greenLight, borderRadius: T.radiusMd, paddingHorizontal: 8, paddingVertical: 4 },
  availText: { color: T.green, fontSize: 11, fontFamily: T.font.bold },
  removeBtn: { marginLeft: 8, padding: 8 },
});
