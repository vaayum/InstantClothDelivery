import { View, Text, StyleSheet } from "react-native";

export default function AgentDashboard() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Agent Dashboard</Text>
      <Text style={styles.sub}>No active assignments</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  heading: { fontSize: 28, fontWeight: "bold" },
  sub: { fontSize: 14, color: "#888", marginTop: 8 },
});
