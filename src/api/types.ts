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

export type RouteInfo = {
  distanceKm: number;
  durationMin: number;
  straightKm: number;
  geometry: [number, number][];
  source: 'osrm' | 'estimate';
};
export type TaxiQuoteResponse = { route: RouteInfo; quotes: FareQuote[] };

export type OrderDetail = Order & {
  items: { product_id: number; name_tj: string; name_ru: string; price: number; qty: number }[];
  ride: null | {
    tariff_id: string;
    from_lat: number; from_lon: number; to_lat: number; to_lon: number;
    from_name: string | null; to_name: string | null;
    route_km: string; minutes: string; surge: string;
    geometry: [number, number][];
    routeSource: 'osrm' | 'estimate';
  };
  driver_id: number | null;
  lat: number | null;
  lon: number | null;
  driverLocation: { lat: number; lon: number } | null;
  merchant_lat: number | null;
  merchant_lon: number | null;
};

/** GET /jobs — ронанда: сафарҳои озод дар радиус; курьер: фармоишҳои омода */
export type DriverJob = {
  id: number;
  total: number;
  pickupKm?: number;
  from_name?: string | null;
  to_name?: string | null;
  from_lat?: number;
  from_lon?: number;
  route_km?: string;
  merchant_name?: string;
  merchant_lat?: number;
  merchant_lon?: number;
  address?: string | null;
  delivery_fee?: number;
  status?: string;
};
export type RideOffer = { orderId: number; pickupKm: number; total: number; tariffId: string; from: { lat: number; lon: number }; to: { lat: number; lon: number } };

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
