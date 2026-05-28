import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  ScrollView, Modal, Pressable, Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { api, clearSession } from "../lib/api";
import type { Product, MeResponse } from "../lib/types";
import { useWishlist } from "../context/WishlistContext";

type Gender = "All" | "Men" | "Women" | "Children";
type SortMode = "relevance" | "price_asc" | "price_desc" | "new_arrivals";
type ChipItem = { label: string; matches: string[] | null };

const GENDERS: Gender[] = ["All", "Men", "Women", "Children"];

const GENDER_CHIPS: Record<Exclude<Gender, "All">, ChipItem[]> = {
  Men: [
    { label: "Shirts", matches: ["Shirts"] },
    { label: "T-Shirts", matches: ["T-Shirts"] },
    { label: "Jeans", matches: ["Jeans"] },
    { label: "Trousers", matches: ["Trousers"] },
    { label: "Shorts", matches: ["Shorts"] },
    { label: "Ethnic Wear", matches: ["Ethnic"] },
    { label: "Jackets", matches: ["Jackets"] },
    { label: "Footwear", matches: ["Footwear"] },
    { label: "Accessories", matches: ["Accessories"] },
  ],
  Women: [
    { label: "Tops", matches: ["T-Shirts", "Shirts"] },
    { label: "Dresses", matches: ["Dresses"] },
    { label: "Kurtis & Suits", matches: ["Kurta"] },
    { label: "Ethnic", matches: ["Ethnic"] },
    { label: "Jeans", matches: ["Jeans"] },
    { label: "Jackets", matches: ["Jackets"] },
    { label: "Footwear", matches: ["Footwear"] },
    { label: "Accessories", matches: ["Accessories"] },
  ],
  Children: [
    { label: "Tops", matches: ["T-Shirts", "Shirts"] },
    { label: "Bottoms", matches: ["Jeans", "Trousers"] },
    { label: "Ethnic", matches: ["Kurta", "Ethnic"] },
    { label: "Footwear", matches: ["Footwear"] },
  ],
};

const ALL_FLAT_CHIPS: ChipItem[] = [
  "Shirts", "T-Shirts", "Jeans", "Trousers", "Kurta",
  "Dresses", "Ethnic", "Jackets", "Footwear", "Accessories",
].map((c) => ({ label: c, matches: [c] }));

const CATEGORY_COLORS: Record<string, string> = {
  Shirts: "#dbeafe",
  "T-Shirts": "#ede9fe",
  Jeans: "#bfdbfe",
  Trousers: "#d1fae5",
  Kurta: "#fef3c7",
  Dresses: "#fce7f3",
  Ethnic: "#f3e8ff",
  Jackets: "#e2e8f0",
  Footwear: "#fef9c3",
  Accessories: "#ccfbf1",
};

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
  { key: "new_arrivals", label: "New Arrivals" },
];

const ALL_CHIP: ChipItem = { label: "All", matches: null };

function isProductAvailable(product: Product): boolean {
  if (!product.skus.length) return false;
  return product.skus.some((s) => s.available === true);
}

