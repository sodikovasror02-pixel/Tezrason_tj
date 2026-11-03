import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { CUSTOMER_CANCELLABLE, STATUS_FLOW, useStore } from '../state/store';
import { api } from '../api/client';
import type { Order } from '../api/types';
import { Button, C, Card, ErrorBanner, s } from '../components/ui';
import { fmt } from '../data/pricing';
import type { Nav } from '../nav';
import type { StringKey } from '../i18n/strings';

const KIND_EMOJI = { food: '🍔', market: '🛒', taxi: '🚕' } as const;
const FINAL = ['delivered', 'completed', 'cancelled'];

export default function OrdersScreen({ nav }: { nav: Nav }) {
  const { t, orders, ordersLoading, refreshOrders, errText, wsConnected } = useStore();
  const [error, setError] = useState<string | null>(null);

  const reload = () => refreshOrders().then(() => setError(null)).catch((e) => setError(errText(e)));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = async (o: Order) => {
    try {
      await api('POST', `/orders/${o.id}/status`, { status: 'cancelled' });
      await reload();
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={ordersLoading} onRefresh={reload} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[s.h2, { fontSize: 22, marginBottom: 0 }]}>{t('orders')}</Text>
        <Text style={[s.muted, { color: wsConnected ? C.primary : C.muted }]}>● {wsConnected ? t('live') : t('offline')}</Text>
      </View>
      <ErrorBanner text={error} />
      {!orders.length && !ordersLoading && <Text style={s.muted}>{t('noOrders')}</Text>}
      {orders.map((o) => {
        const flow = STATUS_FLOW[o.kind];
        const step = flow.indexOf(o.status);
        const done = FINAL.includes(o.status);
        const cancelled = o.status === 'cancelled';
        const title = o.kind === 'taxi' ? `${o.from_name ?? '?'} → ${o.to_name ?? '?'}` : o.merchant_name ?? '';
        return (
          <Card key={o.id} style={{ gap: 10 }} onPress={() => nav.push({ name: 'order', id: o.id })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 26 }}>{KIND_EMOJI[o.kind]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{title}</Text>
                <Text style={s.muted}>#{o.id} · {new Date(o.created_at).toLocaleTimeString().slice(0, 5)}</Text>
              </View>
              <Text style={s.title}>{fmt(o.total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {flow.map((_, i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: cancelled ? C.line : i <= step ? C.primary : C.line }} />
              ))}
            </View>
            <Text style={{ color: cancelled ? C.accent : done ? C.primary : C.text, fontWeight: '600' }}>
              {cancelled ? '✖ ' : done ? '✅ ' : '⏳ '}
              {t(`status_${o.status}` as StringKey)}
            </Text>
            {o.status === 'searching' && <Text style={s.muted}>{t('noDrivers')}</Text>}
            {CUSTOMER_CANCELLABLE.includes(o.status) && <Button title={t('cancel')} variant="ghost" onPress={() => cancel(o)} />}
          </Card>
        );
      })}
    </ScrollView>
  );
}
