import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { router } from "expo-router";
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

function OrderCard({ order }: { order: Order }) {
  const color = STATUS_COLORS[order.status] ?? "#aaa";
  const total = ((order.totalAmount + order.deliveryFee) / 100).toFixed(0);
  const preview = order.items
    .slice(0, 2)
    .map((i) => i.productName)
    .join(", ");
  const extra = order.items.length > 2 ? ` +${order.items.length - 2} more` : "";
  const date = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push(`/order/${order.id}`)}>
      <View style={s.cardHeader}>
        <Text style={s.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
        <Text style={s.date}>{date}</Text>
      </View>
      <Text style={[s.status, { color }]}>{STATUS_LABELS[order.status]}</Text>
      <Text style={s.items} numberOfLines={1}>
        {preview}{extra}
      </Text>
      <View style={s.cardFooter}>
        <Text style={s.amount}>₹{total}</Text>
        {order.isTryOrder && <Text style={s.tryBadge}>Try &amp; Keep</Text>}
        <Text style={s.arrow}>→</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.get<Order[]>("/api/orders");
      setOrders(res.data);
    } catch {
      setError("Could not load orders. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  function onRefresh() {
    setRefreshing(true);
    fetchOrders(true);
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={orders.length === 0 ? s.emptyContainer : s.listContent}
      data={orders}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OrderCard order={item} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />
      }
      ListHeaderComponent={<Text style={s.heading}>My Orders</Text>}
      ListEmptyComponent={
        error ? (
          <Text style={s.empty}>{error}</Text>
        ) : (
          <Text style={s.empty}>No orders yet. Place your first order!</Text>
        )
      }
      ItemSeparatorComponent={() => <View style={s.separator} />}
    />
  );
}

const s = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#0a0a0a" },
  listContent: { padding: 20, paddingBottom: 40 },
  emptyContainer: { flex: 1, padding: 20 },
  center: { flex: 1, backgroundColor: "#0a0a0a", justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 28, fontWeight: "bold", color: "#fff", marginBottom: 20 },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  orderId: { color: "#fff", fontSize: 16, fontWeight: "700" },
  date: { color: "#555", fontSize: 13 },
  status: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  items: { color: "#888", fontSize: 13, marginBottom: 10 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10 },
  amount: { color: "#fff", fontWeight: "600", fontSize: 15 },
  tryBadge: {
    backgroundColor: "#4c1d95", color: "#a78bfa",
    fontSize: 11, fontWeight: "600",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  arrow: { color: "#3b82f6", marginLeft: "auto" },
  separator: { height: 12 },
  empty: { color: "#555", textAlign: "center", marginTop: 60, fontSize: 15, lineHeight: 22 },
});
