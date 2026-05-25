import { useEffect } from "react";
import { Stack } from "expo-router";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RootLayout() {
  useEffect(() => {
    AsyncStorage.getItem("customer_token").then((token) => {
      if (!token) router.replace("/login");
    });
  }, []);

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ title: "Order Tracking", headerBackTitle: "Orders" }} />
      <Stack.Screen name="product/[id]" options={{ title: "Product" }} />
    </Stack>
  );
}
