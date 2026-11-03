import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { cartCount, cartSubtotal, useStore } from '../state/store';
import { Button, Card, Header, QtyStepper, s } from '../components/ui';
import { restaurants } from '../data/mock';
import { fmt } from '../data/pricing';

export default function RestaurantScreen({ nav, id }: { nav: Nav; id: string }) {
  const { t, l, cart, addToCart, changeQty } = useStore();
  const r = restaurants.find((x) => x.id === id);
  if (!r) return null;
  const inThis = cart.sourceId === r.id;

  return (
    <View style={s.screen}>
      <Header title={r.name} onBack={nav.back} />
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 100 }]}>
        <Text style={s.muted}>
          {l(r.cuisine)} · ⭐ {r.rating} · {r.etaMin} {t('min')}
        </Text>
        {r.menu.map((m) => {
          const line = inThis ? cart.lines.find((x) => x.id === m.id) : undefined;
          return (
            <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={s.emoji}>{m.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{l(m.name)}</Text>
                <Text style={s.muted}>{fmt(m.price)}</Text>
              </View>
              {line ? (
                <QtyStepper qty={line.qty} onMinus={() => changeQty(m.id, -1)} onPlus={() => changeQty(m.id, 1)} />
              ) : (
                <View style={{ width: 96 }}>
                  <Button title={`+ ${t('addToCart')}`} variant="ghost" onPress={() => addToCart(r.id, r.name, { id: m.id, name: m.name, price: m.price, emoji: m.emoji })} />
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
      {inThis && cartCount(cart) > 0 && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <Button title={`${t('cart')} · ${cartCount(cart)} · ${fmt(cartSubtotal(cart))}`} onPress={() => nav.push({ name: 'cart' })} />
        </View>
      )}
    </View>
  );
}
