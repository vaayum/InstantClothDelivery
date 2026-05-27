import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { api, clearSession } from "../lib/api";
import type { Product, MeResponse } from "../lib/types";

export default function HomeScreen() {
  const [pinnedWarehouseId, setPinnedWarehouseId] = useState<string | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState(false);

  const checkPin = useCallback(async () => {
    try {
      const res = await api.get<MeResponse>("/api/me");
      setPinnedWarehouseId(res.data.user.pinnedWarehouseId);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPin();
    }, [checkPin])
  );

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

  useEffect(() => {
    if (pinnedWarehouseId) load();
  }, [pinnedWarehouseId, load]);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission is required.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const r = results[0];
      const formattedAddress = r
        ? [r.name, r.street, r.district, r.city, r.region].filter(Boolean).join(", ")
        : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

      const saveRes = await api.post<{ pinnedWarehouseId: string | null; deliveryAvailable: boolean }>(
        "/api/addresses",
        { label: "Home", formattedAddress, lat: latitude, lng: longitude }
      );

      if (!saveRes.data.deliveryAvailable) {
        Alert.alert(
          "Not available yet",
          "Delivery is not available at your location. Try entering an address manually."
        );
        return;
      }
      setPinnedWarehouseId(saveRes.data.pinnedWarehouseId);
    } catch {
      Alert.alert("Error", "Could not get location. Please try again.");
    } finally {
      setLocating(false);
    }
  }

  if (pinnedWarehouseId === undefined) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  if (pinnedWarehouseId === null) {
    return (
      <View style={s.gate}>
        <Text style={s.gateTitle}>Where should we deliver?</Text>
        <Text style={s.gateSub}>Set your location to see what's available near you.</Text>
        <TouchableOpacity style={s.gateBtn} onPress={useCurrentLocation} disabled={locating}>
          {locating
            ? <ActivityIndicator color="#000" />
            : <Text style={s.gateBtnText}>Use my location</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.gateSecondary} onPress={() => router.push("/(tabs)/profile")}>
          <Text style={s.gateSecondaryText}>Enter address manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  const filtered = products.filter((p) => {
    const q = query.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });

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
  gate: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center", padding: 32 },
  gateTitle: { color: "#fff", fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 12 },
  gateSub: { color: "#666", fontSize: 15, textAlign: "center", marginBottom: 32 },
  gateBtn: {
    backgroundColor: "#fff", borderRadius: 14, paddingVertical: 16,
    alignItems: "center", width: "100%", marginBottom: 12,
  },
  gateBtnText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  gateSecondary: { paddingVertical: 12 },
  gateSecondaryText: { color: "#3b82f6", fontSize: 15, fontWeight: "600" },
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
