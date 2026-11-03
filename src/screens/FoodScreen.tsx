import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Nav } from '../nav';
import { useApi, useStore } from '../state/store';
import type { Merchant } from '../api/types';
import { C, Card, ErrorView, Header, Loading, s } from '../components/ui';

export default function FoodScreen({ nav }: { nav: Nav }) {
  const { t, tr, errText } = useStore();
  const { data, error, loading, reload } = useApi<Merchant[]>('/merchants?kind=restaurant');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = (data ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle) || tr(r, 'cuisine').toLowerCase().includes(needle));

  return (
    <View style={s.screen}>
      <Header title={t('food')} onBack={nav.back} />
      {loading && !data ? (
        <Loading text={t('loading')} />
      ) : error && !data ? (
        <ErrorView text={errText(error)} retryLabel={t('retry')} onRetry={reload} />
      ) : (
        <ScrollView contentContainerStyle={s.pad}>
          <TextInput
            placeholder={t('search')}
            placeholderTextColor={C.muted}
            value={q}
            onChangeText={setQ}
            style={{ backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 15, color: C.text }}
          />
          {list.map((r) => (
            <Card key={r.id} onPress={() => nav.push({ name: 'restaurant', id: r.id })} style={!r.is_open ? { opacity: 0.5 } : undefined}>
              <View style={{ height: 90, borderRadius: 10, backgroundColor: '#FFF4E5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 48 }}>{r.emoji}</Text>
              </View>
              <Text style={s.title}>{r.name}</Text>
              <Text style={s.muted}>
                {tr(r, 'cuisine')} · ⭐ {r.rating} · {r.prep_min} {t('min')}
                {!r.is_open ? ` · ${t('closed')}` : ''}
              </Text>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
