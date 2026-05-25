import { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../lib/api";
import type { Order, OrderStatus } from "../lib/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Placed",
  WAREHOUSE_PROCESSING: "Packing",
  READY_FOR_PICKUP: "Ready",
  AGENT_ASSIGNED: "Agent Assigned",
  AGENT_EN_ROUTE: "On the Way",
  ARRIVED: "Agent Arrived",
  TRIAL_IN_PROGRESS: "Trial in Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
};

const STATUS_COLORS: Partial<Record<OrderStatus, string>> = {
  COMPLETED: "#22c55e",
  CANCELLED: "#ef4444",
  TRIAL_IN_PROGRESS: "#7c3aed",
  AGENT_EN_ROUTE: "#3b82f6",
  ARRIVED: "#f59e0b",
};

export default function OrdersScreen() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("last_order_id").then((id) => {
      if (id) { setOrderId(id); fetchOrder(id); }
    });
  }, []);

  async function fetchOrder(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<Order>(`/api/orders/${id.trim()}`);
      setOrder(res.data);
      await AsyncStorage.setItem("last_order_id", id.trim());
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404) Alert.alert("Not found", "No order with that ID.");
      else Alert.alert("Error", "Could not fetch order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <Text style={s.heading}>My Orders</Text>

      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          placeholder="Paste order ID..."
          placeholderTextColor="#555"
          value={orderId}
          onChangeText={setOrderId}
          autoCapitalize="none"
        />
        <TouchableOpacity style={s.goBtn} onPress={() => fetchOrder(orderId)} disabled={loading}>
          <Text style={s.goBtnText}>Track</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />}

      {order && (
        <TouchableOpacity style={s.card} onPress={() => router.push(`/order/${order.id}`)}>
          <Text style={s.cardLabel}>Order</Text>
          <Text style={s.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
          <View style={s.statusRow}>
            <Text style={[s.status, { color: STATUS_COLORS[order.status] ?? "#aaa" }]}>
              {STATUS_LABELS[order.status]}
            </Text>
          </View>
          <Text style={s.amount}>
            ₹{((order.totalAmount + order.deliveryFee) / 100).toFixed(0)} · {order.items.length} item(s)
          </Text>
          {order.isTryOrder && <Text style={s.tryNote}>Try Before You Keep</Text>}
          <Text style={s.tap}>Tap for live tracking →</Text>
        </TouchableOpacity>
      )}

      {!order && !loading && (
        <Text style={s.empty}>Enter an order ID above to track your delivery.</Text>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 20 },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  searchRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  input: {
    flex: 1, backgroundColor: "#1a1a1a", color: "#fff",
    borderRadius: 10, padding: 14, fontSize: 14,
  },
  goBtn: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 20, justifyContent: "center" },
  goBtnText: { color: "#000", fontWeight: "bold" },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 20 },
  cardLabel: { color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  orderId: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  statusRow: { marginBottom: 8 },
  status: { fontSize: 15, fontWeight: "600" },
  amount: { color: "#aaa", fontSize: 14, marginBottom: 4 },
  tryNote: { color: "#7c3aed", fontSize: 13, marginBottom: 4 },
  tap: { color: "#3b82f6", fontSize: 13, marginTop: 8 },
  empty: { color: "#555", textAlign: "center", marginTop: 48, fontSize: 15 },
});
