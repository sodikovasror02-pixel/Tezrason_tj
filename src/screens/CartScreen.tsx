import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Nav } from '../nav';
import { cartSubtotal, useStore } from '../state/store';
import { Button, C, Card, Chip, Header, QtyStepper, Row, s } from '../components/ui';
import { defaultDeliveryPoint, restaurants } from '../data/mock';
import { deliveryFee, fmt, SERVICE_RATE } from '../data/pricing';

export default function CartScreen({ nav }: { nav: Nav }) {
  const { t, l, cart, changeQty, clearCart, placeOrder } = useStore();
  const [address, setAddress] = useState(t('addressDefault'));
  const [pay, setPay] = useState<'cash' | 'card'>('cash');

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

  const isMarket = cart.sourceId === 'market';
  const rest = restaurants.find((r) => r.id === cart.sourceId);
  const subtotal = cartSubtotal(cart);
  const fee = rest ? deliveryFee(rest.location, defaultDeliveryPoint) : 10;
  const service = Math.round(subtotal * SERVICE_RATE * 100) / 100;
  const total = Math.round((subtotal + fee + service) * 100) / 100;

  const submit = () => {
    placeOrder({ kind: isMarket ? 'market' : 'food', title: cart.sourceName, total });
    clearCart();
    nav.reset({ name: 'tabs', tab: 'orders' });
  };

  return (
    <View style={s.screen}>
      {header}
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h2}>{cart.sourceName}</Text>
        <Card style={{ gap: 10 }}>
          {cart.lines.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>{x.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{l(x.name)}</Text>
                <Text style={s.muted}>{fmt(x.price)} × {x.qty} = {fmt(x.price * x.qty)}</Text>
              </View>
              <QtyStepper qty={x.qty} onMinus={() => changeQty(x.id, -1)} onPlus={() => changeQty(x.id, 1)} />
            </View>
          ))}
        </Card>

        <Text style={[s.title, { marginTop: 4 }]}>{t('address')}</Text>
        <TextInput value={address} onChangeText={setAddress} style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 15, color: C.text }} />

        <Text style={s.title}>{t('payment')}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip label={`💵 ${t('cash')}`} active={pay === 'cash'} onPress={() => setPay('cash')} />
          <Chip label={`💳 ${t('card')}`} active={pay === 'card'} onPress={() => setPay('card')} />
        </View>

        <Card>
          <Row label={t('subtotal')} value={fmt(subtotal)} />
          <Row label={t('delivery')} value={fmt(fee)} />
          <Row label={`${t('serviceFee')} (${SERVICE_RATE * 100}%)`} value={fmt(service)} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <Row label={t('total')} value={fmt(total)} bold />
        </Card>

        <Button title={`${t('checkout')} · ${fmt(total)}`} onPress={submit} disabled={!address.trim()} />
      </ScrollView>
    </View>
  );
}
