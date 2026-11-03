import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { cartCount, cartSubtotal, useApi, useStore } from '../state/store';
import type { Merchant, MerchantWithMenu } from '../api/types';
import { Button, Card, Chip, ErrorView, Header, Loading, QtyStepper, s } from '../components/ui';
import { productCategories } from '../data/mock';
import { fmt } from '../data/pricing';

export default function MarketScreen({ nav }: { nav: Nav }) {
  const { t, tr, lang, cart, addToCart, changeQty, errText } = useStore();
  const markets = useApi<Merchant[]>('/merchants?kind=market');
  const marketId = markets.data?.[0]?.id ?? null;
  const menu = useApi<MerchantWithMenu>(marketId ? `/merchants/${marketId}` : null);
  const [cat, setCat] = useState<string>('all');

  const error = markets.error ?? menu.error;
  const m = menu.data;
  const list = (m?.products ?? []).filter((p) => cat === 'all' || p.category === cat);
  const inThis = m != null && cart.merchantId === m.id;

  return (
    <View style={s.screen}>
      <Header title={t('market')} onBack={nav.back} />
      {!m && !error ? (
        <Loading text={t('loading')} />
      ) : error || !m ? (
        <ErrorView text={errText(error)} retryLabel={t('retry')} onRetry={() => (markets.data ? menu.reload() : markets.reload())} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 16, paddingBottom: 4 }}>
            <Chip label={t('all')} active={cat === 'all'} onPress={() => setCat('all')} />
            {productCategories.map((c) => (
              <Chip key={c.id} label={c.name[lang]} active={cat === c.id} onPress={() => setCat(c.id)} />
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={[s.pad, { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 100 }]}>
            {list.map((p) => {
              const line = inThis ? cart.lines.find((x) => x.productId === p.id) : undefined;
              return (
                <Card key={p.id} style={{ width: '47%', gap: 6, opacity: p.available ? 1 : 0.5 }}>
                  <Text style={{ fontSize: 44, textAlign: 'center' }}>{p.emoji}</Text>
                  <Text style={s.title} numberOfLines={1}>{tr(p, 'name')}</Text>
                  <Text style={s.muted}>{tr(p, 'unit')} · {fmt(p.price)}</Text>
                  {line ? (
                    <QtyStepper qty={line.qty} onMinus={() => changeQty(p.id, -1)} onPlus={() => changeQty(p.id, 1)} />
                  ) : (
                    <Button
                      title={`+ ${t('addToCart')}`}
                      variant="ghost"
                      disabled={!p.available || !m.is_open}
                      onPress={() => addToCart(m.id, m.name, { productId: p.id, name_tj: p.name_tj, name_ru: p.name_ru, price: p.price, emoji: p.emoji ?? '' })}
                    />
                  )}
                </Card>
              );
            })}
          </ScrollView>
        </>
      )}
      {inThis && cartCount(cart) > 0 && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <Button title={`${t('cart')} · ${cartCount(cart)} · ${fmt(cartSubtotal(cart))}`} onPress={() => nav.push({ name: 'cart' })} />
        </View>
      )}
    </View>
  );
}
