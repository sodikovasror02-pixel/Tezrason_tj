import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { STATUS_FLOW, useStore } from '../state/store';
import { C, Card, s } from '../components/ui';
import { fmt } from '../data/pricing';

const KIND_EMOJI = { food: '🍔', market: '🛒', taxi: '🚕' } as const;

export default function OrdersScreen() {
  const { t, orders } = useStore();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={[s.h2, { fontSize: 22 }]}>{t('orders')}</Text>
      {!orders.length && <Text style={s.muted}>{t('noOrders')}</Text>}
      {orders.map((o) => {
        const flow = STATUS_FLOW[o.kind];
        const done = o.step === flow.length - 1;
        return (
          <Card key={o.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 26 }}>{KIND_EMOJI[o.kind]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{o.title}</Text>
                <Text style={s.muted}>{o.id} · {new Date(o.createdAt).toLocaleTimeString().slice(0, 5)}</Text>
              </View>
              <Text style={s.title}>{fmt(o.total)}</Text>
            </View>
            {/* Прогресс-бар аз рӯи қадамҳои ҳолат */}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {flow.map((_, i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= o.step ? C.primary : C.line }} />
              ))}
            </View>
            <Text style={{ color: done ? C.primary : C.text, fontWeight: '600' }}>
              {done ? '✅ ' : '⏳ '}
              {t(flow[o.step])}
            </Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}
