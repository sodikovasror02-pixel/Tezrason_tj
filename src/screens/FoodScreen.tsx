import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Nav } from '../nav';
import { useStore } from '../state/store';
import { C, Card, Header, s } from '../components/ui';
import { defaultDeliveryPoint, restaurants } from '../data/mock';
import { deliveryFee, fmt } from '../data/pricing';

export default function FoodScreen({ nav }: { nav: Nav }) {
  const { t, l } = useStore();
  const [q, setQ] = useState('');
  const list = restaurants.filter((r) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      r.name.toLowerCase().includes(needle) ||
      r.menu.some((m) => l(m.name).toLowerCase().includes(needle))
    );
  });

  return (
    <View style={s.screen}>
      <Header title={t('food')} onBack={nav.back} />
      <ScrollView contentContainerStyle={s.pad}>
        <TextInput
          placeholder={t('search')}
          placeholderTextColor={C.muted}
          value={q}
          onChangeText={setQ}
          style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 15, color: C.text }}
        />
        {list.map((r) => (
          <Card key={r.id} onPress={() => nav.push({ name: 'restaurant', id: r.id })}>
            <View style={{ height: 90, borderRadius: 10, backgroundColor: '#FFF4E5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 48 }}>{r.emoji}</Text>
            </View>
            <Text style={s.title}>{r.name}</Text>
            <Text style={s.muted}>
              {l(r.cuisine)} · ⭐ {r.rating} · {r.etaMin} {t('min')} · {t('delivery')}{' '}
              {fmt(deliveryFee(r.location, defaultDeliveryPoint))}
            </Text>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}
