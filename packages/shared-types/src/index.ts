export type UserRole = "CUSTOMER" | "AGENT" | "WAREHOUSE_STAFF" | "ADMIN";
export type AgentStatus = "AVAILABLE" | "EN_ROUTE_WAREHOUSE" | "EN_ROUTE_CUSTOMER" | "BUSY" | "OFF_DUTY";
export type OrderStatus =
  | "PENDING" | "WAREHOUSE_PROCESSING" | "READY_FOR_PICKUP"
  | "AGENT_ASSIGNED" | "AGENT_EN_ROUTE" | "ARRIVED"
  | "TRIAL_IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
export type OrderItemStatus = "PENDING" | "KEPT" | "RETURNED";
export type PaymentMethod = "UPI" | "CARD" | "NET_BANKING" | "COD";
export type PaymentStatus = "PENDING" | "AUTHORIZED" | "CAPTURED" | "REFUNDED" | "FAILED";
export type NotificationType =
  | "ORDER_CONFIRMED" | "WAREHOUSE_PROCESSING" | "AGENT_ASSIGNED"
  | "AGENT_NEARBY" | "AGENT_ARRIVED" | "TRIAL_WARNING" | "ORDER_COMPLETE"
  | "RESCHEDULE_PROMPT" | "RETURN_PICKUP_SCHEDULED" | "NEW_ASSIGNMENT"
  | "SLA_WARNING" | "SLA_BREACH" | "LOW_STOCK" | "RETURN_ARRIVED";

export interface SizeProfile { tops: string; bottoms: string; shoes: string; }
export interface Coordinates { lat: number; lng: number; }

export interface PlaceOrderRequest {
  addressId: string;
  items: Array<{ skuId: string; quantity: number }>;
  paymentMethod: PaymentMethod;
  isTryOrder: boolean;
  safeDropAuthorized?: boolean;
}

export interface WarehouseSelectionResult {
  warehouseId: string;
  etaMinutes: number;
  score: number;
}

export interface AgentAssignmentCandidate {
  agentId: string;
  etaToWarehouseMinutes: number;
  etaToCustomerMinutes: number;
  currentOrderCount: number;
  score: number;
}

export interface AgentLocationUpdate {
  agentId: string;
  orderId: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface TrialTimerUpdate {
  orderId: string;
  secondsRemaining: number;
}

export interface OrderPlacedEvent {
  eventType: "ORDER_PLACED";
  orderId: string;
  warehouseId: string;
  userId: string;
  items: Array<{ skuId: string; quantity: number }>;
  createdAt: string;
}

export interface OrderReadyForPickupEvent {
  eventType: "ORDER_READY_FOR_PICKUP";
  orderId: string;
  warehouseId: string;
  deliveryCoords: Coordinates;
}

export interface OrderCompletedEvent {
  eventType: "ORDER_COMPLETED";
  orderId: string;
  keptItemIds: string[];
  returnedItemIds: string[];
  totalCharged: number;
  totalRefunded: number;
}
