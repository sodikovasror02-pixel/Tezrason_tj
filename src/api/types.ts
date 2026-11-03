/** Шаклҳои ҷавоби сервер. Ҳама пул — дар дирам (1 TJS = 100). */
export type Role = 'customer' | 'driver' | 'courier' | 'merchant' | 'admin';
export type User = { id: number; phone: string; name: string | null; role: Role; merchant_id: number | null };

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

export type Tariff = { id: string; name_tj: string; name_ru: string; emoji: string | null; base: number; per_km: number; per_min: number; min_fare: number };

export type FareQuote = {
  tariffId: string;
  straightKm: number;
  routeKm: number;
  minutes: number;
  base: number;
  distCost: number;
  timeCost: number;
  surge: number;
  total: number;
};

export type CartQuote = { subtotal: number; deliveryFee: number; serviceFee: number; total: number };

export type OrderKind = 'food' | 'market' | 'taxi';
export type OrderStatus =
  | 'created' | 'accepted' | 'ready' | 'picked_up' | 'delivered'
  | 'searching' | 'driver_assigned' | 'arrived' | 'in_progress' | 'completed'
  | 'cancelled';

export type Order = {
  id: number;
  kind: OrderKind;
  status: OrderStatus;
  merchant_id: number | null;
  merchant_name: string | null;
  from_name: string | null;
  to_name: string | null;
  address: string | null;
  payment: 'cash' | 'card';
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
  created_at: string;
};

export type WsMessage =
  | { event: 'hello'; data: { userId: number; role: Role } }
  | { event: 'order.status'; data: { orderId: number; kind: OrderKind; status: OrderStatus } }
  | { event: 'driver.location'; data: { orderId: number; lat: number; lon: number } }
  | { event: string; data: unknown };
