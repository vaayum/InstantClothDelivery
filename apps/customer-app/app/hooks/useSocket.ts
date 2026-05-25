import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { OrderStatus, AgentLocation } from "../lib/types";

const REALTIME_URL = "http://localhost:3005";

interface SocketState {
  status: OrderStatus | null;
  agentLocation: AgentLocation | null;
  trialSecondsRemaining: number | null;
}

export function useOrderSocket(orderId: string | null): SocketState {
  const [state, setState] = useState<SocketState>({
    status: null,
    agentLocation: null,
    trialSecondsRemaining: null,
  });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const socket = io(REALTIME_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("subscribe:order", orderId);
    });

    socket.on("order:status", (payload: { orderId: string; status: OrderStatus }) => {
      if (payload.orderId === orderId) {
        setState((prev) => ({ ...prev, status: payload.status }));
      }
    });

    socket.on("agent:location", (payload: AgentLocation) => {
      if (payload.orderId === orderId) {
        setState((prev) => ({ ...prev, agentLocation: payload }));
      }
    });

    socket.on("trial:timer", (payload: { orderId: string; secondsRemaining: number }) => {
      if (payload.orderId === orderId) {
        setState((prev) => ({ ...prev, trialSecondsRemaining: payload.secondsRemaining }));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId]);

  return state;
}
