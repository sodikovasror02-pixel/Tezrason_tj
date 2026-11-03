import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { useStore } from '../state/store';
import { Button, C, Card, Chip, Header, Row, s } from '../components/ui';
import { places, tariffs } from '../data/mock';
import { AVG_SPEED_KMH, fmt, ROUTE_FACTOR, taxiFare } from '../data/pricing';

/** Коэффитсиенти талабот (surge): соатҳои серодам 7–9 ва 17–19 → ×1.3 */
function currentSurge(d = new Date()): number {
  const h = d.getHours();
  return (h >= 7 && h < 9) || (h >= 17 && h < 19) ? 1.3 : 1.0;
}

export default function TaxiScreen({ nav }: { nav: Nav }) {
  const { t, l, placeOrder } = useStore();
  const [fromId, setFromId] = useState(places[1].id);
  const [toId, setToId] = useState(places[0].id);
  const [tariffId, setTariffId] = useState(tariffs[0].id);

  const from = places.find((p) => p.id === fromId)!;
  const to = places.find((p) => p.id === toId)!;
  const tariff = tariffs.find((x) => x.id === tariffId)!;
  const surge = currentSurge();
  const same = fromId === toId;
  const f = taxiFare(from.point, to.point, tariff, surge);

  const order = () => {
    placeOrder({ kind: 'taxi', title: `${l(from.name)} → ${l(to.name)}`, total: f.total });
    nav.reset({ name: 'tabs', tab: 'orders' });
  };

  const PlacePicker = ({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) => (
    <View style={{ gap: 6 }}>
      <Text style={s.title}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {places.map((p) => (
          <Chip key={p.id} label={l(p.name)} active={value === p.id} onPress={() => onChange(p.id)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={s.screen}>
      <Header title={t('taxi')} onBack={nav.back} />
      <ScrollView contentContainerStyle={s.pad}>
        {/* Ҷои харита: дар версияи пурра — react-native-maps + OSRM/Google Directions */}
        <View style={{ height: 140, borderRadius: 14, backgroundColor: '#E3EEF9', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, color: C.text }}>🟢 {l(from.name)}</Text>
          <Text style={{ fontSize: 18, color: C.muted }}>⋮</Text>
          <Text style={{ fontSize: 15, color: C.text }}>🔴 {l(to.name)}</Text>
        </View>

        <PlacePicker label={`🟢 ${t('from')}`} value={fromId} onChange={setFromId} />
        <PlacePicker label={`🔴 ${t('to')}`} value={toId} onChange={setToId} />

        <Text style={s.title}>{t('tariff')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tariffs.map((x) => {
            const price = taxiFare(from.point, to.point, x, surge).total;
            const active = x.id === tariffId;
            return (
              <Pressable key={x.id} onPress={() => setTariffId(x.id)} style={[{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 2, borderColor: active ? C.primary : C.line, alignItems: 'center' }]}>
                <Text style={{ fontSize: 26 }}>{x.emoji}</Text>
                <Text style={s.title}>{l(x.name)}</Text>
                <Text style={s.muted}>{same ? '—' : fmt(price)}</Text>
              </Pressable>
            );
          })}
        </View>

        {!same && (
          <Card>
            <Text style={[s.title, { marginBottom: 6 }]}>{t('fareCalc')}</Text>
            <Row label={`${t('distance')} (d = ${ROUTE_FACTOR}·d₀)`} value={`${f.straightKm.toFixed(2)} → ${f.routeKm.toFixed(2)} ${t('km')}`} />
            <Row label={`${t('duration')} (t = d / ${AVG_SPEED_KMH} км/с)`} value={`${f.minutes.toFixed(1)} ${t('min')}`} />
            <Row label="C₀" value={fmt(f.base)} />
            <Row label={`c_km·d = ${tariff.perKm}·${f.routeKm.toFixed(2)}`} value={fmt(Math.round(f.distCost * 100) / 100)} />
            <Row label={`c_min·t = ${tariff.perMin}·${f.minutes.toFixed(1)}`} value={fmt(Math.round(f.timeCost * 100) / 100)} />
            <Row label="k_surge" value={`× ${f.surge.toFixed(1)}`} />
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
            <Row label={`${t('total')} = max(${tariff.minFare}; Σ·k)`} value={fmt(f.total)} bold />
          </Card>
        )}

        <Button title={`${t('callTaxi')}${same ? '' : ' · ' + fmt(f.total)}`} onPress={order} disabled={same} />
      </ScrollView>
    </View>
  );
}
