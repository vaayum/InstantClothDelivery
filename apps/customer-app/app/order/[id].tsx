import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { router, useLocalSearchParams } from "expo-router";
import { api, clearSession } from "../lib/api";
import { useOrderSocket } from "../hooks/useSocket";
import type { Order, OrderStatus } from "../lib/types";

const TIMELINE: OrderStatus[] = [
  "PENDING", "WAREHOUSE_PROCESSING", "READY_FOR_PICKUP",
  "AGENT_ASSIGNED", "AGENT_EN_ROUTE", "ARRIVED",
  "TRIAL_IN_PROGRESS", "COMPLETED",
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Order Placed",
  WAREHOUSE_PROCESSING: "Packing Your Order",
  READY_FOR_PICKUP: "Ready for Pickup",
  AGENT_ASSIGNED: "Agent Assigned",
  AGENT_EN_ROUTE: "On the Way",
  ARRIVED: "Agent Arrived",
  TRIAL_IN_PROGRESS: "30-Min Trial",
  COMPLETED: "Delivered",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
};

function TrialCountdown({ seconds }: { seconds: number }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgent = seconds < 300;
  return (
    <View style={s.trialBox}>
      <Text style={s.trialLabel}>Trial window closing in</Text>
      <Text style={[s.trialTimer, urgent && { color: "#ef4444" }]}>
        {mins}:{secs.toString().padStart(2, "0")}
      </Text>
      <Text style={s.trialNote}>Keep what you love — agent collects the rest</Text>
    </View>
  );
}

