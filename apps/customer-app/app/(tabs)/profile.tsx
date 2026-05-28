import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, TextInput, Alert, RefreshControl, Modal,
} from "react-native";
import MapView, { Marker, type Region, type MapPressEvent } from "react-native-maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCart } from "../context/CartContext";
import { api, clearSession } from "../lib/api";
import type { Address } from "../lib/types";

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

  const loadAddresses = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get<Address[]>("/api/addresses");
      setAddresses(res.data);
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
      if (res.data.warehouseChanged) {
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
    return <View style={s.center}><ActivityIndicator size="large" color="#6d28d9" /></View>;
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => loadAddresses(true)} tintColor="#6d28d9" />
      }
    >
      <Text style={s.heading}>Profile</Text>

      {/* Account card */}
      <View style={s.profileCard}>
        <View style={s.avatarCircle}>
          <Text style={s.avatarInitial}>{phone ? phone.slice(-2) : "??"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.phoneLabel}>REGISTERED ACCOUNT</Text>
          <Text style={s.phone}>{phone ?? "—"}</Text>
        </View>
      </View>

      {/* Addresses */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Saved Addresses</Text>
          <TouchableOpacity onPress={() => setShowForm((v) => !v)}>
            <Text style={s.addBtn}>{showForm ? "Cancel" : "+ Add New"}</Text>
          </TouchableOpacity>
        </View>

        {showForm && (
          <View style={s.form}>
            <Text style={s.inputLabel}>LABEL</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Home, Work, Gym"
              placeholderTextColor="#7b7486"
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
                ? <ActivityIndicator color="#fff" />
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
                  ? <ActivityIndicator color="#fff" size="small" />
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
          <Text style={s.empty}>No saved addresses yet.</Text>
        )}

        {addresses.map((addr) => (
          <View key={addr.id} style={s.addrCard}>
            <View style={s.addrRow}>
              <View style={{ flex: 1 }}>
                <View style={s.addrLabelRow}>
                  <Text style={s.addrLabel}>{addr.label}</Text>
                  {addr.isSafeDrop && (
                    <View style={s.safeDropBadge}>
                      <Text style={s.safeDropText}>Safe Drop</Text>
                    </View>
                  )}
                </View>
                <Text style={s.addrText} numberOfLines={2}>{addr.formattedAddress}</Text>
              </View>
              <TouchableOpacity
                style={s.deliverBtn}
                onPress={() => setPrimary(addr.id)}
                disabled={settingPrimary === addr.id}
              >
                {settingPrimary === addr.id
                  ? <ActivityIndicator size="small" color="#6d28d9" />
                  : <Text style={s.deliverBtnText}>Deliver here</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f8f9ff" },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: "#f8f9ff", alignItems: "center", justifyContent: "center" },

  heading: { fontSize: 28, fontWeight: "700", color: "#0b1c30", marginBottom: 20 },

  profileCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5eeff",
  },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "#ede9fe",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 16, fontWeight: "700", color: "#5300b7" },
  phoneLabel: {
    fontSize: 10, fontWeight: "700", color: "#7b7486",
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  phone: { fontSize: 17, fontWeight: "600", color: "#0b1c30", marginTop: 2 },

  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0b1c30" },
  addBtn: { color: "#6d28d9", fontSize: 14, fontWeight: "700" },

  form: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5eeff",
  },
  inputLabel: {
    fontSize: 10, fontWeight: "700", color: "#5300b7",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6,
  },
  input: {
    backgroundColor: "#f8f9ff",
    borderWidth: 1.5,
    borderColor: "#ccc3d7",
    color: "#0b1c30",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  mapPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff4ff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d3e4fe",
  },
  mapPickerIcon: { fontSize: 20 },
  mapPickerTitle: { color: "#0b1c30", fontWeight: "600", fontSize: 14 },
  mapPickerAddr: { color: "#4a4455", fontSize: 12, marginTop: 2 },
  mapPickerHint: { color: "#7b7486", fontSize: 12, marginTop: 2 },
  checkmark: { color: "#15803d", fontSize: 18, fontWeight: "700" },
  saveBtn: { backgroundColor: "#6d28d9", borderRadius: 10, padding: 14, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },

  addrCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5eeff",
  },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  addrLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  addrLabel: { color: "#0b1c30", fontWeight: "700", fontSize: 14 },
  safeDropBadge: { backgroundColor: "#dcfce7", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  safeDropText: { color: "#15803d", fontSize: 10, fontWeight: "700" },
  addrText: { color: "#7b7486", fontSize: 13, lineHeight: 18 },
  deliverBtn: { backgroundColor: "#ede9fe", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  deliverBtnText: { color: "#6d28d9", fontSize: 12, fontWeight: "700" },

  empty: { color: "#7b7486", fontSize: 14 },

  logoutBtn: {
    borderWidth: 1.5, borderColor: "#ccc3d7",
    borderRadius: 12, padding: 16, alignItems: "center", marginTop: 4,
  },
  logoutText: { color: "#7b7486", fontSize: 15, fontWeight: "600" },

  modalContainer: { flex: 1, backgroundColor: "#f8f9ff" },
  modalMap: { flex: 1 },
  modalBottom: {
    backgroundColor: "#ffffff",
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "#e5eeff",
  },
  modalAddr: { color: "#0b1c30", fontSize: 14, marginBottom: 12, fontWeight: "500" },
  modalHint: { color: "#7b7486", fontSize: 14, marginBottom: 12, textAlign: "center" },
  locateBtn: {
    backgroundColor: "#6d28d9", borderRadius: 10,
    padding: 12, alignItems: "center", marginBottom: 12,
  },
  locateBtnText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalCancel: {
    flex: 1, borderWidth: 1.5, borderColor: "#ccc3d7",
    borderRadius: 10, padding: 14, alignItems: "center",
  },
  modalCancelText: { color: "#7b7486", fontWeight: "600" },
  modalConfirm: { flex: 2, backgroundColor: "#6d28d9", borderRadius: 10, padding: 14, alignItems: "center" },
  modalConfirmText: { color: "#ffffff", fontWeight: "700" },
});
