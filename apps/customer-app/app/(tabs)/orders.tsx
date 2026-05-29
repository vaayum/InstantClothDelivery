import { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, RefreshControl,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { api } from "../lib/api";
import type { Order, OrderStatus } from "../lib/types";
import { T } from "../lib/theme";
import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

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

const STATUS_CONFIG: Partial<Record<OrderStatus, { color: string; bg: string }>> = {
  COMPLETED:           { color: T.green, bg: T.greenLight },
  DELIVERED:           { color: T.green, bg: T.greenLight },
  PARTIALLY_DELIVERED: { color: T.orange, bg: "#FFF3E0" },
  RETURNED:            { color: T.gray, bg: T.lightBg },
  CANCELLED:           { color: "#FF0000", bg: "#FFF0F0" },
  TRIAL_IN_PROGRESS:   { color: T.pink, bg: T.pinkLight },
  AGENT_EN_ROUTE:      { color: "#1565C0", bg: "#E3F2FD" },
  ARRIVED:             { color: T.orange, bg: "#FFF3E0" },
  RESCHEDULED:         { color: T.mid, bg: T.lightBg },
};

function StatusIcon({ status }: { status: string }) {
  type IconName = ComponentProps<typeof Ionicons>["name"];
  const map: Record<string, { name: IconName; color: string }> = {
    COMPLETED:            { name: "checkmark-circle",  color: T.green },
    DELIVERED:            { name: "checkmark-circle",  color: T.green },
    PARTIALLY_DELIVERED:  { name: "alert-circle",      color: T.orange },
    RETURNED:             { name: "refresh-circle",    color: T.gray },
    CANCELLED:            { name: "close-circle",      color: T.red },
    PENDING:              { name: "time-outline",      color: T.gray },
    WAREHOUSE_PROCESSING: { name: "cube-outline",      color: T.mid },
    READY_FOR_PICKUP:     { name: "archive-outline",   color: T.mid },
    AGENT_ASSIGNED:       { name: "bicycle-outline",   color: T.orange },
    AGENT_EN_ROUTE:       { name: "bicycle-outline",   color: T.orange },
    ARRIVED:              { name: "location",          color: T.pink },
    TRIAL_IN_PROGRESS:    { name: "shirt-outline",     color: T.pink },
    RESCHEDULED:          { name: "calendar-outline",  color: T.mid },
  };
  const cfg = map[status] ?? { name: "ellipse-outline" as IconName, color: T.gray };
  return <Ionicons name={cfg.name} size={16} color={cfg.color} />;
}

function StatusPill({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { color: T.mid, bg: T.lightBg };
  return (
    <View style={[sp.pill, { backgroundColor: cfg.bg }]}>
      <StatusIcon status={status} />
      <Text style={[sp.text, { color: cfg.color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}
const sp = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 2, flexDirection: "row", alignItems: "center", gap: 4 },
  text: { fontSize: 11, letterSpacing: 0.2, fontFamily: T.font.bold },
});

function OrderCard({ order }: { order: Order }) {
  const total = ((order.totalAmount + order.deliveryFee) / 100).toFixed(0);
  const preview = order.items.slice(0, 2).map((i) => i.productName).join(", ");
  const extra = order.items.length > 2 ? ` +${order.items.length - 2} more` : "";
  const date = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push(`/order/${order.id}`)} activeOpacity={0.85}>
      <View style={s.cardTop}>
        <View style={s.imgPlaceholder}>
          <Text style={s.imgEmoji}>👕</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.itemNames} numberOfLines={2}>{preview}{extra}</Text>
          <Text style={s.orderMeta}>Order #{order.id.slice(-8).toUpperCase()} · {date}</Text>
          <Text style={s.amount}>₹{total}</Text>
        </View>
      </View>
      <View style={s.cardBottom}>
        <StatusPill status={order.status} />
        {order.isTryOrder && (
          <View style={s.tryTag}><Text style={s.tryTagText}>Try &amp; Keep</Text></View>
        )}
        <Text style={s.details}>Details →</Text>
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
    } catch { setError("Could not load orders. Pull down to retry."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={T.pink} size="large" /></View>;
  }

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={orders.length === 0 ? s.emptyContainer : s.listContent}
      data={orders}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OrderCard order={item} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchOrders(true); }}
          tintColor={T.pink}
        />
      }
      ListHeaderComponent={
        <View style={s.header}>
          <Text style={s.heading}>MY ORDERS</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={s.emptyBlock}>
          <Ionicons name="receipt-outline" size={56} color={T.mid} style={{ marginBottom: 16 }} />
          <Text style={s.emptyTitle}>No orders yet</Text>
          <Text style={s.emptySub}>{error ?? "Browse and place your first order!"}</Text>
          {!error && (
            <TouchableOpacity style={s.shopBtn} onPress={() => router.push("/(tabs)")}>
              <Text style={s.shopBtnText}>SHOP NOW</Text>
            </TouchableOpacity>
          )}
        </View>
      }
      ItemSeparatorComponent={() => <View style={s.sep} />}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.lightBg },
  listContent: { paddingBottom: 40 },
  emptyContainer: { flex: 1 },
  center: { flex: 1, backgroundColor: T.white, justifyContent: "center", alignItems: "center" },

  header: { backgroundColor: T.white, padding: 16, borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 1 },
  heading: { fontSize: 16, fontFamily: T.font.bold, color: T.dark, letterSpacing: 1 },

  card: { backgroundColor: T.white, padding: 16 },
  cardTop: { flexDirection: "row", gap: 12, marginBottom: 12 },
  imgPlaceholder: {
    width: 72, height: 88, backgroundColor: T.lightBg, borderRadius: T.radius,
    alignItems: "center", justifyContent: "center",
  },
  imgEmoji: { fontSize: 32 },
  cardInfo: { flex: 1, justifyContent: "center", gap: 4 },
  itemNames: { fontSize: 14, fontFamily: T.font.semi, color: T.dark, lineHeight: 20 },
  orderMeta: { fontSize: 12, color: T.gray, fontFamily: T.font.regular },
  amount: { fontSize: 14, fontFamily: T.font.bold, color: T.dark },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  tryTag: { backgroundColor: T.pinkLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2 },
  tryTagText: { color: T.pink, fontSize: 10, fontFamily: T.font.bold },
  details: { marginLeft: "auto", color: T.pink, fontSize: 12, fontFamily: T.font.semi },

  sep: { height: 1, backgroundColor: T.border },
  emptyBlock: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: T.font.bold, color: T.dark, marginBottom: 8 },
  emptySub: { fontSize: 14, color: T.gray, textAlign: "center", marginBottom: 24, fontFamily: T.font.regular },
  shopBtn: { backgroundColor: T.pink, paddingHorizontal: 32, paddingVertical: 12, borderRadius: T.radius },
  shopBtnText: { color: T.white, fontFamily: T.font.bold, letterSpacing: 1 },
});