export default function OrderTrackingScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const { status: socketStatus, agentLocation, trialSecondsRemaining } = useOrderSocket(orderId ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<Order>(`/api/orders/${orderId}`);
      setOrder(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Merge socket status into order state
  useEffect(() => {
    if (socketStatus && order && socketStatus !== order.status) {
      setOrder((prev) => prev ? { ...prev, status: socketStatus } : prev);
    }
  }, [socketStatus, order]);

  async function cancelOrder() {
    Alert.alert("Cancel Order", "Are you sure you want to cancel?", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel Order", style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await api.post(`/api/orders/${orderId}/cancel`);
            await load();
          } catch {
            Alert.alert("Error", "Could not cancel order.");
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }
  if (!order) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{error ? "Could not load order." : "Order not found."}</Text>
        {error && (
          <TouchableOpacity style={s.retryBtn} onPress={load}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const currentStatus = socketStatus ?? order.status;
  const currentIdx = TIMELINE.indexOf(currentStatus);
  const isCancelled = currentStatus === "CANCELLED";
  const canCancel = currentStatus === "PENDING" || currentStatus === "AGENT_ASSIGNED";
  const showMap = (currentStatus === "AGENT_EN_ROUTE" || currentStatus === "ARRIVED") && agentLocation;

  // Trial countdown: prefer socket value, fallback to computing from trialEndsAt
  let trialSeconds = trialSecondsRemaining;
  if (trialSeconds === null && order.trialEndsAt) {
    trialSeconds = Math.max(0, Math.floor((new Date(order.trialEndsAt).getTime() - Date.now()) / 1000));
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Status header */}
      <View style={s.statusHeader}>
        <Text style={s.statusLabel}>{STATUS_LABELS[currentStatus] ?? currentStatus}</Text>
        <Text style={s.orderId}>#{orderId?.slice(-8).toUpperCase()}</Text>
      </View>

      {/* Agent map */}
      {showMap && agentLocation && (
        <MapView
          style={s.map}
          region={{
            latitude: agentLocation.lat,
            longitude: agentLocation.lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <Marker
            coordinate={{ latitude: agentLocation.lat, longitude: agentLocation.lng }}
            title="Your delivery agent"
          />
        </MapView>
      )}

      {/* Trial countdown */}
      {currentStatus === "TRIAL_IN_PROGRESS" && trialSeconds !== null && (
        <TrialCountdown seconds={trialSeconds} />
      )}

      {/* Status timeline */}
      {!isCancelled && (
        <View style={s.timeline}>
          {TIMELINE.filter((s) => !(s === "TRIAL_IN_PROGRESS" && !order.isTryOrder)).map((step, idx) => {
            const isCompleted = currentStatus === "COMPLETED";
            const done = isCompleted ? idx <= currentIdx : idx < currentIdx;
            const active = !isCompleted && idx === currentIdx;
            return (
              <View key={step} style={s.timelineRow}>
                <View style={s.timelineLeft}>
                  <View style={[
                    s.dot,
                    done && s.dotDone,
                    active && s.dotActive,
                  ]} />
                  {idx < TIMELINE.filter((s) => !(s === "TRIAL_IN_PROGRESS" && !order.isTryOrder)).length - 1 && (
                    <View style={[s.line, done && s.lineDone]} />
                  )}
                </View>
                <Text style={[
                  s.timelineLabel,
                  done && s.timelineDone,
                  active && s.timelineActive,
                ]}>
                  {STATUS_LABELS[step]}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {isCancelled && (
        <View style={s.cancelledBox}>
          <Text style={s.cancelledText}>This order has been cancelled.</Text>
        </View>
      )}

      {/* Order summary */}
      <View style={s.card}>
        <Text style={s.cardLabel}>Order Summary</Text>
        {order.items.map((item) => (
          <View key={item.id} style={s.itemRow}>
            <Text style={s.itemName}>{item.productName}</Text>
            <Text style={s.itemMeta}>{item.size} · ₹{(item.price / 100).toFixed(0)} × {item.quantity}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalValue}>₹{((order.totalAmount + order.deliveryFee) / 100).toFixed(0)}</Text>
        </View>
        {order.deliveryFee > 0 && (
          <Text style={s.feeNote}>Includes ₹{(order.deliveryFee / 100).toFixed(0)} delivery fee</Text>
        )}
        {order.isTryOrder && <Text style={s.tryNote}>Try Before You Keep order</Text>}
      </View>

      {/* Cancel button */}
      {canCancel && (
        <TouchableOpacity style={s.cancelBtn} onPress={cancelOrder} disabled={cancelling}>
          {cancelling
            ? <ActivityIndicator color="#ef4444" />
            : <Text style={s.cancelBtnText}>Cancel Order</Text>
          }
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0a0a0a" },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" },
  statusHeader: { marginBottom: 20 },
  statusLabel: { color: "#fff", fontSize: 26, fontWeight: "bold" },
  orderId: { color: "#555", fontSize: 13, marginTop: 2 },
  map: { height: 220, borderRadius: 12, marginBottom: 16, overflow: "hidden" },
  trialBox: { backgroundColor: "#1a0a2e", borderRadius: 12, padding: 20, marginBottom: 16, alignItems: "center" },
  trialLabel: { color: "#a78bfa", fontSize: 13, marginBottom: 4 },
  trialTimer: { color: "#fff", fontSize: 48, fontWeight: "bold", fontVariant: ["tabular-nums"] },
  trialNote: { color: "#7c3aed", fontSize: 12, marginTop: 8, textAlign: "center" },
  timeline: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 20, marginBottom: 16 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", minHeight: 40 },
  timelineLeft: { alignItems: "center", width: 24, marginRight: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#333", borderWidth: 2, borderColor: "#444" },
  dotDone: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  dotActive: { backgroundColor: "#3b82f6", borderColor: "#3b82f6" },
  line: { width: 2, flex: 1, backgroundColor: "#2a2a2a", minHeight: 24, marginVertical: 2 },
  lineDone: { backgroundColor: "#22c55e" },
  timelineLabel: { color: "#555", fontSize: 14, paddingTop: 0, lineHeight: 16 },
  timelineDone: { color: "#aaa" },
  timelineActive: { color: "#fff", fontWeight: "bold" },
  cancelledBox: { backgroundColor: "#1a0a0a", borderRadius: 12, padding: 20, marginBottom: 16, alignItems: "center" },
  cancelledText: { color: "#ef4444", fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardLabel: { color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  itemName: { color: "#fff", fontSize: 14 },
  itemMeta: { color: "#888", fontSize: 13 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  totalLabel: { color: "#aaa", fontSize: 15 },
  totalValue: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  feeNote: { color: "#555", fontSize: 12, marginTop: 4 },
  tryNote: { color: "#7c3aed", fontSize: 12, marginTop: 4 },
  cancelBtn: { borderWidth: 1, borderColor: "#ef4444", borderRadius: 12, padding: 16, alignItems: "center" },
  cancelBtnText: { color: "#ef4444", fontWeight: "600", fontSize: 15 },
  errorText: { color: "#ef4444", fontSize: 16, marginBottom: 16 },
  retryBtn: { borderWidth: 1, borderColor: "#555", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: "#ccc", fontSize: 15 },
});
