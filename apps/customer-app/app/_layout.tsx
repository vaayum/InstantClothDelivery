import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { getToken } from "./lib/api";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    getToken().then(setToken);
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && token !== undefined) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, token]);

  useEffect(() => {
    if (token === undefined) return;
    if (!token) router.replace("/login");
  }, [token]);

  if (token === undefined || (!fontsLoaded && !fontError)) {
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
