import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { router, useLocalSearchParams } from "expo-router";
import { api, clearSession } from "../lib/api";
import { useOrderSocket, type TrialItemDecision } from "../hooks/useSocket";
import type { Order, OrderStatus } from "../lib/types";

const TIMELINE: OrderStatus[] = [
  "PENDING", "WAREHOUSE_PROCESSING", "READY_FOR_PICKUP",
  "AGENT_ASSIGNED", "AGENT_EN_ROUTE", "ARRIVED",
  "TRIAL_IN_PROGRESS", "DELIVERED",
];

const TERMINAL_DELIVERY: OrderStatus[] = ["DELIVERED", "PARTIALLY_DELIVERED", "RETURNED"];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Order Placed",
  WAREHOUSE_PROCESSING: "Packing Your Order",
  READY_FOR_PICKUP: "Ready for Pickup",
  AGENT_ASSIGNED: "Agent Assigned",
  AGENT_EN_ROUTE: "On the Way",
  ARRIVED: "Agent Arrived",
  TRIAL_IN_PROGRESS: "30-Min Trial",
  DELIVERED: "Delivered",
  PARTIALLY_DELIVERED: "Partially Delivered",
  RETURNED: "Items Returned",
  COMPLETED: "Delivered",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Rescheduled",
};

