import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { useApi, useStore } from '../state/store';
import { api } from '../api/client';
import type { TaxiQuoteResponse, Tariff } from '../api/types';
import { Button, C, Card, Chip, ErrorBanner, Header, Row, s } from '../components/ui';
import RouteMap from '../components/RouteMap';
import { useMyLocation } from '../hooks/useMyLocation';
import { GeoPoint, places } from '../data/mock';
import { fmt } from '../data/pricing';

type Endpoint = { point: GeoPoint; name: string; key: string };
const fmtPt = (p: GeoPoint) => `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;

export default function TaxiScreen({ nav }: { nav: Nav }) {
  const { t, tr, lang, refreshOrders, errText } = useStore();
  const tariffs = useApi<Tariff[]>('/tariffs');
  const me = useMyLocation();

  const preset = (id: string): Endpoint => {
    const p = places.find((x) => x.id === id)!;
    return { point: p.point, name: p.name[lang], key: p.id };
  };
  const [from, setFrom] = useState<Endpoint>(preset('pl2'));
  const [to, setTo] = useState<Endpoint | null>(null);
  const [active, setActive] = useState<'from' | 'to'>('to');
  const [tariffId, setTariffId] = useState('econom');
  const [quote, setQuote] = useState<TaxiQuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Агар GPS дастрас шуд — нуқтаи «аз куҷо»-ро ба ҷойи корбар мегузорем (як маротиба)
  const usedGps = useRef(false);
  useEffect(() => {
    if (me.point && !usedGps.current) {
      usedGps.current = true;
      setFrom({ point: me.point, name: t('myLocation'), key: 'me' });
    }
  }, [me.point, t]);

  const same = !!to && Math.abs(from.point.lat - to.point.lat) < 1e-6 && Math.abs(from.point.lon - to.point.lon) < 1e-6;

  useEffect(() => {
    if (!to || same) return setQuote(null);
    let alive = true;
    setQuote(null);
    api<TaxiQuoteResponse>('POST', '/quotes/taxi', { from: from.point, to: to.point })
      .then((q) => alive && (setQuote(q), setError(null)))
      .catch((e) => alive && setError(errText(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.point.lat, from.point.lon, to?.point.lat, to?.point.lon]);

  const set = (e: Endpoint) => (active === 'from' ? setFrom(e) : setTo(e));
  const onPick = (p: GeoPoint) => {
    set({ point: p, name: `${t('pointOnMap')} (${fmtPt(p)})`, key: 'map' });
    if (active === 'from') setActive('to');
  };

  const q = quote?.quotes.find((x) => x.tariffId === tariffId);
  const tariff = tariffs.data?.find((x) => x.id === tariffId);

  const order = async () => {
    if (!to) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: number }>('POST', '/rides', { from: from.point, to: to.point, fromName: from.name, toName: to.name, tariffId, payment: 'cash' });
      await refreshOrders().catch(() => {});
      nav.reset({ name: 'tabs', tab: 'orders' });
      nav.push({ name: 'order', id: r.id });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const EndpointRow = ({ which, value }: { which: 'from' | 'to'; value: Endpoint | null }) => (
    <Pressable
      onPress={() => setActive(which)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: C.card, borderWidth: 2, borderColor: active === which ? C.primary : C.line }}
    >
      <Text>{which === 'from' ? '🟢' : '🔴'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.muted}>{which === 'from' ? t('from') : t('to')}</Text>
        <Text style={s.title} numberOfLines={1}>{value?.name ?? '—'}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={s.screen}>
      <Header title={t('taxi')} onBack={nav.back} />
      <ScrollView contentContainerStyle={s.pad}>
        <RouteMap from={from.point} to={to?.point} route={quote?.route.geometry} onPick={onPick} />
        <Text style={[s.muted, { textAlign: 'center' }]}>{t('tapMapHint')}</Text>

        <EndpointRow which="from" value={from} />
        <EndpointRow which="to" value={to} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {me.point && <Chip label={`📍 ${t('myLocation')}`} active={false} onPress={() => set({ point: me.point!, name: t('myLocation'), key: 'me' })} />}
          {places.map((p) => (
            <Chip key={p.id} label={p.name[lang]} active={(active === 'from' ? from : to)?.key === p.id} onPress={() => set(preset(p.id))} />
          ))}
        </ScrollView>

        <Text style={s.title}>{t('tariff')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(tariffs.data ?? []).map((x) => {
            const price = quote?.quotes.find((qq) => qq.tariffId === x.id)?.total;
            return (
              <Pressable key={x.id} onPress={() => setTariffId(x.id)} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 2, borderColor: x.id === tariffId ? C.primary : C.line, alignItems: 'center' }}>
                <Text style={{ fontSize: 26 }}>{x.emoji}</Text>
                <Text style={s.title}>{tr(x, 'name')}</Text>
                <Text style={s.muted}>{!to || same ? '—' : price != null ? fmt(price) : '…'}</Text>
              </Pressable>
            );
          })}
        </View>

        {to && !same && (
          <Card>
            <Text style={[s.title, { marginBottom: 2 }]}>{t('fareCalc')}</Text>
            {q && tariff && quote ? (
              <>
                <Text style={[s.muted, { marginBottom: 6 }]}>{quote.route.source === 'osrm' ? t('routeOsrm') : t('routeEstimate')}</Text>
                <Row label={`${t('distance')} (d₀ → d)`} value={`${q.straightKm.toFixed(2)} → ${q.routeKm.toFixed(2)} ${t('km')}`} />
                <Row label={t('duration')} value={`${q.minutes.toFixed(1)} ${t('min')}`} />
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
        <Button title={`${t('callTaxi')}${q && !same ? ' · ' + fmt(q.total) : ''}`} onPress={order} disabled={!to || same || !q || busy} />
      </ScrollView>
    </View>
  );
}
