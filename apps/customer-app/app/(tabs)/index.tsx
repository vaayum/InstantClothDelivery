import { useState, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, RefreshControl, Alert,
  Modal, Pressable, Platform, ScrollView,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { api, clearSession } from "../lib/api";
import type { Product, MeResponse } from "../lib/types";
import { useWishlist } from "../context/WishlistContext";
import { T } from "../lib/theme";

type Gender = "All" | "Men" | "Women" | "Children";
type SortMode = "relevance" | "price_asc" | "price_desc" | "new_arrivals";
type ChipItem = { label: string; matches: string[] | null };
type SheetType = "sort" | "gender" | "category" | null;

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

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "price_asc", label: "Price: Low to High" },
  { key: "price_desc", label: "Price: High to Low" },
  { key: "new_arrivals", label: "New Arrivals" },
];

const ALL_CHIP: ChipItem = { label: "All", matches: null };

const BANNERS = [
  { id: "1", label: "UP TO 70% OFF", sub: "Best of Fashion", bg: T.pink, textColor: T.white },
  { id: "2", label: "NEW ARRIVALS",  sub: "Fresh Styles Daily", bg: T.dark, textColor: T.white },
  { id: "3", label: "TRENDY PICKS",  sub: "Curated For You", bg: "#1a1a2e", textColor: T.pink },
];

