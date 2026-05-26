import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, RefreshControl, Alert,
} from "react-native";
import { router } from "expo-router";
import { api, clearSession, getAgentId } from "../lib/api";
import type { Assignment, AgentProfile, AgentStatus, OrderItem } from "../lib/types";
import { useLocation } from "../hooks/useLocation";

interface AgentWithAssignment extends AgentProfile {
  activeAssignment?: Assignment & { order?: { id: string; deliveryAddress: string; items: OrderItem[] } };
}

export default function Dashboard() {
  const [agent, setAgent] = useState<AgentWithAssignment | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useLocation(agentId, agent?.status === "AVAILABLE" || agent?.status === "EN_ROUTE_WAREHOUSE" || agent?.status === "EN_ROUTE_CUSTOMER");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const id = await getAgentId();
      if (!id) { router.replace("/login"); return; }
      setAgentId(id);
      const res = await api.get<AgentWithAssignment>(`/api/agents/${id}`);
      setAgent(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) { await clearSession(); router.replace("/login"); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAccept(orderId: string) {
    setActionLoading(true);
    try {
      await api.post(`/api/agents/assignments/${orderId}/accept`);
      await load();
    } catch { Alert.alert("Error", "Could not accept assignment."); }
    finally { setActionLoading(false); }
  }

  async function handleDecline(orderId: string) {
    Alert.alert("Decline", "Are you sure you want to decline this delivery?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline", style: "destructive",
        onPress: async () => {
          setActionLoading(true);
          try {
            await api.post(`/api/agents/assignments/${orderId}/decline`);
            await load();
          } catch { Alert.alert("Error", "Could not decline assignment."); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  }

  async function toggleStatus() {
    if (!agentId || !agent) return;
    const next: AgentStatus = agent.status === "AVAILABLE" ? "OFF_DUTY" : "AVAILABLE";
    setActionLoading(true);
    try {
      await api.patch(`/api/agents/${agentId}/status`, { status: next });
      setAgent((prev) => prev ? { ...prev, status: next } : prev);
    } catch { Alert.alert("Error", "Could not update status."); }
    finally { setActionLoading(false); }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }

  const assignment = agent?.activeAssignment;

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={[s.content, { flexGrow: 1 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#fff" />}
    >
      <Text style={s.title}>ThreadDash Agent</Text>

      {/* Status row */}
      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: agent?.status === "AVAILABLE" ? "#22c55e" : "#666" }]} />
        <Text style={s.statusText}>{agent?.status?.replace("_", " ") ?? "Unknown"}</Text>
        {!assignment && (
          <TouchableOpacity style={s.toggleBtn} onPress={toggleStatus} disabled={actionLoading}>
            <Text style={s.toggleText}>
              {agent?.status === "AVAILABLE" ? "Go Off Duty" : "Go Available"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {assignment ? (
        <View style={s.card}>
          <Text style={s.cardLabel}>Active Assignment</Text>
          <Text style={s.orderId}>Order #{assignment.orderId.slice(-8).toUpperCase()}</Text>
          {assignment.order?.deliveryAddress ? (
            <Text style={s.address}>{assignment.order.deliveryAddress}</Text>
          ) : null}
          <Text style={s.items}>{assignment.order?.items?.length ?? 0} items</Text>

          {assignment.status === "ASSIGNED" && (
            <View style={s.row}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: "#22c55e" }]}
                onPress={() => handleAccept(assignment.orderId)}
                disabled={actionLoading}
              >
                <Text style={s.actionText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: "#ef4444" }]}
                onPress={() => handleDecline(assignment.orderId)}
                disabled={actionLoading}
              >
                <Text style={s.actionText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}

          {(assignment.status === "ACCEPTED" || assignment.status === "PICKED_UP") && (
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: "#3b82f6", width: "100%" }]}
              onPress={() => router.push(`/delivery/${assignment.orderId}`)}
            >
              <Text style={s.actionText}>Go to Delivery →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.cardLabel}>No active assignment</Text>
          <Text style={s.subText}>New deliveries will appear here automatically.</Text>
        </View>
      )}

      <Text style={s.footer}>{agent?.totalDeliveries ?? 0} deliveries completed</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#111" },
  content: { padding: 24, paddingTop: 60 },
  center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 24 },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { color: "#ccc", fontSize: 14, flex: 1 },
  toggleBtn: { borderWidth: 1, borderColor: "#555", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  toggleText: { color: "#ccc", fontSize: 13 },
  card: { backgroundColor: "#1e1e1e", borderRadius: 12, padding: 20, marginBottom: 16 },
  cardLabel: { color: "#888", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 },
  orderId: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  address: { color: "#aaa", fontSize: 14, marginBottom: 4 },
  items: { color: "#666", fontSize: 13, marginBottom: 16 },
  row: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  subText: { color: "#666", fontSize: 14 },
  footer: { color: "#444", fontSize: 12, textAlign: "center", marginTop: 16 },
});
