import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Lang, strings, StringKey, L10n } from '../i18n/strings';

export type CartLine = { id: string; name: L10n; price: number; emoji: string; qty: number };
/** Сабад танҳо аз як манбаъ: тарабхона (id) ё 'market' */
export type Cart = { sourceId: string | null; sourceName: string; lines: CartLine[] };

export type OrderKind = 'food' | 'market' | 'taxi';
export type Order = {
  id: string;
  kind: OrderKind;
  title: string;
  total: number;
  createdAt: number;
  step: number; // индекс дар STATUS_FLOW[kind]
};

export const STATUS_FLOW: Record<OrderKind, StringKey[]> = {
  food: ['status_new', 'status_cooking', 'status_onway', 'status_done'],
  market: ['status_new', 'status_onway', 'status_done'],
  taxi: ['status_search', 'status_driver', 'status_ride', 'status_done'],
};

type Store = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: StringKey) => string;
  l: (v: L10n) => string;
  cart: Cart;
  addToCart: (sourceId: string, sourceName: string, item: Omit<CartLine, 'qty'>) => void;
  changeQty: (id: string, delta: number) => void;
  clearCart: () => void;
  orders: Order[];
  placeOrder: (o: Omit<Order, 'id' | 'createdAt' | 'step'>) => void;
};

const Ctx = createContext<Store | null>(null);
const emptyCart: Cart = { sourceId: null, sourceName: '', lines: [] };
/** Симулятсия: ҳар 8 с ҳолати фармоиш як қадам пеш меравад (дар backend — WebSocket/push) */
const STEP_MS = 8000;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('tj');
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [orders, setOrders] = useState<Order[]>([]);
  const seq = useRef(1);

  useEffect(() => {
    const h = setInterval(() => {
      setOrders((os) =>
        os.some((o) => o.step < STATUS_FLOW[o.kind].length - 1)
          ? os.map((o) => (o.step < STATUS_FLOW[o.kind].length - 1 ? { ...o, step: o.step + 1 } : o))
          : os,
      );
    }, STEP_MS);
    return () => clearInterval(h);
  }, []);

  const value = useMemo<Store>(
    () => ({
      lang,
      setLang,
      t: (k) => strings[lang][k],
      l: (v) => v[lang],
      cart,
      addToCart: (sourceId, sourceName, item) =>
        setCart((c) => {
          // Манбаи нав → сабадро аз нав оғоз мекунем
          const base = c.sourceId === sourceId ? c : { sourceId, sourceName, lines: [] };
          const found = base.lines.find((x) => x.id === item.id);
          const lines = found
            ? base.lines.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x))
            : [...base.lines, { ...item, qty: 1 }];
          return { ...base, lines };
        }),
      changeQty: (id, delta) =>
        setCart((c) => {
          const lines = c.lines
            .map((x) => (x.id === id ? { ...x, qty: x.qty + delta } : x))
            .filter((x) => x.qty > 0);
          return lines.length ? { ...c, lines } : emptyCart;
        }),
      clearCart: () => setCart(emptyCart),
      orders,
      placeOrder: (o) =>
        setOrders((os) => [
          { ...o, id: `#${1000 + seq.current++}`, createdAt: Date.now(), step: 0 },
          ...os,
        ]),
    }),
    [lang, cart, orders],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export const cartSubtotal = (c: Cart) => c.lines.reduce((s, x) => s + x.price * x.qty, 0);
export const cartCount = (c: Cart) => c.lines.reduce((s, x) => s + x.qty, 0);
