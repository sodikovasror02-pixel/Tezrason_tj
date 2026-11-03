import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { cartCount, useStore } from '../state/store';
import { C, Card, s } from '../components/ui';
import { restaurants } from '../data/mock';

export default function HomeScreen({ nav }: { nav: Nav }) {
  const { t, l, cart } = useStore();
  const services = [
    { key: 'food', emoji: '🍔', title: t('food'), sub: t('foodSub'), color: '#FFF4E5', go: () => nav.push({ name: 'food' }) },
    { key: 'taxi', emoji: '🚕', title: t('taxi'), sub: t('taxiSub'), color: '#FFF9DB', go: () => nav.push({ name: 'taxi' }) },
    { key: 'market', emoji: '🛒', title: t('market'), sub: t('marketSub'), color: '#E8F7EE', go: () => nav.push({ name: 'market' }) },
  ];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.primary }}>{t('appName')}</Text>
          <Text style={s.muted}>📍 {t('addressDefault')}</Text>
        </View>
        <Pressable onPress={() => nav.push({ name: 'cart' })} style={{ padding: 8 }}>
          <Text style={{ fontSize: 24 }}>🧺</Text>
          {cartCount(cart) > 0 && (
            <View style={{ position: 'absolute', right: 0, top: 0, backgroundColor: C.accent, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{cartCount(cart)}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Text style={[s.h2, { marginTop: 8 }]}>{t('greeting')}</Text>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {services.map((x) => (
          <Pressable key={x.key} onPress={x.go} style={({ pressed }) => [{ flex: 1, backgroundColor: x.color, borderRadius: 16, padding: 14, minHeight: 120, justifyContent: 'space-between' }, pressed && { opacity: 0.85 }]}>
            <Text style={{ fontSize: 34 }}>{x.emoji}</Text>
            <View>
              <Text style={s.title}>{x.title}</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>{x.sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={[s.h2, { marginTop: 8 }]}>{t('food')} 🔥</Text>
      {restaurants.map((r) => (
        <Card key={r.id} onPress={() => nav.push({ name: 'restaurant', id: r.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={s.emoji}>{r.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{r.name}</Text>
            <Text style={s.muted}>
              {l(r.cuisine)} · ⭐ {r.rating} · {r.etaMin} {t('min')}
            </Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
