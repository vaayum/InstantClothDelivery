export type AssignmentStatus =
  | "ASSIGNED" | "ACCEPTED" | "DECLINED"
  | "PICKED_UP" | "DELIVERED" | "ABSENT" | "RESCHEDULED";

export type OrderStatus =
  | "PENDING" | "WAREHOUSE_PROCESSING" | "READY_FOR_PICKUP"
  | "AGENT_ASSIGNED" | "AGENT_EN_ROUTE" | "ARRIVED"
  | "TRIAL_IN_PROGRESS" | "COMPLETED"
  | "DELIVERED" | "PARTIALLY_DELIVERED" | "RETURNED"
  | "CANCELLED" | "RESCHEDULED";

export type AgentStatus = "AVAILABLE" | "OFF_DUTY" | "EN_ROUTE_WAREHOUSE" | "EN_ROUTE_CUSTOMER";

export type ItemStatus = "PENDING" | "KEPT" | "RETURNED" | "NOT_AVAILABLE";

export interface OrderItem {
  id: string;
  skuId: string;
  productName: string;
  size: string;
  color: string;
  price: number;
  quantity: number;
  status: ItemStatus;
}

export interface Order {
  id: string;
  customerId: string;
  warehouseId: string;
  status: OrderStatus;
  isTryOrder: boolean;
  items: OrderItem[];
  deliveryAddress: string;
  totalAmount: number;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface Assignment {
  id: string;
  orderId: string;
  agentId: string;
  status: AssignmentStatus;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  absentAttempts: number;
  order?: Order;
  createdAt: string;
}

export interface AssignmentWithOrder extends Assignment {
  order: Order;
}

export interface AgentProfile {
  id: string;
  userId: string;
  status: AgentStatus;
  vehicleType: string;
  currentLat: number | null;
  currentLng: number | null;
  totalDeliveries: number;
}
