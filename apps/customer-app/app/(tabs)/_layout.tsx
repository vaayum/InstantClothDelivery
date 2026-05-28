import { Text, View } from "react-native";
import { Tabs } from "expo-router";
import { useCart } from "../context/CartContext";
import { T } from "../lib/theme";

function CartBadge() {
  const { totalItems } = useCart();
  if (totalItems === 0) return null;
  return (
    <View style={{
      position: "absolute", top: -4, right: -8,
      backgroundColor: T.pink, borderRadius: 8,
      minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 3,
    }}>
      <Text style={{ color: T.white, fontSize: 10, fontWeight: "bold" }}>
        {totalItems > 9 ? "9+" : totalItems}
      </Text>
    </View>
  );
}

type IconProps = { focused: boolean; label: string; icon: string; badge?: boolean };
function TabIcon({ focused, label, icon, badge }: IconProps) {
  return (
    <View style={{ alignItems: "center", paddingTop: 6 }}>
      <View>
        <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{icon}</Text>
        {badge && <CartBadge />}
      </View>
      <Text style={{
        fontSize: 10, fontWeight: focused ? "700" : "400",
        color: focused ? T.pink : T.gray, marginTop: 2,
      }}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: T.white,
          borderTopColor: T.border,
          borderTopWidth: 1,
          height: 64,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Home" icon="🏠" />,
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Wishlist" icon="♡" />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Bag" icon="👜" badge />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Orders" icon="📦" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} label="Profile" icon="👤" />,
        }}
      />
    </Tabs>
  );
}
