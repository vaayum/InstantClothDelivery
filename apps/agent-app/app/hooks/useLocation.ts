import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { api } from "../lib/api";

export function useLocation(agentId: string | null, active: boolean): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!agentId || !active) return;

    async function ping(): Promise<void> {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await api.patch(`/api/agents/${agentId}/location`, {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {
        // non-fatal — location ping failure does not crash the app
      }
    }

    ping();
    intervalRef.current = setInterval(ping, 30_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [agentId, active]);
}
