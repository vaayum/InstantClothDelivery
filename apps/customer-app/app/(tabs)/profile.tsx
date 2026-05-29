import { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, TextInput, Alert, RefreshControl, Modal,
} from "react-native";
import MapView, { Marker, type Region, type MapPressEvent } from "react-native-maps";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCart } from "../context/CartContext";
import { api, clearSession } from "../lib/api";
import type { Address, MeResponse } from "../lib/types";
import { T } from "../lib/theme";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

export default function ProfileScreen() {
  const [phone, setPhone] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickedAddress, setPickedAddress] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { clearCart } = useCart();
  const [settingPrimary, setSettingPrimary] = useState<string | null>(null);
  const [primaryAddressId, setPrimaryAddressId] = useState<string | null>(null);
  const initialFocusDone = useRef(false);

  const loadAddresses = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [addrRes, meRes] = await Promise.all([
        api.get<Address[]>("/api/addresses"),
        api.get<MeResponse>("/api/me"),
      ]);
      setAddresses(addrRes.data);
      setPrimaryAddressId(meRes.data.user.primaryAddressId);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const p = await AsyncStorage.getItem("customer_phone");
      setPhone(p);
      await loadAddresses();
      setLoading(false);
    }
    init();
  }, [loadAddresses]);

  useFocusEffect(useCallback(() => {
    if (!initialFocusDone.current) { initialFocusDone.current = true; return; }
    loadAddresses();
  }, [loadAddresses]));

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
      setMapRegion((r) => ({ ...r, latitude, longitude }));
      setPickedCoords({ lat: latitude, lng: longitude });
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results[0]) {
        const r = results[0];
        setPickedAddress([r.name, r.street, r.district, r.city, r.region].filter(Boolean).join(", "));
      }
      setShowMap(false);
    } catch {
      Alert.alert("Error", "Could not get location.");
    } finally {
      setLocating(false);
    }
  }

  async function handleMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPickedCoords({ lat: latitude, lng: longitude });
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (results[0]) {
        const r = results[0];
        setPickedAddress([r.name, r.street, r.district, r.city, r.region].filter(Boolean).join(", "));
      }
    } catch {
      setPickedAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }
  }

  async function saveAddress() {
    if (!label) { Alert.alert("Required", "Please enter a label (e.g. Home, Work)."); return; }
    if (!pickedCoords) { Alert.alert("Required", "Please pick a location on the map."); return; }
    setSaving(true);
    try {
      await api.post("/api/addresses", {
        label,
        formattedAddress: pickedAddress || `${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`,
        lat: pickedCoords.lat,
        lng: pickedCoords.lng,
      });
      setLabel(""); setPickedCoords(null); setPickedAddress(""); setShowForm(false);
      await loadAddresses();
    } catch {
      Alert.alert("Error", "Could not save address.");
    } finally {
      setSaving(false);
    }
  }

  async function setPrimary(addressId: string) {
    setSettingPrimary(addressId);
    try {
      const res = await api.post<{ warehouseChanged: boolean; deliveryAvailable: boolean }>(
        `/api/addresses/${addressId}/set-primary`
      );
      setPrimaryAddressId(addressId);
      if (!res.data.deliveryAvailable) {
        Alert.alert("No delivery here", "No warehouse serves this area yet. We'll notify you when we expand.");
      } else if (res.data.warehouseChanged) {
        clearCart();
        Alert.alert("Location updated", "Cart cleared — your new location is set.");
      } else {
        Alert.alert("Location set", "Delivering to this address.");
      }
      await loadAddresses();
    } catch {
      Alert.alert("Error", "Could not update delivery address.");
    } finally {
      setSettingPrimary(null);
    }
  }

  async function logout() {
    await clearSession();
    router.replace("/login");
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={T.pink} /></View>;
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadAddresses(true)} tintColor={T.pink} />
      }
    >
      {/* Dark hero */}
      <View style={s.hero}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{phone ? phone.slice(-2) : "?"}</Text>
        </View>
        <Text style={s.heroPhone}>{phone ?? "Guest"}</Text>
        <Text style={s.heroSub}>ThreadDash Member</Text>
      </View>

      {/* Saved Addresses */}
      <View style={s.card}>
        <View style={s.cardTitleRow}>
          <Text style={s.cardTitle}>SAVED ADDRESSES</Text>
          <TouchableOpacity onPress={() => setShowForm((v) => !v)}>
            <Text style={s.addLink}>{showForm ? "Cancel" : "+ Add New"}</Text>
          </TouchableOpacity>
        </View>

        {showForm && (
          <View style={s.form}>
            <Text style={s.inputLabel}>LABEL</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Home, Work, Gym"
              placeholderTextColor={T.gray}
              value={label}
              onChangeText={setLabel}
            />
            <TouchableOpacity style={s.mapPickerBtn} onPress={() => setShowMap(true)}>
              <Text style={s.mapPickerIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.mapPickerTitle}>
                  {pickedCoords ? "Location selected" : "Pick on Map"}
                </Text>
                {pickedAddress ? (
                  <Text style={s.mapPickerAddr} numberOfLines={2}>{pickedAddress}</Text>
                ) : (
                  <Text style={s.mapPickerHint}>Tap to open map and pin your location</Text>
                )}
              </View>
              {pickedCoords && <Text style={s.checkmark}>✓</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, (!label || !pickedCoords || saving) && s.saveBtnDisabled]}
              onPress={saveAddress}
              disabled={saving || !label || !pickedCoords}
            >
              {saving
                ? <ActivityIndicator color={T.white} />
                : <Text style={s.saveBtnText}>Save Address</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Map modal */}
        <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
          <View style={s.modalContainer}>
            <MapView
              style={s.modalMap}
              region={mapRegion}
              onRegionChangeComplete={setMapRegion}
              onPress={handleMapPress}
            >
              {pickedCoords && (
                <Marker coordinate={{ latitude: pickedCoords.lat, longitude: pickedCoords.lng }} />
              )}
            </MapView>
            <View style={s.modalBottom}>
              {pickedAddress
                ? <Text style={s.modalAddr} numberOfLines={2}>{pickedAddress}</Text>
                : <Text style={s.modalHint}>Tap anywhere on the map to pin your location</Text>}
              <TouchableOpacity style={s.locateBtn} onPress={useCurrentLocation} disabled={locating}>
                {locating
                  ? <ActivityIndicator color={T.white} size="small" />
                  : <Text style={s.locateBtnText}>Use my location</Text>}
              </TouchableOpacity>
              <View style={s.modalActions}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setShowMap(false)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.modalConfirm, !pickedCoords && { opacity: 0.4 }]}
                  onPress={() => pickedCoords && setShowMap(false)}
                  disabled={!pickedCoords}
                >
                  <Text style={s.modalConfirmText}>Confirm Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {addresses.length === 0 && !showForm && (
          <Text style={s.emptyAddr}>No saved addresses yet.</Text>
        )}

        {addresses.map((addr) => {
          const isPrimary = addr.id === primaryAddressId;
          return (
            <View key={addr.id} style={[s.addrRow, isPrimary && s.addrRowPrimary]}>
              <View style={s.addrContent}>
                <View style={s.addrTitleRow}>
                  <View style={s.addrTypeTag}>
                    <Text style={s.addrTypeText}>{addr.label.toUpperCase()}</Text>
                  </View>
                  {isPrimary && (
                    <View style={s.primaryTag}><Text style={s.primaryTagText}>DELIVERING HERE</Text></View>
                  )}
                  {addr.isSafeDrop && (
                    <View style={s.safeDropTag}><Text style={s.safeDropText}>Safe Drop</Text></View>
                  )}
                </View>
                <Text style={s.addrText} numberOfLines={2}>{addr.formattedAddress}</Text>
              </View>
              {!isPrimary && (
                <TouchableOpacity
                  style={s.deliverBtn}
                  onPress={() => setPrimary(addr.id)}
                  disabled={settingPrimary === addr.id}
                >
                  {settingPrimary === addr.id
                    ? <ActivityIndicator size="small" color={T.pink} />
                    : <Text style={s.deliverBtnText}>Deliver here</Text>}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* Account menu */}
      <View style={s.card}>
        <Text style={s.cardTitle}>ACCOUNT</Text>
        {([
          { iconName: "receipt-outline", label: "My Orders", onPress: () => router.push("/(tabs)/orders") },
          { iconName: "heart-outline", label: "My Wishlist", onPress: () => router.push("/(tabs)/wishlist") },
          { iconName: "chatbubble-outline", label: "Help & Support", onPress: () => {} },
        ] as Array<{ iconName: ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }>).map((item) => (
          <TouchableOpacity key={item.label} style={s.menuRow} onPress={item.onPress}>
            <Ionicons name={item.iconName} size={22} color={T.mid} style={s.menuIcon} />
            <Text style={s.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={T.gray} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutText}>LOGOUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.lightBg },
  content: { paddingBottom: 48 },
  center: { flex: 1, backgroundColor: T.white, alignItems: "center", justifyContent: "center" },

  hero: { backgroundColor: T.dark, paddingTop: 48, paddingBottom: 28, alignItems: "center" },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: T.pink, alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarText: { color: T.white, fontSize: 22, fontFamily: T.font.bold },
  heroPhone: { color: T.white, fontSize: 18, fontFamily: T.font.bold },
  heroSub: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4, letterSpacing: 0.5, fontFamily: T.font.regular },

  card: { backgroundColor: T.white, marginTop: 8, padding: 16 },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  cardTitle: { fontSize: 12, fontFamily: T.font.bold, color: T.dark, letterSpacing: 0.8 },
  addLink: { color: T.pink, fontSize: 13, fontFamily: T.font.semi },

  form: {
    backgroundColor: T.lightBg, borderRadius: T.radiusMd, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: T.border,
  },
  inputLabel: { fontSize: 10, fontFamily: T.font.bold, color: T.dark, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" },
  input: {
    backgroundColor: T.white, borderWidth: 1, borderColor: T.border,
    borderRadius: T.radius, padding: 12, marginBottom: 12, fontSize: 14, color: T.dark, fontFamily: T.font.regular,
  },
  mapPickerBtn: {
    flexDirection: "row", alignItems: "center", backgroundColor: T.white,
    borderRadius: T.radius, padding: 12, marginBottom: 12, gap: 10,
    borderWidth: 1, borderColor: T.border,
  },
  mapPickerIcon: { fontSize: 18 },
  mapPickerTitle: { color: T.dark, fontFamily: T.font.semi, fontSize: 13 },
  mapPickerAddr: { color: T.mid, fontSize: 12, marginTop: 2, fontFamily: T.font.regular },
  mapPickerHint: { color: T.gray, fontSize: 12, marginTop: 2, fontFamily: T.font.regular },
  checkmark: { color: T.green, fontSize: 18, fontWeight: T.bold },
  saveBtn: { backgroundColor: T.pink, borderRadius: T.radius, padding: 12, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: T.white, fontFamily: T.font.bold, fontSize: 14 },

  emptyAddr: { color: T.gray, fontSize: 13, paddingVertical: 8 },

  addrRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  addrRowPrimary: { borderLeftWidth: 3, borderLeftColor: T.pink, paddingLeft: 10 },
  addrContent: { flex: 1 },
  addrTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  addrTypeTag: { backgroundColor: T.lightBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 },
  addrTypeText: { fontSize: 10, fontFamily: T.font.bold, color: T.mid },
  primaryTag: { backgroundColor: T.pinkLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 },
  primaryTagText: { fontSize: 10, fontFamily: T.font.bold, color: T.pink },
  safeDropTag: { backgroundColor: "#E8F7F4", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 },
  safeDropText: { color: T.green, fontSize: 10, fontFamily: T.font.bold },
  addrText: { fontSize: 13, color: T.mid, lineHeight: 18, fontFamily: T.font.regular },
  deliverBtn: {
    marginTop: 8, alignSelf: "flex-start",
    borderWidth: 1, borderColor: T.pink, borderRadius: T.radius, paddingHorizontal: 12, paddingVertical: 6,
  },
  deliverBtnText: { color: T.pink, fontSize: 12, fontFamily: T.font.semi },

  menuRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  menuIcon: { marginRight: 14 },
  menuLabel: { flex: 1, fontSize: 14, color: T.dark, fontFamily: T.font.regular },

  logoutBtn: { margin: 16, borderWidth: 1, borderColor: T.border, padding: 14, alignItems: "center", borderRadius: T.radius },
  logoutText: { color: T.mid, fontSize: 13, fontFamily: T.font.bold, letterSpacing: 1 },

  modalContainer: { flex: 1, backgroundColor: T.lightBg },
  modalMap: { flex: 1 },
  modalBottom: { backgroundColor: T.white, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderTopColor: T.border },
  modalAddr: { color: T.dark, fontSize: 14, marginBottom: 12, fontFamily: T.font.semi },
  modalHint: { color: T.gray, fontSize: 14, marginBottom: 12, textAlign: "center", fontFamily: T.font.regular },
  locateBtn: { backgroundColor: T.pink, borderRadius: T.radius, padding: 12, alignItems: "center", marginBottom: 12 },
  locateBtnText: { color: T.white, fontFamily: T.font.bold, fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: T.radius, padding: 14, alignItems: "center" },
  modalCancelText: { color: T.mid, fontFamily: T.font.semi },
  modalConfirm: { flex: 2, backgroundColor: T.pink, borderRadius: T.radius, padding: 14, alignItems: "center" },
  modalConfirmText: { color: T.white, fontFamily: T.font.bold },
});
