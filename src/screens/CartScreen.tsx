import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { Nav } from '../nav';
import { useStore } from '../state/store';
import { api } from '../api/client';
import type { CartQuote, Order } from '../api/types';
import { Button, C, Card, Chip, ErrorBanner, Header, QtyStepper, Row, s } from '../components/ui';
import { defaultDeliveryPoint } from '../data/mock';
import { fmt } from '../data/pricing';

export default function CartScreen({ nav }: { nav: Nav }) {
  const { t, tr, cart, changeQty, clearCart, refreshOrders, errText } = useStore();
  const [address, setAddress] = useState(t('addressDefault'));
  const [pay, setPay] = useState<'cash' | 'card'>('cash');
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = cart.lines.map((x) => ({ productId: x.productId, qty: x.qty }));
  const itemsKey = JSON.stringify(items);

  // Нархи ниҳоиро сервер ҳисоб мекунад (debounce 300 мс)
  useEffect(() => {
    if (!cart.merchantId || !cart.lines.length) return;
    let alive = true;
    setQuote(null);
    const h = setTimeout(async () => {
      try {
        const q = await api<CartQuote>('POST', '/quotes/cart', { merchantId: cart.merchantId, items, to: defaultDeliveryPoint });
        if (alive) {
          setQuote(q);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(errText(e));
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.merchantId, itemsKey]);

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
    setBusy(true);
    setError(null);
    try {
      await api<Order>('POST', '/orders', { merchantId: cart.merchantId, items, address: address.trim(), to: defaultDeliveryPoint, payment: pay });
      clearCart();
      await refreshOrders().catch(() => {});
      nav.reset({ name: 'tabs', tab: 'orders' });
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
        <TextInput value={address} onChangeText={setAddress} maxLength={200} style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 15, color: C.text }} />

        <Text style={s.title}>{t('payment')}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label={`💵 ${t('cash')}`} active={pay === 'cash'} onPress={() => setPay('cash')} />
          <Chip label={`💳 ${t('card')}`} active={pay === 'card'} onPress={() => setPay('card')} />
        </View>

        <Card>
          {quote ? (
            <>
              <Row label={t('subtotal')} value={fmt(quote.subtotal)} />
              <Row label={t('delivery')} value={fmt(quote.deliveryFee)} />
              <Row label={`${t('serviceFee')} (5%)`} value={fmt(quote.serviceFee)} />
              <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
              <Row label={t('total')} value={fmt(quote.total)} bold />
            </>
          ) : error ? null : (
            <ActivityIndicator color={C.primary} />
          )}
        </Card>

        <ErrorBanner text={error} />
        <Button title={quote ? `${t('checkout')} · ${fmt(quote.total)}` : t('checkout')} onPress={submit} disabled={!quote || busy || address.trim().length < 3} />
      </ScrollView>
    </View>
  );
}
