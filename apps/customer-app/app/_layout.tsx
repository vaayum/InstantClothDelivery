import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import { getToken } from "./lib/api";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";

export default function RootLayout() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getToken().then(setToken);
  }, []);

  useEffect(() => {
    if (token === undefined) return;
    if (!token) router.replace("/login");
  }, [token]);

  if (token === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <WishlistProvider>
      <CartProvider>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ title: "Order Tracking", headerBackTitle: "Orders" }} />
        <Stack.Screen name="product/[id]" options={{ title: "Product" }} />
        <Stack.Screen name="cart" options={{ title: "Cart" }} />
      </Stack>
      </CartProvider>
    </WishlistProvider>
  );
}
