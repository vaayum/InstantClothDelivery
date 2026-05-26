import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, clearSession } from "../lib/api";
import type { Assignment, Order, OrderStatus } from "../lib/types";

interface AssignmentWithOrder extends Assignment {
  order: Order;
}

function TrialTimer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(() => {
    const diff = Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining < 300;

  return (
    <View style={s.timerBox}>
      <Text style={s.timerLabel}>Trial window</Text>
      <Text style={[s.timerValue, isUrgent && { color: "#ef4444" }]}>
        {mins}:{secs.toString().padStart(2, "0")}
      </Text>
    </View>
  );
}

export default function DeliveryScreen() {
  const { id: orderId } = useLocalSearchParams<{ id: string }>();
  const [assignment, setAssignment] = useState<AssignmentWithOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AssignmentWithOrder>(`/api/agents/assignments/${orderId}`);
      setAssignment(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function callAndReload(endpoint: string) {
    setActionLoading(true);
    try {
      await api.post(endpoint);
      await load();
    } catch {
      Alert.alert("Error", "Action failed. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeliver() {
    setActionLoading(true);
    try {
      await api.post(`/api/agents/assignments/${orderId}/deliver`);
      router.replace("/(tabs)");
    } catch {
      Alert.alert("Error", "Could not mark as delivered.");
      setActionLoading(false);
    }
  }

  async function handleStartTrial() {
    setActionLoading(true);
    try {
      await api.post(`/api/orders/${orderId}/trial/start`);
      router.push(`/trial/${orderId}`);
    } catch {
      Alert.alert("Error", "Could not start trial.");
    } finally {
      setActionLoading(false);
    }
  }

  function renderAction(a: AssignmentWithOrder) {
    const { status: aStatus } = a;
    const oStatus: OrderStatus = a.order?.status;

    if (aStatus === "DELIVERED") {
      return <Text style={s.doneText}>Delivery Complete ✓</Text>;
    }

    if (aStatus === "ASSIGNED") {
      return (
        <TouchableOpacity style={s.primaryBtn} onPress={() => callAndReload(`/api/agents/assignments/${orderId}/accept`)} disabled={actionLoading}>
          <Text style={s.btnText}>Accept Delivery</Text>
        </TouchableOpacity>
      );
    }

    if (aStatus === "ACCEPTED") {
      return (
        <TouchableOpacity style={s.primaryBtn} onPress={() => callAndReload(`/api/agents/assignments/${orderId}/pickup`)} disabled={actionLoading}>
          <Text style={s.btnText}>Picked Up from Warehouse</Text>
        </TouchableOpacity>
      );
    }

    if (aStatus === "PICKED_UP") {
      if (oStatus === "AGENT_EN_ROUTE") {
        return (
          <TouchableOpacity style={s.primaryBtn} onPress={() => callAndReload(`/api/agents/assignments/${orderId}/arrive`)} disabled={actionLoading}>
            <Text style={s.btnText}>Arrived at Customer</Text>
          </TouchableOpacity>
        );
      }

      if (oStatus === "ARRIVED") {
        if (a.order?.isTryOrder) {
          return (
            <View style={s.actionGroup}>
              <TouchableOpacity style={s.primaryBtn} onPress={handleStartTrial} disabled={actionLoading}>
                <Text style={s.btnText}>Start Trial (30 min)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.absentBtn} onPress={() => callAndReload(`/api/agents/assignments/${orderId}/absent`)} disabled={actionLoading}>
                <Text style={s.btnText}>Mark Absent</Text>
              </TouchableOpacity>
            </View>
          );
        }
        return (
          <View style={s.actionGroup}>
            <TouchableOpacity style={s.primaryBtn} onPress={handleDeliver} disabled={actionLoading}>
              <Text style={s.btnText}>Mark Delivered</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.absentBtn} onPress={() => callAndReload(`/api/agents/assignments/${orderId}/absent`)} disabled={actionLoading}>
              <Text style={s.btnText}>Mark Absent</Text>
            </TouchableOpacity>
          </View>
        );
      }

      if (oStatus === "TRIAL_IN_PROGRESS") {
        const trialDone = a.order?.items?.every(
          (i) => i.status === "KEPT" || i.status === "RETURNED"
        );
        if (trialDone) {
          return (
            <TouchableOpacity style={s.primaryBtn} onPress={handleDeliver} disabled={actionLoading}>
              <Text style={s.btnText}>Mark Delivered</Text>
            </TouchableOpacity>
          );
        }
        return (
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: "#8b5cf6" }]} onPress={() => router.push(`/trial/${orderId}`)}>
            <Text style={s.btnText}>View Trial Items</Text>
          </TouchableOpacity>
        );
      }
    }

    return null;
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  if (!assignment) {
    return <View style={s.center}><Text style={s.errorText}>Assignment not found.</Text></View>;
  }

  const order = assignment.order;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Order info card */}
      <View style={s.card}>
        <Text style={s.cardLabel}>Order</Text>
        <Text style={s.orderId}>#{orderId.slice(-8).toUpperCase()}</Text>
        {order?.deliveryAddress ? <Text style={s.address}>{order.deliveryAddress}</Text> : null}
        <Text style={s.amount}>₹{((order?.totalAmount ?? 0) / 100).toFixed(0)}</Text>
      </View>

      {/* Items */}
      {order?.items?.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>Items ({order.items.length})</Text>
          {order.items.map((item) => (
            <View key={item.id} style={s.itemRow}>
              <Text style={s.itemName}>{item.productName}</Text>
              <Text style={s.itemMeta}>{item.size} · qty {item.quantity}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Trial timer */}
      {order?.status === "TRIAL_IN_PROGRESS" && order.trialEndsAt && (
        <TrialTimer endsAt={order.trialEndsAt} />
      )}

      {/* Action */}
      <View style={s.actionArea}>
        {actionLoading
          ? <ActivityIndicator size="large" color="#fff" />
          : renderAction(assignment)
        }
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#111" },
  content: { padding: 24 },
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#1e1e1e", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardLabel: { color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  orderId: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  address: { color: "#aaa", fontSize: 14, marginTop: 4 },
  amount: { color: "#22c55e", fontSize: 18, fontWeight: "bold", marginTop: 8 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#2a2a2a" },
  itemName: { color: "#fff", fontSize: 14 },
  itemMeta: { color: "#888", fontSize: 13 },
  timerBox: { backgroundColor: "#1e1e1e", borderRadius: 12, padding: 20, marginBottom: 16, alignItems: "center" },
  timerLabel: { color: "#888", fontSize: 12, marginBottom: 4 },
  timerValue: { color: "#fff", fontSize: 40, fontWeight: "bold", fontVariant: ["tabular-nums"] },
  actionArea: { marginTop: 8 },
  actionGroup: { gap: 12 },
  primaryBtn: { backgroundColor: "#3b82f6", borderRadius: 12, padding: 18, alignItems: "center" },
  absentBtn: { backgroundColor: "#ef4444", borderRadius: 12, padding: 18, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  doneText: { color: "#22c55e", fontSize: 20, fontWeight: "bold", textAlign: "center", marginTop: 24 },
  errorText: { color: "#ef4444", fontSize: 16 },
});