export default function HomeScreen() {
  const [pinnedWarehouseId, setPinnedWarehouseId] = useState<string | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<Gender>("All");
  const [activeCategoryLabel, setActiveCategoryLabel] = useState("All");
  const [sort, setSort] = useState<SortMode>("relevance");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [locating, setLocating] = useState(false);

  const { isWishlisted, add: addToWishlist, remove: removeFromWishlist } = useWishlist();

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const meRes = await api.get<MeResponse>("/api/me");
      const wid = meRes.data.user.pinnedWarehouseId;
      setPinnedWarehouseId(wid);
      const url = wid ? `/api/catalog?warehouseId=${wid}` : "/api/catalog";
      const res = await api.get<Product[]>(url);
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

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const handleGenderChange = useCallback((g: Gender) => {
    setGender(g);
    setActiveCategoryLabel("All");
  }, []);

  const chipList = useMemo((): ChipItem[] => {
    const base = gender === "All" ? ALL_FLAT_CHIPS : GENDER_CHIPS[gender];
    return [ALL_CHIP, ...base];
  }, [gender]);

  const activeCategoryMatches = useMemo(() => {
    if (activeCategoryLabel === "All") return null;
    return chipList.find((c) => c.label === activeCategoryLabel)?.matches ?? null;
  }, [activeCategoryLabel, chipList]);

  const filtered = useMemo(() => {
    let result = products;

    if (gender !== "All") {
      result = result.filter((p) => p.gender === gender || p.gender === "Unisex");
    }

    if (activeCategoryMatches !== null) {
      result = result.filter((p) => activeCategoryMatches.includes(p.category));
    }

    if (query) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      );
    }

    switch (sort) {
      case "price_asc": return [...result].sort((a, b) => a.price - b.price);
      case "price_desc": return [...result].sort((a, b) => b.price - a.price);
      default: return result;
    }
  }, [products, gender, activeCategoryMatches, query, sort]);

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
        Alert.alert("Not available yet", "Delivery is not available at your location. Try entering an address manually.");
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
    return <View style={s.center}><ActivityIndicator size="large" color="#6d28d9" /></View>;
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#6d28d9" /></View>;
  }

  const activeSortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? "Sort";

  return (
    <View style={s.container}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor="#6d28d9" />}
        ListHeaderComponent={
          <View>
            {pinnedWarehouseId === null && (
              <TouchableOpacity style={s.locationBanner} onPress={useCurrentLocation} disabled={locating}>
                <Text style={s.locationBannerText}>
                  {locating ? "Getting location…" : "📍 Set your location to order"}
                </Text>
              </TouchableOpacity>
            )}
            <Text style={s.heading}>Discover</Text>
            <TextInput
              style={s.search}
              placeholder="Search clothes, brands..."
              placeholderTextColor="#aaa"
              value={query}
              onChangeText={setQuery}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[s.genderPill, gender === g && s.genderPillActive]}
                  onPress={() => handleGenderChange(g)}
                >
                  <Text style={[s.genderPillText, gender === g && s.genderPillTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {chipList.map((c) => (
                <TouchableOpacity
                  key={c.label}
                  style={[s.chip, activeCategoryLabel === c.label && s.chipActive]}
                  onPress={() => setActiveCategoryLabel(c.label)}
                >
                  <Text style={[s.chipText, activeCategoryLabel === c.label && s.chipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={s.sortRow}>
              <Text style={s.resultCount}>{filtered.length} items</Text>
              <TouchableOpacity style={s.sortBtn} onPress={() => setSortSheetOpen(true)}>
                <Text style={s.sortBtnText}>↕  {activeSortLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          error
            ? <Text style={s.empty}>Could not load products. Pull down to retry.</Text>
            : <Text style={s.empty}>No products found.</Text>
        }
        renderItem={({ item }) => {
          const bgColor = CATEGORY_COLORS[item.category] ?? "#f3f4f6";
          const displayPrice = item.price / 100;
          const mrp = Math.round(displayPrice * 1.25);
          const discount = Math.round(((mrp - displayPrice) / mrp) * 100);
          const available = isProductAvailable(item);
          const wishlisted = isWishlisted(item.id);

          return (
            <TouchableOpacity
              style={[s.card, !available && s.cardUnavailable]}
              onPress={() => available ? router.push(`/product/${item.id}`) : undefined}
              activeOpacity={available ? 0.85 : 1}
            >
              <View style={[s.imgBlock, { backgroundColor: bgColor }]}>
                <Text style={s.imgEmoji}>👕</Text>
                {item.isTryable && available && (
                  <View style={s.tryBadge}><Text style={s.tryText}>Try</Text></View>
                )}
                {!available && (
                  <View style={s.unavailableOverlay}>
                    <Text style={s.unavailableText}>
                      {pinnedWarehouseId ? "Out of stock\nnearby" : "Not available\nat your location"}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.heartBtn}
                  onPress={() => wishlisted ? removeFromWishlist(item.id) : addToWishlist(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.heartIcon}>{wishlisted ? "❤️" : "🤍"}</Text>
                </TouchableOpacity>
              </View>
              <View style={s.cardBody}>
                <Text style={[s.brand, !available && s.textMuted]} numberOfLines={1}>{item.brand}</Text>
                <Text style={[s.name, !available && s.textMuted]} numberOfLines={2}>{item.name}</Text>
                {available && (
                  <View style={s.priceRow}>
                    <Text style={s.price}>₹{displayPrice.toFixed(0)}</Text>
                    <Text style={s.mrp}>₹{mrp.toFixed(0)}</Text>
                    <Text style={s.discountPct}>{discount}% off</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <Pressable style={s.sheetOverlay} onPress={() => setSortSheetOpen(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Sort by</Text>
          {SORT_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={s.sheetOption}
              onPress={() => { setSort(o.key); setSortSheetOpen(false); }}
            >
              <Text style={[s.sheetOptionText, sort === o.key && s.sheetOptionTextActive]}>{o.label}</Text>
              {sort === o.key && <View style={s.sheetDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 6 },
  android: { elevation: 2 },
  default: {},
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9ff" },
  center: { flex: 1, backgroundColor: "#f8f9ff", alignItems: "center", justifyContent: "center" },

  locationBanner: {
    backgroundColor: "#ede9fe", borderRadius: 12, padding: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4, alignItems: "center",
  },
  locationBannerText: { color: "#5300b7", fontWeight: "600", fontSize: 14 },

  cardUnavailable: { opacity: 0.7 },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableText: {
    color: "#fff", fontSize: 11, fontWeight: "700",
    textAlign: "center", letterSpacing: 0.5,
  },
  heartBtn: {
    position: "absolute", top: 6, right: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 14, width: 28, height: 28,
    alignItems: "center", justifyContent: "center",
  },
  heartIcon: { fontSize: 14 },
  textMuted: { color: "#aaa" },

  heading: {
    fontSize: 28, fontWeight: "800", color: "#0b1c30",
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, letterSpacing: -0.5,
  },
  search: {
    backgroundColor: "#ffffff", color: "#0b1c30", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 16, marginBottom: 16,
    fontSize: 14, borderWidth: 1.5, borderColor: "#ccc3d7",
    ...(shadow as object),
  },

  pillRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  genderPill: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "#ffffff", borderWidth: 1.5, borderColor: "#ccc3d7",
  },
  genderPillActive: { backgroundColor: "#0b1c30", borderColor: "#0b1c30" },
  genderPillText: { color: "#4a4455", fontSize: 14, fontWeight: "600" },
  genderPillTextActive: { color: "#fff" },

  chipRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#ccc3d7",
  },
  chipActive: { backgroundColor: "#6d28d9", borderColor: "#6d28d9" },
  chipText: { color: "#4a4455", fontSize: 13 },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  sortRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 14,
  },
  resultCount: { color: "#7b7486", fontSize: 13 },
  sortBtn: {
    backgroundColor: "#ffffff", paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: "#ccc3d7",
  },
  sortBtnText: { color: "#4a4455", fontSize: 13, fontWeight: "500" },

  grid: { paddingHorizontal: 12, paddingBottom: 32 },
  row: { gap: 12, marginBottom: 12 },

  card: {
    flex: 1, backgroundColor: "#ffffff", borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: "#e5eeff", ...(shadow as object),
  },
  imgBlock: { height: 172, alignItems: "center", justifyContent: "center" },
  imgEmoji: { fontSize: 52 },
  tryBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "#6d28d9", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  tryText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  cardBody: { padding: 10 },
  brand: { color: "#7b7486", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  name: { color: "#0b1c30", fontSize: 13, fontWeight: "700", lineHeight: 18, marginBottom: 6 },
  priceRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
  price: { color: "#0b1c30", fontSize: 15, fontWeight: "800" },
  mrp: { color: "#ccc3d7", fontSize: 12, textDecorationLine: "line-through" },
  discountPct: { color: "#15803d", fontSize: 12, fontWeight: "600" },

  empty: { color: "#7b7486", textAlign: "center", marginTop: 48, fontSize: 15, paddingHorizontal: 16 },

  sheetOverlay: { flex: 1, backgroundColor: "rgba(11,28,48,0.35)" },
  sheet: {
    backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 48,
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: "#ccc3d7", borderRadius: 2,
    alignSelf: "center", marginBottom: 20,
  },
  sheetTitle: { color: "#0b1c30", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  sheetOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5eeff",
  },
  sheetOptionText: { color: "#7b7486", fontSize: 15 },
  sheetOptionTextActive: { color: "#0b1c30", fontWeight: "700" },
  sheetDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: "#6d28d9",
  },
});
