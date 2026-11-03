import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { cartCount, cartSubtotal, useApi, useStore } from '../state/store';
import type { MerchantWithMenu } from '../api/types';
import { Button, Card, ErrorView, Header, Loading, QtyStepper, s } from '../components/ui';
import { fmt } from '../data/pricing';

export default function RestaurantScreen({ nav, id }: { nav: Nav; id: number }) {
  const { t, tr, cart, addToCart, changeQty, errText } = useStore();
  const { data: r, error, loading, reload } = useApi<MerchantWithMenu>(`/merchants/${id}`);
  const inThis = cart.merchantId === id;

  return (
    <View style={s.screen}>
      <Header title={r?.name ?? ''} onBack={nav.back} />
      {loading && !r ? (
        <Loading text={t('loading')} />
      ) : error || !r ? (
        <ErrorView text={errText(error)} retryLabel={t('retry')} onRetry={reload} />
      ) : (
        <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 100 }]}>
          <Text style={s.muted}>
            {tr(r, 'cuisine')} · ⭐ {r.rating} · {r.prep_min} {t('min')}
            {!r.is_open ? ` · ${t('closed')}` : ''}
          </Text>
          {r.products.map((m) => {
            const line = inThis ? cart.lines.find((x) => x.productId === m.id) : undefined;
            const disabled = !r.is_open || !m.available;
            return (
              <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: disabled ? 0.5 : 1 }}>
                <Text style={s.emoji}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{tr(m, 'name')}</Text>
                  <Text style={s.muted}>{fmt(m.price)}</Text>
                </View>
                {line ? (
                  <QtyStepper qty={line.qty} onMinus={() => changeQty(m.id, -1)} onPlus={() => changeQty(m.id, 1)} />
                ) : (
                  <View style={{ width: 96 }}>
                    <Button
                      title={`+ ${t('addToCart')}`}
                      variant="ghost"
                      disabled={disabled}
                      onPress={() => addToCart(r.id, r.name, { productId: m.id, name_tj: m.name_tj, name_ru: m.name_ru, price: m.price, emoji: m.emoji ?? '' })}
                    />
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
      {inThis && cartCount(cart) > 0 && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <Button title={`${t('cart')} · ${cartCount(cart)} · ${fmt(cartSubtotal(cart))}`} onPress={() => nav.push({ name: 'cart' })} />
        </View>
      )}
    </View>
  );
}
