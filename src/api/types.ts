/** Шаклҳои ҷавоби сервер. Ҳама пул — дар дирам (1 TJS = 100). */
export type Role = 'customer' | 'courier' | 'merchant' | 'admin';
export type User = { id: number; phone: string; name: string | null; role: Role; merchant_id: number | null };
export type Point = { lat: number; lon: number };

export type Merchant = {
  id: number;
  kind: 'restaurant' | 'market';
  name: string;
  cuisine_tj: string | null;
  cuisine_ru: string | null;
  emoji: string | null;
  lat: number;
  lon: number;
  rating: number;
  prep_min: number;
  is_open: boolean;
  delivery_radius_km: number;
  min_order: number;
};

export type Product = {
  id: number;
  name_tj: string;
  name_ru: string;
  unit_tj: string | null;
  unit_ru: string | null;
  category: string | null;
  emoji: string | null;
  price: number;
  available: boolean;
};

export type MerchantWithMenu = Merchant & { products: Product[] };

/** Суроғаи расонидан (нигоҳдошташуда ё нав) */
export type Address = Point & {
  id?: number;
  label?: string;
  text: string;
  entrance?: string | null;
  floor?: string | null;
  apartment?: string | null;
  comment?: string | null;
};

export type CartQuote = { subtotal: number; deliveryFee: number; serviceFee: number; total: number; routeKm: number; etaMin: number };

export type OrderKind = 'food' | 'market';
export type OrderStatus = 'awaiting_payment' | 'created' | 'accepted' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';
export type PaymentStatus = 'none' | 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderItem = { product_id: number; name_tj: string; name_ru: string; price: number; qty: number };

export type Order = {
  id: number;
  kind: OrderKind;
  status: OrderStatus;
  user_id: number;
  merchant_id: number;
  merchant_name: string;
  courier_id: number | null;
  address: string;
  lat: number;
  lon: number;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  comment: string | null;
  payment: 'cash' | 'card';
  payment_status: PaymentStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  eta_at: string | null;
  created_at: string;
  items: OrderItem[];
};

export type OrderDetail = Order & {
  merchant_lat: number;
  merchant_lon: number;
  courier_name: string | null;
  courier_phone?: string;
  courierLocation: Point | null;
  checkoutUrl: string | null;
  events: { status: string; created_at: string }[];
};

export type DeliveryOffer = {
  orderId: number;
  merchantName: string;
  pickup: Point;
  dropoff: Point;
  address: string;
  pickupKm?: number;
  deliveryFee: number;
  cash: number;
  expiresInS: number;
};

export type WsMessage =
  | { event: 'hello'; data: { userId: number; role: Role } }
  | { event: 'order.status'; data: { orderId: number; status: OrderStatus; courierAssigned?: boolean } }
  | { event: 'order.new'; data: { orderId: number } }
  | { event: 'courier.location'; data: { orderId: number; lat: number; lon: number } }
  | { event: 'delivery.offer'; data: DeliveryOffer };
