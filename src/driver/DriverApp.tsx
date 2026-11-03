import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { C, Card, s } from '../components/ui';
import { fmt } from '../data/pricing';
import type { StringKey } from '../i18n/strings';
import ProfileScreen from '../screens/ProfileScreen';
import DriverHomeScreen from './DriverHomeScreen';
import { useDriverShift } from './useDriverShift';

/** Реҷаи корӣ барои нақшҳои driver ва courier */
export default function DriverApp() {
  const { t, user } = useStore();
  const shift = useDriverShift(); // дар сатҳи боло — ҳангоми иваз кардани таб смена қатъ намешавад
  const [tab, setTab] = useState<'work' | 'history' | 'profile'>('work');

  const tabs = [
    { key: 'work', icon: user?.role === 'driver' ? '🚕' : '🛵', label: t('work') },
    { key: 'history', icon: '🧾', label: t('history') },
    { key: 'profile', icon: '👤', label: t('profile') },
  ] as const;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'work' ? <DriverHomeScreen shift={shift} /> : tab === 'history' ? <History /> : <ProfileScreen />}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.card, paddingVertical: 6 }}>
        {tabs.map((x) => (
          <Pressable key={x.key} style={{ flex: 1, alignItems: 'center', gap: 2 }} onPress={() => setTab(x.key)}>
            <Text style={{ fontSize: 20, opacity: tab === x.key ? 1 : 0.5 }}>{x.icon}</Text>
            <Text style={{ fontSize: 11, color: tab === x.key ? C.primary : C.muted, fontWeight: tab === x.key ? '700' : '400' }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function History() {
  const { t, orders, user } = useStore();
  const isDriver = user?.role === 'driver';
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={[s.h2, { fontSize: 22 }]}>{t('history')}</Text>
      {!orders.length && <Text style={s.muted}>{t('noOrders')}</Text>}
      {orders.map((o) => (
        <Card key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              #{o.id} · {o.kind === 'taxi' ? `${o.from_name ?? '?'} → ${o.to_name ?? '?'}` : o.merchant_name}
            </Text>
            <Text style={s.muted}>
              {new Date(o.created_at).toLocaleString().slice(0, 17)} · {t(`status_${o.status}` as StringKey)}
            </Text>
          </View>
          <Text style={s.title}>{fmt(isDriver ? o.total : o.delivery_fee)}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
