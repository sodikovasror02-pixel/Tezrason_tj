import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Nav } from '../nav';
import { useStore } from '../state/store';
import { api } from '../api/client';
import type { CartQuote, Order } from '../api/types';
import { Button, C, Card, Chip, ErrorBanner, Header, QtyStepper, Row, s } from '../components/ui';
import { fmt } from '../data/pricing';
import { addressDetails } from './AddressesScreen';

/** Саҳифаи пардохти бонкро мекушояд (дар веб — равзанаи нав) */
export async function openCheckout(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank');
  else await WebBrowser.openBrowserAsync(url);
}

export default function CartScreen({ nav }: { nav: Nav }) {
  const { t, tr, cart, changeQty, clearCart, refreshOrders, errText, deliveryAddress: addr } = useStore();
  const [pay, setPay] = useState<'cash' | 'card'>('cash');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = cart.lines.map((x) => ({ productId: x.productId, qty: x.qty }));
  const itemsKey = JSON.stringify(items);

  // Нарх, минтақа ва ETA-ро сервер ҳисоб мекунад (debounce 300 мс)
  useEffect(() => {
    if (!cart.merchantId || !cart.lines.length || !addr) return;
    let alive = true;
    setQuote(null);
    setError(null);
    const h = setTimeout(async () => {
      try {
        const q = await api<CartQuote>('POST', '/quotes/cart', { merchantId: cart.merchantId, items, to: { lat: addr.lat, lon: addr.lon } });
        if (alive) setQuote(q);
      } catch (e) {
        if (alive) setError(errText(e));
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.merchantId, itemsKey, addr?.lat, addr?.lon]);

  const header = <Header title={t('cart')} onBack={nav.back} />;
  if (!cart.lines.length)
    return (
      <View style={s.screen}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 56 }}>🧺</Text>
          <Text style={s.muted}>{t('cartEmpty')}</Text>
        </View>
      </View>
    );

  const submit = async () => {
    if (!addr) return;
    setBusy(true);
    setError(null);
    try {
      const o = await api<Order & { checkoutUrl?: string }>('POST', '/orders', {
        merchantId: cart.merchantId,
        items,
        payment: pay,
        address: { text: addr.text, lat: addr.lat, lon: addr.lon, entrance: addr.entrance, floor: addr.floor, apartment: addr.apartment, comment: addr.comment },
      });
      clearCart();
      await refreshOrders().catch(() => {});
      nav.reset({ name: 'tabs', tab: 'orders' });
      nav.push({ name: 'order', id: o.id });
      if (o.checkoutUrl) await openCheckout(o.checkoutUrl);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      {header}
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h2}>{cart.merchantName}</Text>
        <Card style={{ gap: 10 }}>
          {cart.lines.map((x) => (
            <View key={x.productId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>{x.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{tr(x, 'name')}</Text>
                <Text style={s.muted}>{fmt(x.price)} × {x.qty} = {fmt(x.price * x.qty)}</Text>
              </View>
              <QtyStepper qty={x.qty} onMinus={() => changeQty(x.productId, -1)} onPlus={() => changeQty(x.productId, 1)} />
            </View>
          ))}
        </Card>

        <Text style={[s.title, { marginTop: 4 }]}>{t('address')}</Text>
        <Card onPress={() => nav.push({ name: 'addresses' })} style={{ gap: 2 }}>
          {addr ? (
            <>
              <Text style={s.title}>📍 {addr.label ?? addr.text} ›</Text>
              <Text style={{ color: C.text }}>{addr.text}</Text>
              {addressDetails(addr, t) ? <Text style={s.muted}>{addressDetails(addr, t)}</Text> : null}
            </>
          ) : (
            <Text style={[s.title, { color: C.primary }]}>📍 {t('chooseAddress')} ›</Text>
          )}
        </Card>

        <Text style={s.title}>{t('payment')}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label={`💵 ${t('cash')}`} active={pay === 'cash'} onPress={() => setPay('cash')} />
          <Chip label={`💳 ${t('card')}`} active={pay === 'card'} onPress={() => setPay('card')} />
        </View>

        {addr && (
          <Card>
            {quote ? (
              <>
                <Row label={t('subtotal')} value={fmt(quote.subtotal)} />
                <Row label={`${t('delivery')} (${quote.routeKm.toFixed(1)} ${t('km')})`} value={fmt(quote.deliveryFee)} />
                <Row label={`${t('serviceFee')} (5%)`} value={fmt(quote.serviceFee)} />
                <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
                <Row label={t('total')} value={fmt(quote.total)} bold />
                <Text style={[s.muted, { marginTop: 6 }]}>⏱ {t('etaApprox')} ~{quote.etaMin} {t('min')}</Text>
              </>
            ) : error ? null : (
              <ActivityIndicator color={C.primary} />
            )}
          </Card>
        )}

        <ErrorBanner text={error} />
        <Button
          title={quote ? `${pay === 'card' ? t('payAndOrder') : t('checkout')} · ${fmt(quote.total)}` : t('checkout')}
          onPress={submit}
          disabled={!addr || !quote || busy}
        />
      </ScrollView>
    </View>
  );
}
