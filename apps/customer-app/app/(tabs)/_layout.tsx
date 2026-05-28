import { Text, View } from "react-native";
import { Tabs } from "expo-router";
import { useCart } from "../context/CartContext";

function CartBadge() {
  const { totalItems } = useCart();
  if (totalItems === 0) return null;
  return (
    <View style={{
      position: "absolute", top: -4, right: -8,
      backgroundColor: "#ef4444", borderRadius: 8,
      minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    }}>
      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "bold" }}>
        {totalItems > 9 ? "9+" : totalItems}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5eeff",
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: "#5300b7",
        tabBarInactiveTintColor: "#7b7486",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Browse" }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Bag",
          tabBarIcon: ({ color }) => (
            <View>
              <Text style={{ fontSize: 20, color }}>🛍</Text>
              <CartBadge />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
