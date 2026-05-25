import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, TextInput, Alert, RefreshControl,
} from "react-native";
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
  const [form, setForm] = useState({ label: "", formattedAddress: "", lat: "", lng: "" });
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

  async function saveAddress() {
    if (!form.label || !form.formattedAddress) {
      Alert.alert("Required", "Label and address are required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/addresses", {
        label: form.label,
        formattedAddress: form.formattedAddress,
        lat: parseFloat(form.lat) || 0,
        lng: parseFloat(form.lng) || 0,
      });
      setForm({ label: "", formattedAddress: "", lat: "", lng: "" });
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
            <TextInput style={s.input} placeholder="Label (e.g. Home)" placeholderTextColor="#555" value={form.label} onChangeText={(v) => setForm((f) => ({ ...f, label: v }))} />
            <TextInput style={s.input} placeholder="Full address" placeholderTextColor="#555" value={form.formattedAddress} onChangeText={(v) => setForm((f) => ({ ...f, formattedAddress: v }))} />
            <TextInput style={s.input} placeholder="Latitude (optional)" placeholderTextColor="#555" value={form.lat} onChangeText={(v) => setForm((f) => ({ ...f, lat: v }))} keyboardType="numeric" />
            <TextInput style={s.input} placeholder="Longitude (optional)" placeholderTextColor="#555" value={form.lng} onChangeText={(v) => setForm((f) => ({ ...f, lng: v }))} keyboardType="numeric" />
            <TouchableOpacity style={s.saveBtn} onPress={saveAddress} disabled={saving}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>Save Address</Text>}
            </TouchableOpacity>
          </View>
        )}

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
});
