export type OrderStatus =
  | "PENDING" | "WAREHOUSE_PROCESSING" | "READY_FOR_PICKUP"
  | "AGENT_ASSIGNED" | "AGENT_EN_ROUTE" | "ARRIVED"
  | "TRIAL_IN_PROGRESS" | "COMPLETED"
  | "DELIVERED" | "PARTIALLY_DELIVERED" | "RETURNED"
  | "CANCELLED" | "RESCHEDULED";

export type PaymentMethod = "UPI" | "CARD" | "NET_BANKING" | "COD";

export type ItemStatus = "PENDING" | "KEPT" | "RETURNED" | "NOT_AVAILABLE";

export interface Sku {
  id: string;
  productId: string;
  size: string;
  color: string;
  barcode: string;
  available?: boolean;
  quantityAvailable?: number;
  alternativeWarehouseId?: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  gender: string;
  description: string | null;
  price: number;
  images: string[];
  isActive: boolean;
  isTryable: boolean;
  skus: Sku[];
}

export interface Address {
  id: string;
  userId: string;
  label: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  isSafeDrop: boolean;
  safeDropNote: string | null;
}

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
  userId: string;
  addressId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  razorpayOrderId: string | null;
  totalAmount: number;
  deliveryFee: number;
  isTryOrder: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  estimatedMinutes?: number;
  deliveryOtp?: string;
  items: OrderItem[];
  createdAt: string;
}

export interface AgentLocation {
  agentId: string;
  orderId: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface MeResponse {
  user: {
    userId: string;
    role: string;
    phone: string;
    pinnedWarehouseId: string | null;
  };
}
