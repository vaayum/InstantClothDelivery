import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="delivery/[id]" options={{ title: "Delivery", headerBackTitle: "Dashboard" }} />
      <Stack.Screen name="trial/[id]" options={{ title: "Trial", headerBackTitle: "Delivery" }} />
    </Stack>
  );
}
