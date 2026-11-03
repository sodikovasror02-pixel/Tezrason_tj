import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Lang, strings, StringKey } from '../i18n/strings';
import { api, ApiError, setToken, setUnauthorizedHandler, WS_URL } from '../api/client';
import { loadToken, saveToken } from '../api/tokenStorage';
import type { Order, OrderKind, OrderStatus, User, WsMessage } from '../api/types';

export type CartLine = { productId: number; name_tj: string; name_ru: string; price: number; emoji: string; qty: number };
/** Сабад танҳо аз як фурӯшанда (merchant) */
export type Cart = { merchantId: number | null; merchantName: string; lines: CartLine[] };

/** Қадамҳои асосӣ барои прогресс-бар (cancelled алоҳида) */
export const STATUS_FLOW: Record<OrderKind, OrderStatus[]> = {
  food: ['created', 'accepted', 'ready', 'picked_up', 'delivered'],
  market: ['created', 'accepted', 'ready', 'picked_up', 'delivered'],
  taxi: ['searching', 'driver_assigned', 'arrived', 'in_progress', 'completed'],
};
/** Ҳолатҳое, ки мизоҷ бекор карда метавонад (мувофиқи server/src/domain/status.ts) */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['created', 'searching', 'driver_assigned', 'arrived'];

type Store = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: StringKey) => string;
  /** Майдони дузабона аз сервер: tr(obj, 'name') → obj.name_tj | obj.name_ru */
  tr: <K extends string>(obj: Partial<Record<`${K}_tj` | `${K}_ru`, string | null>>, key: K) => string;
  errText: (e: unknown) => string;

  booting: boolean;
  bootError: unknown;
  retryBoot: () => Promise<void>;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;

  cart: Cart;
  addToCart: (merchantId: number, merchantName: string, item: Omit<CartLine, 'qty'>) => void;
  changeQty: (productId: number, delta: number) => void;
  clearCart: () => void;

  orders: Order[];
  ordersLoading: boolean;
  refreshOrders: () => Promise<void>;
  wsConnected: boolean;
  /** Ҷойгиршавии охирини ронанда/курьер аз рӯи orderId (аз WebSocket) */
  driverLocations: Record<number, { lat: number; lon: number }>;
};

const Ctx = createContext<Store | null>(null);
const emptyCart: Cart = { merchantId: null, merchantName: '', lines: [] };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('tj');
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [driverLocations, setDriverLocations] = useState<Record<number, { lat: number; lon: number }>>({});
  const tokenRef = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    await saveToken(null);
    setUser(null);
    setOrders([]);
    setCart(emptyCart);
  }, []);

  const [bootError, setBootError] = useState<unknown>(null);

  // Бор кардани токени нигоҳдошташуда ва санҷиши он (/me)
  const boot = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    const saved = await loadToken();
    if (saved) {
      setToken(saved);
      tokenRef.current = saved;
      try {
        setUser(await api<User>('GET', '/me'));
      } catch (e) {
        // 401 → signOut аллакай даъват шуд (экрани воридшавӣ); дигар хато → экрани «такрор»
        if (!(e instanceof ApiError && e.status === 401)) setBootError(e);
      }
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    void boot();
  }, [signOut, boot]);

  const signIn = useCallback(async (token: string, u: User) => {
    tokenRef.current = token;
    setToken(token);
    await saveToken(token);
    setUser(u);
  }, []);

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      setOrders(await api<Order[]>('GET', '/orders'));
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // WebSocket бо пайвастшавии такрорӣ (exponential backoff: 1, 2, 4 … 30 с)
  useEffect(() => {
    if (!user || !tokenRef.current) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(tokenRef.current ?? '')}`);
      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
        void refreshOrders().catch(() => {}); // ҳангоми қатъ шудан чизе гум нашавад
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as WsMessage;
        if (m.event === 'driver.location') {
          const d = m.data as { orderId: number; lat: number; lon: number };
          setDriverLocations((x) => ({ ...x, [d.orderId]: { lat: d.lat, lon: d.lon } }));
        }
        if (m.event === 'order.status') {
          const d = m.data as { orderId: number; status: OrderStatus };
          setOrders((os) => {
            if (!os.some((o) => o.id === d.orderId)) {
              void refreshOrders().catch(() => {});
              return os;
            }
            return os.map((o) => (o.id === d.orderId ? { ...o, status: d.status } : o));
          });
        }
      };
      ws.onclose = (ev) => {
        setWsConnected(false);
        if (closed || ev.code === 4401) return;
        const delay = Math.min(30000, 1000 * 2 ** attempt++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [user, refreshOrders]);

  const value = useMemo<Store>(() => {
    const t = (k: StringKey) => strings[lang][k];
    return {
      lang,
      setLang,
      t,
      tr: (obj, key) => (obj as Record<string, string | null | undefined>)[`${key}_${lang}`] ?? (obj as Record<string, string | null | undefined>)[`${key}_tj`] ?? '',
      errText: (e) => {
        if (e instanceof ApiError) {
          const k = `err_${e.code}` as StringKey;
          return k in strings[lang] ? t(k) : e.message || t('err_unknown');
        }
        return t('err_unknown');
      },
      booting,
      bootError,
      retryBoot: boot,
      user,
      signIn,
      signOut,
      cart,
      addToCart: (merchantId, merchantName, item) =>
        setCart((c) => {
          const base = c.merchantId === merchantId ? c : { merchantId, merchantName, lines: [] };
          const found = base.lines.find((x) => x.productId === item.productId);
          const lines = found
            ? base.lines.map((x) => (x.productId === item.productId ? { ...x, qty: Math.min(99, x.qty + 1) } : x))
            : [...base.lines, { ...item, qty: 1 }];
          return { ...base, lines };
        }),
      changeQty: (productId, delta) =>
        setCart((c) => {
          const lines = c.lines
            .map((x) => (x.productId === productId ? { ...x, qty: Math.min(99, x.qty + delta) } : x))
            .filter((x) => x.qty > 0);
          return lines.length ? { ...c, lines } : emptyCart;
        }),
      clearCart: () => setCart(emptyCart),
      orders,
      ordersLoading,
      refreshOrders,
      wsConnected,
      driverLocations,
    };
  }, [lang, booting, bootError, boot, user, signIn, signOut, cart, orders, ordersLoading, refreshOrders, wsConnected, driverLocations]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export const cartSubtotal = (c: Cart) => c.lines.reduce((s, x) => s + x.price * x.qty, 0);
export const cartCount = (c: Cart) => c.lines.reduce((s, x) => s + x.qty, 0);

/** Ҳук-и умумӣ барои боркунии маълумот: { data, error, loading, reload } */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: !!path });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api<T>('GET', path);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}
