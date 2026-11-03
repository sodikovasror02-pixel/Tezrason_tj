import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { useApi, useStore } from '../state/store';
import { api } from '../api/client';
import type { FareQuote, Tariff } from '../api/types';
import { Button, C, Card, Chip, ErrorBanner, Header, Row, s } from '../components/ui';
import { places } from '../data/mock';
import { fmt } from '../data/pricing';

export default function TaxiScreen({ nav }: { nav: Nav }) {
  const { t, tr, lang, refreshOrders, errText } = useStore();
  const tariffs = useApi<Tariff[]>('/tariffs');
  const [fromId, setFromId] = useState(places[1].id);
  const [toId, setToId] = useState(places[0].id);
  const [tariffId, setTariffId] = useState('econom');
  const [quotes, setQuotes] = useState<FareQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = places.find((p) => p.id === fromId)!;
  const to = places.find((p) => p.id === toId)!;
  const same = fromId === toId;

  useEffect(() => {
    if (same) return setQuotes(null);
    let alive = true;
    setQuotes(null);
    api<FareQuote[]>('POST', '/quotes/taxi', { from: from.point, to: to.point })
      .then((q) => alive && (setQuotes(q), setError(null)))
      .catch((e) => alive && setError(errText(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId]);

  const q = quotes?.find((x) => x.tariffId === tariffId);
  const tariff = tariffs.data?.find((x) => x.id === tariffId);

  const order = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/rides', { from: from.point, to: to.point, fromName: from.name[lang], toName: to.name[lang], tariffId, payment: 'cash' });
      await refreshOrders().catch(() => {});
      nav.reset({ name: 'tabs', tab: 'orders' });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const PlacePicker = ({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) => (
    <View style={{ gap: 6 }}>
      <Text style={s.title}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {places.map((p) => (
          <Chip key={p.id} label={p.name[lang]} active={value === p.id} onPress={() => onChange(p.id)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={s.screen}>
      <Header title={t('taxi')} onBack={nav.back} />
      <ScrollView contentContainerStyle={s.pad}>
        {/* Ҷои харита: дар қадами навбатӣ — react-native-maps + OSRM */}
        <View style={{ height: 140, borderRadius: 14, backgroundColor: '#E3EEF9', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, color: C.text }}>🟢 {from.name[lang]}</Text>
          <Text style={{ fontSize: 18, color: C.muted }}>⋮</Text>
          <Text style={{ fontSize: 15, color: C.text }}>🔴 {to.name[lang]}</Text>
        </View>

        <PlacePicker label={`🟢 ${t('from')}`} value={fromId} onChange={setFromId} />
        <PlacePicker label={`🔴 ${t('to')}`} value={toId} onChange={setToId} />

        <Text style={s.title}>{t('tariff')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(tariffs.data ?? []).map((x) => {
            const price = quotes?.find((qq) => qq.tariffId === x.id)?.total;
            const active = x.id === tariffId;
            return (
              <Pressable key={x.id} onPress={() => setTariffId(x.id)} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 2, borderColor: active ? C.primary : C.line, alignItems: 'center' }}>
                <Text style={{ fontSize: 26 }}>{x.emoji}</Text>
                <Text style={s.title}>{tr(x, 'name')}</Text>
                <Text style={s.muted}>{same ? '—' : price != null ? fmt(price) : '…'}</Text>
              </Pressable>
            );
          })}
        </View>

        {!same && (
          <Card>
            <Text style={[s.title, { marginBottom: 6 }]}>{t('fareCalc')}</Text>
            {q && tariff ? (
              <>
                <Row label={`${t('distance')} (d = 1.3·d₀)`} value={`${q.straightKm.toFixed(2)} → ${q.routeKm.toFixed(2)} ${t('km')}`} />
                <Row label={`${t('duration')} (t = d / 25 км/с)`} value={`${q.minutes.toFixed(1)} ${t('min')}`} />
                <Row label="C₀" value={fmt(q.base)} />
                <Row label={`c_km·d = ${tariff.per_km / 100}·${q.routeKm.toFixed(2)}`} value={fmt(q.distCost)} />
                <Row label={`c_min·t = ${tariff.per_min / 100}·${q.minutes.toFixed(1)}`} value={fmt(q.timeCost)} />
                <Row label="k_surge" value={`× ${q.surge.toFixed(1)}`} />
                <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
                <Row label={`${t('total')} = max(${tariff.min_fare / 100}; Σ·k)`} value={fmt(q.total)} bold />
              </>
            ) : error ? null : (
              <ActivityIndicator color={C.primary} />
            )}
          </Card>
        )}

        <ErrorBanner text={error ?? (tariffs.error ? errText(tariffs.error) : null)} />
        <Button title={`${t('callTaxi')}${q && !same ? ' · ' + fmt(q.total) : ''}`} onPress={order} disabled={same || !q || busy} />
      </ScrollView>
    </View>
  );
}
