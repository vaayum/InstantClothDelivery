import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { getToken } from "./lib/api";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getToken().then((token) => {
      if (!token) router.replace("/login");
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="delivery/[id]" options={{ title: "Delivery", headerBackTitle: "Dashboard" }} />
      <Stack.Screen name="trial/[id]" options={{ title: "Trial", headerBackTitle: "Delivery" }} />
    </Stack>
  );
}
