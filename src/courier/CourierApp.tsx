import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api/client';
import type { DeliveryOffer, OrderDetail, OrderStatus } from '../api/types';
import { FINAL_STATUSES, useStore } from '../state/store';
import { Button, C, Card, ErrorBanner, Row, s } from '../components/ui';
import RouteMap from '../components/RouteMap';
import { fmt } from '../data/pricing';
import type { StringKey } from '../i18n/strings';
import ProfileScreen from '../screens/ProfileScreen';
import { addressDetails } from '../screens/AddressesScreen';
import { Shift, useCourierShift } from './useCourierShift';

/** Амали навбатии курьер (мувофиқи server/src/domain/status.ts) */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { ready: 'picked_up', picked_up: 'delivered' };

function openNavigation(p: { lat: number; lon: number }) {
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;
  void Linking.openURL(url);
}

/** Реҷаи курьер: таб «Кор», «Таърих», «Профил» */
export default function CourierApp() {
  const { t } = useStore();
  const shift = useCourierShift(); // дар сатҳи боло — ҳангоми иваз кардани таб смена қатъ намешавад
  const [tab, setTab] = useState<'work' | 'history' | 'profile'>('work');
  const tabs = [
    { key: 'work', icon: '🛵', label: t('work') },
    { key: 'history', icon: '🧾', label: t('history') },
    { key: 'profile', icon: '👤', label: t('profile') },
  ] as const;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{tab === 'work' ? <Work shift={shift} /> : tab === 'history' ? <History /> : <ProfileScreen />}</View>
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

function Work({ shift }: { shift: Shift }) {
  const { t, orders, refreshOrders, onWs, errText } = useStore();
  const [offer, setOffer] = useState<DeliveryOffer | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [active, setActive] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const activeOrder = orders.find((o) => !FINAL_STATUSES.includes(o.status));
  const activeKey = activeOrder ? `${activeOrder.id}:${activeOrder.status}` : '';

  const loadActive = useCallback(async () => {
    if (!activeOrder) return setActive(null);
    try {
      setActive(await api<OrderDetail>('GET', `/orders/${activeOrder.id}`));
    } catch (e) {
      setError(errText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, errText]);

  useEffect(() => {
    void refreshOrders().catch(() => {});
  }, [refreshOrders]);
  useEffect(() => {
    void loadActive();
  }, [loadActive]);

  // Пешниҳод: аз WebSocket ё (баъди аз нав кушодан) аз GET /courier/offer
  const pullOffer = useCallback(async () => {
    if (!shift.online) return;
    try {
      const o = await api<DeliveryOffer | null>('GET', '/courier/offer');
      setOffer(o);
      if (o) setSecondsLeft(o.expiresInS);
    } catch {
      /* навбатӣ */
    }
  }, [shift.online]);
  useEffect(() => {
    void pullOffer();
  }, [pullOffer]);
  useEffect(
    () =>
      onWs((m) => {
        if (m.event === 'delivery.offer') {
          setOffer(m.data);
          setSecondsLeft(m.data.expiresInS);
        }
      }),
    [onWs],
  );
  // Ҳисоби баръакс; баъди 0 — пешниҳод ба курьери дигар гузашт
  useEffect(() => {
    if (!offer) return;
    if (secondsLeft <= 0) return setOffer(null);
    const h = setTimeout(() => setSecondsLeft((x) => x - 1), 1000);
    return () => clearTimeout(h);
  }, [offer, secondsLeft]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  const accept = (id: number) =>
    run(async () => {
      setOffer(null);
      await api('POST', `/courier/offers/${id}/accept`);
      await refreshOrders();
    });
  const decline = (id: number) =>
    run(async () => {
      setOffer(null);
      await api('POST', `/courier/offers/${id}/decline`);
    });
  const advance = (status: OrderStatus) =>
    run(async () => {
      await api('POST', `/orders/${active!.id}/status`, { status });
      await refreshOrders();
    });

  const reload = async () => {
    setLoading(true);
    await Promise.all([refreshOrders().catch(() => {}), pullOffer()]);
    setLoading(false);
  };

  // Даромади имрӯз: ҳаққи расонидан аз фармоишҳои расонидашуда
  const today = new Date().toDateString();
  const doneToday = orders.filter((o) => o.status === 'delivered' && new Date(o.created_at).toDateString() === today);
  const earned = doneToday.reduce((sum, o) => sum + o.delivery_fee, 0);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[s.h2, { fontSize: 22, marginBottom: 0 }]}>🛵 {t('work')}</Text>
        <Text style={{ color: shift.online ? C.primary : C.muted, fontWeight: '600' }}>● {shift.online ? t('online') : t('offlineShift')}</Text>
      </View>

      <Card style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.muted}>{t('todayEarnings')}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>{fmt(earned)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.muted}>{t('deliveriesToday')}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>{doneToday.length}</Text>
        </View>
      </Card>

      {!activeOrder && (
        <Button title={shift.online ? t('goOffline') : t('goOnline')} variant={shift.online ? 'ghost' : 'primary'} onPress={() => void (shift.online ? shift.goOffline() : shift.goOnline())} />
      )}
      {shift.online && shift.mode === 'foreground' && <Text style={[s.muted, { textAlign: 'center' }]}>⚠️ {t('foregroundOnly')}</Text>}
      <ErrorBanner text={shift.error ? t('gpsNeeded') : error} />

      {active ? (
        <ActiveDelivery job={active} me={shift.position} busy={busy} onAdvance={advance} />
      ) : shift.online && offer ? (
        <Card style={{ borderColor: C.gold, borderWidth: 2, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[s.title, { fontSize: 17 }]}>🔔 {t('newOffer')}</Text>
            <Text style={{ color: secondsLeft <= 10 ? C.accent : C.muted, fontWeight: '700' }}>{secondsLeft} с</Text>
          </View>
          <Row label={`🟢 ${t('pickup')}`} value={offer.merchantName} />
          <Row label={`🔴 ${t('dropoff')}`} value={offer.address} />
          {offer.pickupKm != null && <Row label={t('toRestaurant')} value={`${offer.pickupKm.toFixed(1)} ${t('km')}`} />}
          <Row label={t('courierFee')} value={fmt(offer.deliveryFee)} bold />
          {offer.cash > 0 && <Text style={s.muted}>💵 {t('collectCash')}: {fmt(offer.cash)}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button title={t('decline')} variant="ghost" onPress={() => decline(offer.orderId)} disabled={busy} /></View>
            <View style={{ flex: 1 }}><Button title={t('accept')} onPress={() => accept(offer.orderId)} disabled={busy} /></View>
          </View>
        </Card>
      ) : shift.online ? (
        <Text style={[s.muted, { textAlign: 'center', marginTop: 16 }]}>⏳ {t('waitingOffers')}</Text>
      ) : null}
    </ScrollView>
  );
}

function ActiveDelivery({ job, me, busy, onAdvance }: { job: OrderDetail; me: { lat: number; lon: number } | null; busy: boolean; onAdvance: (s: OrderStatus) => void }) {
  const { t, tr } = useStore();
  const next = NEXT[job.status];
  const pickup = { lat: job.merchant_lat, lon: job.merchant_lon };
  const drop = { lat: job.lat, lon: job.lon };
  const target = job.status === 'picked_up' ? drop : pickup;
  const details = addressDetails(job, t);

  return (
    <>
      <Text style={s.h2}>{t('activeJob')} #{job.id}</Text>
      <RouteMap from={pickup} to={drop} driver={me} driverIcon="🛵" route={[[pickup.lat, pickup.lon], [drop.lat, drop.lon]]} height={260} />
      <Card style={{ gap: 6 }}>
        <Text style={s.title}>{t(`status_${job.status}` as StringKey)}</Text>
        <Row label={`🟢 ${t('pickup')}`} value={job.merchant_name} />
        <Row label={`🔴 ${t('dropoff')}`} value={job.address} />
        {details ? <Text style={[s.title, { color: C.primary }]}>🏢 {details}</Text> : null}
        {job.comment ? <Text style={s.muted}>💬 {job.comment}</Text> : null}
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 4 }} />
        {job.items.map((x) => (
          <Row key={x.product_id} label={`${tr(x, 'name')} × ${x.qty}`} value="" />
        ))}
        <Row label={t('courierFee')} value={fmt(job.delivery_fee)} bold />
        {job.payment === 'cash' ? (
          <Text style={[s.title, { color: C.accent }]}>💵 {t('collectCash')}: {fmt(job.total)}</Text>
        ) : (
          <Text style={s.muted}>💳 {t('paidByCard')}</Text>
        )}
      </Card>
      <Button title={`🧭 ${t('navigate')}`} variant="ghost" onPress={() => openNavigation(target)} />
      {next ? (
        <Button title={t(`act_${next}` as StringKey)} onPress={() => onAdvance(next)} disabled={busy} />
      ) : job.status === 'accepted' ? (
        <Text style={[s.muted, { textAlign: 'center' }]}>{t('waitKitchen')}</Text>
      ) : null}
    </>
  );
}

function History() {
  const { t, orders } = useStore();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={[s.h2, { fontSize: 22 }]}>{t('history')}</Text>
      {!orders.length && <Text style={s.muted}>{t('noOrders')}</Text>}
      {orders.map((o) => (
        <Card key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>#{o.id} · {o.merchant_name}</Text>
            <Text style={s.muted}>
              {new Date(o.created_at).toLocaleString().slice(0, 17)} · {t(`status_${o.status}` as StringKey)}
            </Text>
          </View>
          <Text style={s.title}>{fmt(o.delivery_fee)}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
