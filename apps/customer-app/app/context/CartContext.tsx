import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CART_KEY = "cart_items";

export interface CartItem {
  skuId: string;
  productId: string;
  productName: string;
  brand: string;
  size: string;
  color: string;
  price: number;
  isTryable: boolean;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (skuId: string) => void;
  updateQty: (skuId: string, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(CART_KEY).then((raw) => {
      if (raw) setItems(JSON.parse(raw));
    });
  }, []);

  function save(next: CartItem[]) {
    setItems(next);
    AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
  }

  function addItem(item: Omit<CartItem, "quantity">) {
    setItems((prev) => {
      const existing = prev.find((i) => i.skuId === item.skuId);
      const next = existing
        ? prev.map((i) => i.skuId === item.skuId ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { ...item, quantity: 1 }];
      AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeItem(skuId: string) {
    save(items.filter((i) => i.skuId !== skuId));
  }

  function updateQty(skuId: string, delta: number) {
    save(
      items.flatMap((i) => {
        if (i.skuId !== skuId) return [i];
        const n = i.quantity + delta;
        return n <= 0 ? [] : [{ ...i, quantity: n }];
      })
    );
  }

  function clearCart() {
    save([]);
  }

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQty,
      clearCart,
      totalItems: items.reduce((s, i) => s + i.quantity, 0),
      totalPrice: items.reduce((s, i) => s + i.price * i.quantity, 0),
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
