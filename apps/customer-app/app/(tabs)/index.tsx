import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { api, clearSession } from "../lib/api";
import type { Product } from "../lib/types";

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const res = await api.get<Product[]>("/api/catalog");
      setProducts(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
      else setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter((p) => {
    const q = query.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  return (
    <View style={s.container}>
      <Text style={s.heading}>Discover</Text>
      <TextInput
        style={s.search}
        placeholder="Search clothes..."
        placeholderTextColor="#555"
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />}
        ListEmptyComponent={
          error
            ? <Text style={s.empty}>Could not load products. Pull down to retry.</Text>
            : <Text style={s.empty}>No products found.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => router.push(`/product/${item.id}`)}>
            <View style={s.imgPlaceholder}>
              <Text style={s.imgEmoji}>👕</Text>
            </View>
            <Text style={s.brand}>{item.brand}</Text>
            <Text style={s.name} numberOfLines={2}>{item.name}</Text>
            <Text style={s.price}>₹{(item.price / 100).toFixed(0)}</Text>
            {item.isTryable && <View style={s.tryBadge}><Text style={s.tryText}>Try</Text></View>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  center: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", padding: 20, paddingBottom: 12 },
  search: {
    backgroundColor: "#1a1a1a", color: "#fff", borderRadius: 10,
    padding: 12, marginHorizontal: 16, marginBottom: 12, fontSize: 15,
  },
  grid: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: "#1a1a1a", borderRadius: 12, padding: 12 },
  imgPlaceholder: {
    backgroundColor: "#2a2a2a", borderRadius: 8, height: 120,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  imgEmoji: { fontSize: 48 },
  brand: { color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  name: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 2 },
  price: { color: "#22c55e", fontSize: 16, fontWeight: "bold", marginTop: 4 },
  tryBadge: {
    backgroundColor: "#7c3aed", borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 3, alignSelf: "flex-start", marginTop: 6,
  },
  tryText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  empty: { color: "#555", textAlign: "center", marginTop: 48, fontSize: 15 },
});