function TrialCountdown({ seconds: initialSeconds }: { seconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  // Resync from server broadcast when it diverges by more than 5s
  useEffect(() => {
    setSeconds((local) => Math.abs(initialSeconds - local) > 5 ? initialSeconds : local);
  }, [initialSeconds]);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
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

  const { status: socketStatus, agentLocation, trialSecondsRemaining, trialItemDecisions } = useOrderSocket(orderId ?? null);

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

  // Poll every 10s while the order is not in a terminal state
  useEffect(() => {
    const TERMINAL: OrderStatus[] = ["DELIVERED", "PARTIALLY_DELIVERED", "RETURNED", "CANCELLED", "COMPLETED"];
    if (!order || TERMINAL.includes(order.status)) return;
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [order?.status, load]);

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
    return <View style={s.center}><ActivityIndicator size="large" color="#6d28d9" /></View>;
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
  const awaitingPayment = order.paymentMethod !== "COD" && order.paymentStatus === "PENDING" && order.status !== "CANCELLED";
  // PARTIALLY_DELIVERED and RETURNED map to the DELIVERED slot in the timeline
  const timelineStatus: OrderStatus = TERMINAL_DELIVERY.includes(currentStatus) ? "DELIVERED" : currentStatus;
  const currentIdx = TIMELINE.indexOf(timelineStatus);
  const isTerminalDelivery = TERMINAL_DELIVERY.includes(currentStatus);
  const isCancelled = currentStatus === "CANCELLED";
  const canCancel = !awaitingPayment && (currentStatus === "PENDING" || currentStatus === "AGENT_ASSIGNED");
  const showMap = (currentStatus === "AGENT_EN_ROUTE" || currentStatus === "ARRIVED") && agentLocation;

  // Trial countdown: prefer socket value, fallback to computing from trialEndsAt
  let trialSeconds = trialSecondsRemaining;
  if (trialSeconds === null && order.trialEndsAt) {
    trialSeconds = Math.max(0, Math.floor((new Date(order.trialEndsAt).getTime() - Date.now()) / 1000));
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Back button — always present since this screen is reachable via replace() with no stack history */}
      <TouchableOpacity
        style={s.backBtn}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/orders")}
      >
        <Text style={s.backBtnText}>← Orders</Text>
      </TouchableOpacity>

      {/* Status header */}
      <View style={s.statusHeader}>
        <Text style={s.statusLabel}>{STATUS_LABELS[currentStatus] ?? currentStatus}</Text>
        <Text style={s.orderId}>#{orderId?.slice(-8).toUpperCase()}</Text>
      </View>

      {/* Payment pending — shown when order exists but payment not completed */}
      {awaitingPayment && (
        <View style={s.payPendingCard}>
          <Text style={s.payPendingTitle}>Payment not completed</Text>
          <Text style={s.payPendingSub}>Your order is reserved but will not be dispatched until payment is confirmed.</Text>
          {order.razorpayOrderId && (
            <TouchableOpacity
              style={s.payNowBtn}
              onPress={() => router.push({
                pathname: `/payment/${order.id}`,
                params: {
                  rzpOrderId: order.razorpayOrderId!,
                  amount: String(order.totalAmount + order.deliveryFee),
                  method: order.paymentMethod,
                  itemCount: String(order.items.length),
                  isTryOrder: String(order.isTryOrder),
                },
              })}
            >
              <Text style={s.payNowBtnText}>Complete Payment  →</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={cancelOrder} disabled={cancelling}>
            <Text style={s.payPendingCancel}>{cancelling ? "Cancelling…" : "Cancel this order"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Agent map */}
      {!awaitingPayment && showMap && agentLocation && (
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

      {/* Delivery OTP — shown only when agent has arrived */}
      {currentStatus === "ARRIVED" && order.deliveryOtp && (
        <View style={s.otpBox}>
          <Text style={s.otpLabel}>Your delivery OTP</Text>
          <Text style={s.otpCode}>{order.deliveryOtp}</Text>
          <Text style={s.otpNote}>Share this code with your delivery agent</Text>
        </View>
      )}

      {/* Trial countdown */}
      {currentStatus === "TRIAL_IN_PROGRESS" && trialSeconds !== null && (
        <TrialCountdown seconds={trialSeconds} />
      )}

      {/* Live trial item decisions — shown when agent submits decisions */}
      {currentStatus === "TRIAL_IN_PROGRESS" && order.isTryOrder && trialItemDecisions && (
        <View style={s.card}>
          <Text style={s.cardLabel}>Item Decisions</Text>
          {order.items.map((item) => {
            const decision = trialItemDecisions.find((d: TrialItemDecision) => d.skuId === item.skuId);
            const keeping = decision?.status === "KEPT";
            const decided = !!decision;
            return (
              <View key={item.id} style={[s.itemRow, decided && { borderBottomColor: keeping ? "#22c55e33" : "#ef444433" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{item.productName}</Text>
                  <Text style={s.itemMeta}>{item.size} · ₹{(item.price / 100).toFixed(0)}</Text>
                </View>
                {decided && (
                  <View style={[s.decisionBadge, keeping ? s.badgeKeep : s.badgeReturn]}>
                    <Text style={s.badgeText}>{keeping ? "KEPT" : "RETURNED"}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Status timeline */}
      {!isCancelled && (
        <View style={s.timeline}>
          {TIMELINE.filter((s) => !(s === "TRIAL_IN_PROGRESS" && !order.isTryOrder)).map((step, idx) => {
            const done = isTerminalDelivery ? idx <= currentIdx : idx < currentIdx;
            const active = !isTerminalDelivery && idx === currentIdx;
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

      {/* Delivery outcome summary for try-orders */}
      {order.isTryOrder && isTerminalDelivery && (
        <View style={s.outcomeBox}>
          {(() => {
            const kept = order.items.filter((i) => i.status === "KEPT").length;
            const returned = order.items.filter((i) => i.status === "RETURNED").length;
            if (currentStatus === "RETURNED") {
              return <Text style={s.outcomeText}>All {returned} item{returned !== 1 ? "s" : ""} returned — full refund issued</Text>;
            }
            if (currentStatus === "PARTIALLY_DELIVERED") {
              return <Text style={s.outcomeText}>{kept} item{kept !== 1 ? "s" : ""} kept · {returned} returned</Text>;
            }
            return <Text style={s.outcomeText}>All {kept} item{kept !== 1 ? "s" : ""} kept</Text>;
          })()}
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
  scroll: { flex: 1, backgroundColor: "#f8f9ff" },
  content: { padding: 20, paddingBottom: 48 },
  backBtn: { marginBottom: 16 },
  backBtnText: { color: "#6d28d9", fontSize: 15, fontWeight: "600" },
  center: { flex: 1, backgroundColor: "#f8f9ff", alignItems: "center", justifyContent: "center" },
  statusHeader: { marginBottom: 20 },
  statusLabel: { color: "#0b1c30", fontSize: 26, fontWeight: "700" },
  orderId: { color: "#7b7486", fontSize: 13, marginTop: 2 },
  map: { height: 220, borderRadius: 14, marginBottom: 16, overflow: "hidden" },
  trialBox: {
    backgroundColor: "#ede9fe", borderRadius: 14, padding: 20, marginBottom: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#dac5ff",
  },
  trialLabel: { color: "#5300b7", fontSize: 13, marginBottom: 4, fontWeight: "600" },
  trialTimer: { color: "#0b1c30", fontSize: 48, fontWeight: "700", fontVariant: ["tabular-nums"] },
  trialNote: { color: "#5300b7", fontSize: 12, marginTop: 8, textAlign: "center" },
  timeline: {
    backgroundColor: "#ffffff", borderRadius: 14, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: "#e5eeff",
  },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", minHeight: 40 },
  timelineLeft: { alignItems: "center", width: 24, marginRight: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#e5eeff", borderWidth: 2, borderColor: "#ccc3d7" },
  dotDone: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
  dotActive: { backgroundColor: "#6d28d9", borderColor: "#6d28d9" },
  line: { width: 2, flex: 1, backgroundColor: "#e5eeff", minHeight: 24, marginVertical: 2 },
  lineDone: { backgroundColor: "#22c55e" },
  timelineLabel: { color: "#7b7486", fontSize: 14, paddingTop: 0, lineHeight: 16 },
  timelineDone: { color: "#4a4455" },
  timelineActive: { color: "#0b1c30", fontWeight: "700" },
  cancelledBox: {
    backgroundColor: "#ffdad6", borderRadius: 14, padding: 20,
    marginBottom: 16, alignItems: "center", borderWidth: 1, borderColor: "#ffb4ab",
  },
  cancelledText: { color: "#ba1a1a", fontSize: 16, fontWeight: "600" },
  card: {
    backgroundColor: "#ffffff", borderRadius: 14, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: "#e5eeff",
  },
  cardLabel: { color: "#7b7486", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 12 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e5eeff" },
  itemName: { color: "#0b1c30", fontSize: 14, fontWeight: "500" },
  itemMeta: { color: "#7b7486", fontSize: 13 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  totalLabel: { color: "#7b7486", fontSize: 15 },
  totalValue: { color: "#0b1c30", fontSize: 15, fontWeight: "700" },
  feeNote: { color: "#7b7486", fontSize: 12, marginTop: 4 },
  tryNote: { color: "#5300b7", fontSize: 12, marginTop: 4, fontWeight: "600" },
  outcomeBox: {
    backgroundColor: "#ffffff", borderRadius: 14, padding: 16, marginBottom: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#e5eeff",
  },
  outcomeText: { color: "#4a4455", fontSize: 14 },
  cancelBtn: { borderWidth: 1.5, borderColor: "#ba1a1a", borderRadius: 12, padding: 16, alignItems: "center" },
  cancelBtnText: { color: "#ba1a1a", fontWeight: "600", fontSize: 15 },
  errorText: { color: "#ba1a1a", fontSize: 16, marginBottom: 16 },
  retryBtn: { borderWidth: 1.5, borderColor: "#ccc3d7", borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  retryText: { color: "#4a4455", fontSize: 15 },
  decisionBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeKeep: { backgroundColor: "#dcfce7" },
  badgeReturn: { backgroundColor: "#f3f4f6" },
  badgeText: { fontWeight: "700", fontSize: 11, color: "#15803d" },
  otpBox: {
    backgroundColor: "#f0fdf4", borderRadius: 14, padding: 20, marginBottom: 16,
    alignItems: "center", borderWidth: 1.5, borderColor: "#22c55e",
  },
  otpLabel: { color: "#15803d", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  otpCode: { color: "#15803d", fontSize: 48, fontWeight: "700", letterSpacing: 12, fontVariant: ["tabular-nums"] },
  otpNote: { color: "#15803d", fontSize: 12, marginTop: 8, textAlign: "center" },

  payPendingCard: {
    backgroundColor: "#fff8e1", borderRadius: 16, padding: 20, marginBottom: 20,
    borderWidth: 1.5, borderColor: "#f59e0b",
  },
  payPendingTitle: { color: "#92400e", fontSize: 16, fontWeight: "700", marginBottom: 6 },
  payPendingSub: { color: "#78350f", fontSize: 13, lineHeight: 19, marginBottom: 16 },
  payNowBtn: { backgroundColor: "#6d28d9", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  payNowBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  payPendingCancel: { color: "#ba1a1a", fontSize: 13, fontWeight: "600", textAlign: "center" },
});
