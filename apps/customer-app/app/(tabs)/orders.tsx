import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, RefreshControl,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { api } from "../lib/api";
import type { Order, OrderStatus } from "../lib/types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Placed",
  WAREHOUSE_PROCESSING: "Packing",
  READY_FOR_PICKUP: "Ready for Pickup",
  AGENT_ASSIGNED: "Agent Assigned",
  AGENT_EN_ROUTE: "On the Way",
  ARRIVED: "Agent Arrived",
  TRIAL_IN_PROGRESS: "Trial in Progress",
  DELIVERED: "Delivered",
  PARTIALLY_DELIVERED: "Partially Delivered",
  RETURNED: "Returned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
};

const STATUS_PILL: Partial<Record<OrderStatus, { bg: string; text: string }>> = {
  COMPLETED:            { bg: "#dcfce7", text: "#15803d" },
  DELIVERED:            { bg: "#dcfce7", text: "#15803d" },
  PARTIALLY_DELIVERED:  { bg: "#fef9c3", text: "#a16207" },
  RETURNED:             { bg: "#f3f4f6", text: "#4b5563" },
  CANCELLED:            { bg: "#fee2e2", text: "#b91c1c" },
  TRIAL_IN_PROGRESS:    { bg: "#ede9fe", text: "#7c3aed" },
  AGENT_EN_ROUTE:       { bg: "#dbeafe", text: "#1d4ed8" },
  ARRIVED:              { bg: "#fef9c3", text: "#a16207" },
  RESCHEDULED:          { bg: "#fce7f3", text: "#9d174d" },
};

function StatusPill({ status }: { status: OrderStatus }) {
  const pill = STATUS_PILL[status] ?? { bg: "#e5eeff", text: "#4a4455" };
  return (
    <View style={[sp.pill, { backgroundColor: pill.bg }]}>
      <Text style={[sp.label, { color: pill.text }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
});

function OrderCard({ order }: { order: Order }) {
  const total = ((order.totalAmount + order.deliveryFee) / 100).toFixed(0);
  const preview = order.items.slice(0, 2).map((i) => i.productName).join(", ");
  const extra = order.items.length > 2 ? ` +${order.items.length - 2}` : "";
  const date = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.8}
    >
      <View style={s.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.orderId}>#{order.id.slice(-8).toUpperCase()}</Text>
          <Text style={s.date}>{date}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <StatusPill status={order.status} />
          {order.isTryOrder && (
            <View style={s.tryBadge}>
              <Text style={s.tryBadgeText}>Try &amp; Keep</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={s.items} numberOfLines={1}>
        {preview}{extra}
      </Text>

      <View style={s.cardFooter}>
        <Text style={s.amount}>₹{total}</Text>
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

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#6d28d9" size="large" />
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
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchOrders(true); }}
          tintColor="#6d28d9"
        />
      }
      ListHeaderComponent={
        <View style={s.headingBlock}>
          <Text style={s.heading}>Order History</Text>
          <Text style={s.headingSubtitle}>Track your active trials and past orders</Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={s.empty}>
          {error ?? "No orders yet. Browse and place your first order!"}
        </Text>
      }
      ItemSeparatorComponent={() => <View style={s.sep} />}
    />
  );
}

const s = StyleSheet.create({
  list: { flex: 1, backgroundColor: "#f8f9ff" },
  listContent: { padding: 20, paddingBottom: 40 },
  emptyContainer: { flex: 1, padding: 20 },
  center: { flex: 1, backgroundColor: "#f8f9ff", justifyContent: "center", alignItems: "center" },

  headingBlock: { marginBottom: 20 },
  heading: { fontSize: 28, fontWeight: "700", color: "#0b1c30" },
  headingSubtitle: { fontSize: 13, color: "#7b7486", marginTop: 4 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#e5eeff",
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  orderId: { fontSize: 14, fontWeight: "700", color: "#0b1c30" },
  date: { fontSize: 12, color: "#7b7486", marginTop: 2 },

  tryBadge: { backgroundColor: "#ede9fe", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tryBadgeText: { color: "#7c3aed", fontSize: 10, fontWeight: "700" },

  items: { color: "#4a4455", fontSize: 13, marginBottom: 12 },
  cardFooter: { flexDirection: "row", alignItems: "center" },
  amount: { color: "#0b1c30", fontWeight: "700", fontSize: 15, flex: 1 },
  arrow: { color: "#6d28d9", fontSize: 16, fontWeight: "700" },

  sep: { height: 10 },
  empty: { color: "#7b7486", textAlign: "center", marginTop: 60, fontSize: 15, lineHeight: 22 },
});
