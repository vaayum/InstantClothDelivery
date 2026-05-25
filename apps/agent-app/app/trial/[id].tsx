import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, clearSession } from "../lib/api";
import type { AssignmentWithOrder, OrderItem } from "../lib/types";

type ItemDecision = "KEEP" | "RETURN";

export default function TrialScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<AssignmentWithOrder>(`/api/agents/assignments/${orderId}`);
      const orderItems = res.data.order?.items ?? [];
      setItems(orderItems);
      const initial: Record<string, ItemDecision> = {};
      for (const item of orderItems) {
        initial[item.skuId] = item.status === "KEPT" ? "KEEP" : "RETURN";
      }
      setDecisions(initial);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  function toggle(skuId: string) {
    setDecisions((prev) => ({ ...prev, [skuId]: prev[skuId] === "KEEP" ? "RETURN" : "KEEP" }));
  }

  async function submit() {
    const keptSkuIds = items.filter((i) => decisions[i.skuId] === "KEEP").map((i) => i.skuId);
    const returnedSkuIds = items.filter((i) => decisions[i.skuId] === "RETURN").map((i) => i.skuId);

    Alert.alert(
      "Confirm Trial",
      `Keeping ${keptSkuIds.length} item(s), returning ${returnedSkuIds.length} item(s).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setSubmitting(true);
            try {
              await api.post(`/api/orders/${orderId}/trial/complete`, { keptSkuIds, returnedSkuIds });
              router.replace("/(tabs)");
            } catch {
              Alert.alert("Error", "Could not complete trial. Try again.");
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Could not load items.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={load}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const keptCount = Object.values(decisions).filter((d) => d === "KEEP").length;

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <Text style={s.heading}>Trial Items</Text>
        <Text style={s.sub}>Toggle each item the customer wants to keep.</Text>

        {items.map((item) => {
          const keeping = decisions[item.skuId] === "KEEP";
          return (
            <TouchableOpacity
              key={item.id}
              style={[s.itemCard, keeping && s.itemCardKept]}
              onPress={() => toggle(item.skuId)}
              activeOpacity={0.7}
            >
              <View style={s.itemInfo}>
                <Text style={s.itemName}>{item.productName}</Text>
                <Text style={s.itemMeta}>{item.size} · ₹{(item.price / 100).toFixed(0)} × {item.quantity}</Text>
              </View>
              <View style={[s.badge, keeping ? s.badgeKeep : s.badgeReturn]}>
                <Text style={s.badgeText}>{keeping ? "KEEP" : "RETURN"}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <Text style={s.summary}>{keptCount} of {items.length} items kept</Text>
        <TouchableOpacity
          style={[s.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#000" />
            : <Text style={s.submitText}>Complete Trial</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 8 },
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  errorText: { color: "#888", fontSize: 16, marginBottom: 16 },
  retryBtn: { borderWidth: 1, borderColor: "#555", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: "#ccc", fontSize: 15 },
  heading: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  sub: { color: "#888", fontSize: 14, marginBottom: 24 },
  itemCard: {
    backgroundColor: "#1e1e1e", borderRadius: 12, padding: 16,
    marginBottom: 12, flexDirection: "row", alignItems: "center",
    borderWidth: 2, borderColor: "transparent",
  },
  itemCardKept: { borderColor: "#22c55e" },
  itemInfo: { flex: 1 },
  itemName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  itemMeta: { color: "#888", fontSize: 13, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  badgeKeep: { backgroundColor: "#22c55e" },
  badgeReturn: { backgroundColor: "#374151" },
  badgeText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  footer: {
    backgroundColor: "#1a1a1a", padding: 24, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: "#2a2a2a",
  },
  summary: { color: "#888", fontSize: 14, textAlign: "center", marginBottom: 12 },
  submitBtn: {
    backgroundColor: "#fff", borderRadius: 12,
    padding: 18, alignItems: "center",
  },
  submitText: { color: "#000", fontWeight: "bold", fontSize: 16 },
});
