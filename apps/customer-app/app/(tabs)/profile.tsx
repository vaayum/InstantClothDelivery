import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, TextInput, Alert, RefreshControl, Modal,
} from "react-native";
import MapView, { Marker, type Region, type MapPressEvent } from "react-native-maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
    latitude: 19.076, longitude: 72.8777, latitudeDelta: 0.05, longitudeDelta: 0.05,
  });
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

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
        Alert.alert("Permission denied", "Location permission is required to use this feature.");
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
    if (!label) {
      Alert.alert("Required", "Please enter a label for this address.");
      return;
    }
    if (!pickedCoords) {
      Alert.alert("Required", "Please pick a location on the map.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/addresses", {
        label,
        formattedAddress: pickedAddress || `${pickedCoords.lat.toFixed(5)}, ${pickedCoords.lng.toFixed(5)}`,
        lat: pickedCoords.lat,
        lng: pickedCoords.lng,
      });
      setLabel("");
      setPickedCoords(null);
      setPickedAddress("");
      setShowForm(false);
      await loadAddresses();
    } catch {
      Alert.alert("Error", "Could not save address.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await clearSession();
    router.replace("/login");
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAddresses(true)} tintColor="#fff" />}
    >
      <Text style={s.heading}>Profile</Text>

      <View style={s.card}>
        <Text style={s.cardLabel}>Phone</Text>
        <Text style={s.phone}>{phone ?? "—"}</Text>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Saved Addresses</Text>
          <TouchableOpacity onPress={() => setShowForm((v) => !v)}>
            <Text style={s.addBtn}>{showForm ? "Cancel" : "+ Add"}</Text>
          </TouchableOpacity>
        </View>

        {showForm && (
          <View style={s.form}>
            <TextInput
              style={s.input}
              placeholder="Label (e.g. Home, Work)"
              placeholderTextColor="#555"
              value={label}
              onChangeText={setLabel}
            />

            <TouchableOpacity style={s.mapPickerBtn} onPress={() => setShowMap(true)}>
              <Text style={s.mapPickerIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.mapPickerTitle}>{pickedCoords ? "Location picked" : "Pick on Map"}</Text>
                {pickedAddress ? (
                  <Text style={s.mapPickerAddr} numberOfLines={2}>{pickedAddress}</Text>
                ) : (
                  <Text style={s.mapPickerHint}>Tap to open map</Text>
                )}
              </View>
              {pickedCoords && <Text style={s.mapPickerCheck}>✓</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.saveBtn, (!label || !pickedCoords) && { opacity: 0.5 }]}
              onPress={saveAddress}
              disabled={saving || !label || !pickedCoords}
            >
              {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>Save Address</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Map picker modal */}
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
              {pickedAddress ? (
                <Text style={s.modalAddr} numberOfLines={2}>{pickedAddress}</Text>
              ) : (
                <Text style={s.modalHint}>Tap anywhere on the map to set your location</Text>
              )}
              <TouchableOpacity style={s.locateBtn} onPress={useCurrentLocation} disabled={locating}>
                {locating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.locateBtnText}>Use my location</Text>}
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
            <Text style={s.addrLabel}>{addr.label}</Text>
            <Text style={s.addrText}>{addr.formattedAddress}</Text>
            {addr.isSafeDrop && <Text style={s.safeDrop}>Safe Drop ✓</Text>}
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
  scroll: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, marginBottom: 20 },
  cardLabel: { color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  phone: { color: "#fff", fontSize: 18, fontWeight: "600" },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  addBtn: { color: "#3b82f6", fontSize: 15, fontWeight: "600" },
  form: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { backgroundColor: "#2a2a2a", color: "#fff", borderRadius: 8, padding: 12, marginBottom: 10, fontSize: 14 },
  saveBtn: { backgroundColor: "#fff", borderRadius: 10, padding: 14, alignItems: "center" },
  saveBtnText: { color: "#000", fontWeight: "bold" },
  addrCard: { backgroundColor: "#1a1a1a", borderRadius: 10, padding: 14, marginBottom: 10 },
  addrLabel: { color: "#fff", fontWeight: "600", marginBottom: 2 },
  addrText: { color: "#aaa", fontSize: 13 },
  safeDrop: { color: "#22c55e", fontSize: 12, marginTop: 4 },
  empty: { color: "#555", fontSize: 14 },
  logoutBtn: { borderWidth: 1, borderColor: "#333", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  logoutText: { color: "#888", fontSize: 15 },
  mapPickerBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#2a2a2a", borderRadius: 10, padding: 14, marginBottom: 10, gap: 10 },
  mapPickerIcon: { fontSize: 22 },
  mapPickerTitle: { color: "#fff", fontWeight: "600", fontSize: 14 },
  mapPickerAddr: { color: "#aaa", fontSize: 12, marginTop: 2 },
  mapPickerHint: { color: "#555", fontSize: 12, marginTop: 2 },
  mapPickerCheck: { color: "#22c55e", fontSize: 18, fontWeight: "bold" },
  modalContainer: { flex: 1, backgroundColor: "#0a0a0a" },
  modalMap: { flex: 1 },
  modalBottom: { backgroundColor: "#1a1a1a", padding: 20, paddingBottom: 36 },
  modalAddr: { color: "#fff", fontSize: 14, marginBottom: 12 },
  modalHint: { color: "#555", fontSize: 14, marginBottom: 12, textAlign: "center" },
  locateBtn: { backgroundColor: "#3b82f6", borderRadius: 10, padding: 12, alignItems: "center", marginBottom: 12 },
  locateBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 10 },
  modalCancel: { flex: 1, borderWidth: 1, borderColor: "#333", borderRadius: 10, padding: 14, alignItems: "center" },
  modalCancelText: { color: "#888", fontWeight: "600" },
  modalConfirm: { flex: 2, backgroundColor: "#fff", borderRadius: 10, padding: 14, alignItems: "center" },
  modalConfirmText: { color: "#000", fontWeight: "bold" },
});
