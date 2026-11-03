import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { cartCount, cartSubtotal, useStore } from '../state/store';
import { Button, Card, Chip, Header, QtyStepper, s } from '../components/ui';
import { Product, productCategories, products } from '../data/mock';
import { fmt } from '../data/pricing';

const MARKET_ID = 'market';

export default function MarketScreen({ nav }: { nav: Nav }) {
  const { t, l, cart, addToCart, changeQty } = useStore();
  const [cat, setCat] = useState<Product['category'] | 'all'>('all');
  const list = products.filter((p) => cat === 'all' || p.category === cat);
  const inThis = cart.sourceId === MARKET_ID;

  return (
    <View style={s.screen}>
      <Header title={t('market')} onBack={nav.back} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 16, paddingBottom: 4 }}>
        <Chip label={t('all')} active={cat === 'all'} onPress={() => setCat('all')} />
        {productCategories.map((c) => (
          <Chip key={c.id} label={l(c.name)} active={cat === c.id} onPress={() => setCat(c.id)} />
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={[s.pad, { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 100 }]}>
        {list.map((p) => {
          const line = inThis ? cart.lines.find((x) => x.id === p.id) : undefined;
          return (
            <Card key={p.id} style={{ width: '47%', gap: 6 }}>
              <Text style={{ fontSize: 44, textAlign: 'center' }}>{p.emoji}</Text>
              <Text style={s.title} numberOfLines={1}>{l(p.name)}</Text>
              <Text style={s.muted}>{l(p.unit)} · {fmt(p.price)}</Text>
              {line ? (
                <QtyStepper qty={line.qty} onMinus={() => changeQty(p.id, -1)} onPlus={() => changeQty(p.id, 1)} />
              ) : (
                <Button title={`+ ${t('addToCart')}`} variant="ghost" onPress={() => addToCart(MARKET_ID, t('market'), { id: p.id, name: p.name, price: p.price, emoji: p.emoji })} />
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