function PromoBanner() {
  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={pb.scroll}
      contentContainerStyle={pb.content}
    >
      {BANNERS.map((b) => (
        <View key={b.id} style={[pb.banner, { backgroundColor: b.bg }]}>
          <Text style={[pb.label, { color: b.textColor }]}>{b.label}</Text>
          <Text style={[pb.sub, { color: b.textColor }]}>{b.sub}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const pb = StyleSheet.create({
  scroll:   { marginBottom: 8 },
  content:  { paddingHorizontal: 12 },
  banner:   { width: 320, height: 130, marginHorizontal: 4, borderRadius: T.radiusMd, alignItems: "center", justifyContent: "center", padding: 20 },
  label:    { fontFamily: T.font.bold, fontSize: 22, letterSpacing: 1 },
  sub:      { fontFamily: T.font.regular, fontSize: 13, marginTop: 4, opacity: 0.85 },
});

const BRANDS = [
  { id: "1", name: "Nike",   initial: "N", bg: "#000000" },
  { id: "2", name: "Zara",   initial: "Z", bg: "#2d2d2d" },
  { id: "3", name: "H&M",    initial: "H", bg: "#e50010" },
  { id: "4", name: "Puma",   initial: "P", bg: "#e60012" },
  { id: "5", name: "Adidas", initial: "A", bg: "#000000" },
  { id: "6", name: "Levis",  initial: "L", bg: "#c8102e" },
  { id: "7", name: "Tommy",  initial: "T", bg: "#003087" },
  { id: "8", name: "Arrow",  initial: "A", bg: "#1a1a1a" },
];

function BrandStories() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={bs.content}
      style={bs.scroll}
    >
      {BRANDS.map((b) => (
        <View key={b.id} style={bs.item}>
          <View style={[bs.circle, { backgroundColor: b.bg }]}>
            <Text style={bs.initial}>{b.initial}</Text>
          </View>
          <Text style={bs.name}>{b.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
const bs = StyleSheet.create({
  scroll:   { backgroundColor: T.white, marginBottom: 8 },
  content:  { paddingHorizontal: 12, paddingVertical: 8 },
  item:     { alignItems: "center", marginHorizontal: 8 },
  circle:   { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: T.pink },
  initial:  { color: T.white, fontFamily: T.font.bold, fontSize: 18 },
  name:     { fontSize: 10, color: T.dark, fontFamily: T.font.regular, marginTop: 4 },
});

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
  const [openSheet, setOpenSheet] = useState<SheetType>(null);
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
    setOpenSheet(null);
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
    if (gender !== "All") result = result.filter((p) => p.gender === gender || p.gender === "Unisex");
    if (activeCategoryMatches !== null) result = result.filter((p) => activeCategoryMatches.includes(p.category));
    if (query) {
      const q = query.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
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
      if (status !== "granted") { Alert.alert("Permission denied", "Location permission is required."); return; }
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
    } catch { Alert.alert("Error", "Could not get location. Please try again."); }
    finally { setLocating(false); }
  }

  if (pinnedWarehouseId === undefined || loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={T.pink} /></View>;
  }

  const hasGenderFilter = gender !== "All";
  const hasCategoryFilter = activeCategoryLabel !== "All";
  const hasSortFilter = sort !== "relevance";

  return (
    <View style={s.container}>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.grid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={T.pink} />}
        ListHeaderComponent={
          <View>
            <View style={s.appBar}>
              <Text style={s.appBarBrand}>myntra</Text>
              <View style={s.appBarRight}>
                <Ionicons name="notifications-outline" size={22} color={T.dark} style={s.notifIcon} />
                <Ionicons name="person-outline" size={22} color={T.dark} />
              </View>
            </View>
            <View style={s.searchBar}>
              <Ionicons name="search" size={16} color={T.gray} style={{ marginRight: 8 }} />
              <TextInput
                style={s.searchInput}
                placeholder="Search for brands, clothes..."
                placeholderTextColor={T.gray}
                value={query}
                onChangeText={setQuery}
              />
            </View>
            {pinnedWarehouseId === null && (
              <TouchableOpacity style={s.locationBanner} onPress={useCurrentLocation} disabled={locating}>
                <View style={s.locationBannerRow}>
                  <Ionicons name="location-outline" size={14} color={T.pinkDark} />
                  <Text style={s.locationBannerText}>
                    {locating ? "Getting location…" : "Set location to check delivery"}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            <PromoBanner />
            <BrandStories />
            <View style={s.resultRow}>
              <Text style={s.resultCount}>{filtered.length} items</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          error
            ? <Text style={s.empty}>Could not load products. Pull down to retry.</Text>
            : <Text style={s.empty}>No products found.</Text>
        }
        renderItem={({ item }) => {
          const displayPrice = item.price / 100;
          const mrp = Math.round(displayPrice * 1.25);
          const discount = Math.round(((mrp - displayPrice) / mrp) * 100);
          const available = isProductAvailable(item);
          const wishlisted = isWishlisted(item.id);

          return (
            <TouchableOpacity
              style={s.card}
              onPress={() => available ? router.push(`/product/${item.id}`) : undefined}
              activeOpacity={available ? 0.9 : 1}
            >
              <View style={s.imgBlock}>
                <Text style={s.imgEmoji}>👕</Text>
                {item.isTryable && available && (
                  <View style={s.tryBadge}><Text style={s.tryText}>TRY</Text></View>
                )}
                {!available && (
                  <View style={s.unavailableOverlay}>
                    <Text style={s.unavailableText}>
                      {pinnedWarehouseId ? "Out of\nstock" : "Set\nlocation"}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.heartBtn}
                  onPress={() => wishlisted ? removeFromWishlist(item.id) : addToWishlist(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={wishlisted ? "heart" : "heart-outline"}
                    size={20}
                    color={wishlisted ? T.pink : T.mid}
                  />
                </TouchableOpacity>
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardBrand} numberOfLines={1}>{item.brand}</Text>
                <Text style={[s.cardName, !available && s.textMuted]} numberOfLines={2}>{item.name}</Text>
                {available ? (
                  <View style={s.priceRow}>
                    <Text style={s.price}>₹{displayPrice.toFixed(0)}</Text>
                    <Text style={s.mrp}>₹{mrp.toFixed(0)}</Text>
                    <Text style={s.off}>{discount}% off</Text>
                  </View>
                ) : (
                  <Text style={s.textMuted}>Not available</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Bottom filter toolbar */}
      <View style={s.toolbar}>
        <TouchableOpacity style={[s.toolBtn, hasSortFilter && s.toolBtnActive]} onPress={() => setOpenSheet("sort")}>
          <View style={s.sortBtnInner}>
            <Ionicons name="swap-vertical" size={13} color={sort !== "relevance" ? T.pink : T.dark} />
            <Text style={[s.toolBtnText, sort !== "relevance" && s.toolBtnTextActive]}>Sort</Text>
          </View>
        </TouchableOpacity>
        <View style={s.toolDivider} />
        <TouchableOpacity style={[s.toolBtn, hasGenderFilter && s.toolBtnActive]} onPress={() => setOpenSheet("gender")}>
          <Text style={[s.toolBtnText, hasGenderFilter && s.toolBtnTextActive]}>
            {hasGenderFilter ? gender : "Gender"}
          </Text>
        </TouchableOpacity>
        <View style={s.toolDivider} />
        <TouchableOpacity style={[s.toolBtn, hasCategoryFilter && s.toolBtnActive]} onPress={() => setOpenSheet("category")}>
          <Text style={[s.toolBtnText, hasCategoryFilter && s.toolBtnTextActive]}>
            {hasCategoryFilter ? activeCategoryLabel : "Category"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sort sheet */}
      <Modal visible={openSheet === "sort"} transparent animationType="slide" onRequestClose={() => setOpenSheet(null)}>
        <Pressable style={s.overlay} onPress={() => setOpenSheet(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>SORT BY</Text>
          {SORT_OPTIONS.map((o) => (
            <TouchableOpacity key={o.key} style={s.sheetRow} onPress={() => { setSort(o.key); setOpenSheet(null); }}>
              <Text style={[s.sheetRowText, sort === o.key && s.sheetRowActive]}>{o.label}</Text>
              {sort === o.key && <View style={s.sheetDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Gender sheet */}
      <Modal visible={openSheet === "gender"} transparent animationType="slide" onRequestClose={() => setOpenSheet(null)}>
        <Pressable style={s.overlay} onPress={() => setOpenSheet(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>GENDER</Text>
          {GENDERS.map((g) => (
            <TouchableOpacity key={g} style={s.sheetRow} onPress={() => handleGenderChange(g)}>
              <Text style={[s.sheetRowText, gender === g && s.sheetRowActive]}>{g}</Text>
              {gender === g && <View style={s.sheetDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* Category sheet */}
      <Modal visible={openSheet === "category"} transparent animationType="slide" onRequestClose={() => setOpenSheet(null)}>
        <Pressable style={s.overlay} onPress={() => setOpenSheet(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>CATEGORY</Text>
          <ScrollView>
            {chipList.map((c) => (
              <TouchableOpacity key={c.label} style={s.sheetRow} onPress={() => { setActiveCategoryLabel(c.label); setOpenSheet(null); }}>
                <Text style={[s.sheetRowText, activeCategoryLabel === c.label && s.sheetRowActive]}>{c.label}</Text>
                {activeCategoryLabel === c.label && <View style={s.sheetDot} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.lightBg },
  center: { flex: 1, backgroundColor: T.white, alignItems: "center", justifyContent: "center" },

  locationBanner: {
    backgroundColor: T.pinkLight, paddingVertical: 10, alignItems: "center",
  },
  locationBannerText: {
    color: T.pinkDark, fontFamily: T.font.semi, fontSize: 13,
  },
  locationBannerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sortBtnInner: { flexDirection: "row", alignItems: "center", gap: 4 },
  notifIcon: { marginRight: 14 },

  appBar: {
    backgroundColor: T.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  appBarBrand: {
    fontSize: 26,
    fontFamily: T.font.bold,
    color: T.pink,
    letterSpacing: -0.5,
  },
  appBarRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.lightBg,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: T.radius,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: T.dark,
    fontFamily: T.font.regular,
  },

  resultRow: {
    backgroundColor: T.white, paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 1,
  },
  resultCount: {
    fontSize: 12,
    color: T.gray,
    fontFamily: T.font.regular,
  },

  grid: { paddingHorizontal: 0, paddingBottom: 100 },
  row: { gap: 1, marginBottom: 1 },

  card: { flex: 1, backgroundColor: T.white },
  imgBlock: { height: 220, alignItems: "center", justifyContent: "center", backgroundColor: T.lightBg },
  imgEmoji: { fontSize: 64 },
  tryBadge: {
    position: "absolute", top: 8, left: 8,
    backgroundColor: T.green, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2,
  },
  tryText: { color: T.white, fontSize: 9, fontFamily: T.font.bold, letterSpacing: 0.5 },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  unavailableText: { color: T.white, fontSize: 12, fontFamily: T.font.bold, textAlign: "center" },
  heartBtn: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 20,
    width: 32, height: 32, alignItems: "center", justifyContent: "center",
  },

  cardBody: { padding: 8, paddingBottom: 12 },
  cardBrand: {
    fontSize: 11, color: T.dark, textTransform: "uppercase", letterSpacing: 0.5,
    fontFamily: T.font.bold,
    marginBottom: 2,
  },
  cardName: {
    fontSize: 13, color: T.mid, lineHeight: 18, marginBottom: 4,
    fontFamily: T.font.regular,
  },
  textMuted: { color: T.gray },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  price: {
    fontSize: 14, color: T.dark,
    fontFamily: T.font.bold,
  },
  mrp: {
    fontSize: 12, color: T.gray, textDecorationLine: "line-through",
    fontFamily: T.font.regular,
  },
  off: {
    fontSize: 12, color: T.green,
    fontFamily: T.font.semi,
  },

  empty: { color: T.gray, textAlign: "center", marginTop: 48, fontSize: 15, paddingHorizontal: 16 },

  toolbar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", backgroundColor: T.white,
    borderTopWidth: 1, borderTopColor: T.border,
    height: 48,
  },
  toolBtn: { flex: 1, justifyContent: "center", alignItems: "center" },
  toolBtnActive: { borderBottomWidth: 2, borderBottomColor: T.pink },
  toolBtnText: {
    fontSize: 13, color: T.dark,
    fontFamily: T.font.semi,
  },
  toolBtnTextActive: { color: T.pink },
  toolDivider: { width: 1, backgroundColor: T.border, marginVertical: 10 },

  overlay: { flex: 1, backgroundColor: "rgba(40,44,63,0.4)" },
  sheet: {
    backgroundColor: T.white, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 48, maxHeight: "60%",
  },
  sheetHandle: { width: 32, height: 3, backgroundColor: T.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetTitle: {
    fontSize: 13, color: T.dark, letterSpacing: 1, marginBottom: 8,
    fontFamily: T.font.bold,
  },
  sheetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  sheetRowText: {
    fontSize: 15, color: T.dark,
    fontFamily: T.font.regular,
  },
  sheetRowActive: {
    color: T.pink,
    fontFamily: T.font.bold,
  },
  sheetDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.pink },
});
