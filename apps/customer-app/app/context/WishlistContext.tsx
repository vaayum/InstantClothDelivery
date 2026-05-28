import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { api } from "../lib/api";
import type { WishlistItem } from "../lib/types";

interface WishlistContextValue {
  wishlistIds: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
  add: (productId: string) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  isWishlisted: (productId: string) => boolean;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<WishlistItem[]>("/api/wishlist");
      setWishlistIds(new Set(res.data.map((i) => i.productId)));
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = useCallback(async (productId: string) => {
    setWishlistIds((prev) => new Set([...prev, productId]));
    try {
      await api.post("/api/wishlist", { productId });
    } catch {
      setWishlistIds((prev) => { const next = new Set(prev); next.delete(productId); return next; });
    }
  }, []);

  const remove = useCallback(async (productId: string) => {
    setWishlistIds((prev) => { const next = new Set(prev); next.delete(productId); return next; });
    try {
      await api.delete(`/api/wishlist/${productId}`);
    } catch {
      setWishlistIds((prev) => new Set([...prev, productId]));
    }
  }, []);

  const isWishlisted = useCallback((productId: string) => wishlistIds.has(productId), [wishlistIds]);

  return (
    <WishlistContext.Provider value={{ wishlistIds, loading, refresh, add, remove, isWishlisted }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
