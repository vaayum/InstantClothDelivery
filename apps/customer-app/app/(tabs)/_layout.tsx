import { Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
      <Text style={{ color: T.white, fontSize: 10, fontFamily: T.font.bold }}>
        {totalItems > 9 ? "9+" : totalItems}
      </Text>
    </View>
  );
}

type TabIconName = React.ComponentProps<typeof Ionicons>["name"];
type IconProps = {
  focused: boolean;
  label: string;
  icon: TabIconName;
  iconFocused: TabIconName;
  badge?: boolean;
};

function TabIcon({ focused, label, icon, iconFocused, badge }: IconProps) {
  return (
    <View style={{ alignItems: "center", paddingTop: 6 }}>
      <View>
        <Ionicons
          name={focused ? iconFocused : icon}
          size={24}
          color={focused ? T.pink : T.gray}
        />
        {badge && <CartBadge />}
      </View>
      <Text style={{
        fontSize: 10,
        fontFamily: focused ? T.font.semi : T.font.regular,
        color: focused ? T.pink : T.gray,
        marginTop: 2,
      }}>
        {label}
      </Text>
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
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Home" icon="home-outline" iconFocused="home" />
          ),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Wishlist" icon="heart-outline" iconFocused="heart" />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Bag" icon="bag-outline" iconFocused="bag" badge />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Orders" icon="receipt-outline" iconFocused="receipt" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Profile" icon="person-outline" iconFocused="person" />
          ),
        }}
      />
    </Tabs>
  );
}
