import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>ThreadDash</Text>
      <Text style={styles.tagline}>Fashion at your doorstep, in a dash.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  heading: { fontSize: 32, fontWeight: "bold", color: "#111" },
  tagline: { fontSize: 16, color: "#666", marginTop: 8 },
});
