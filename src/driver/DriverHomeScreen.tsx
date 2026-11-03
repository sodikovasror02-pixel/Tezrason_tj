import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { api } from '../api/client';
import type { DriverJob, OrderDetail, OrderStatus, RideOffer } from '../api/types';
import { useStore } from '../state/store';
import { Button, C, Card, ErrorBanner, Row, s } from '../components/ui';
import RouteMap from '../components/RouteMap';
import { fmt } from '../data/pricing';
import type { StringKey } from '../i18n/strings';
import type { Shift } from './useDriverShift';

const FINAL: OrderStatus[] = ['delivered', 'completed', 'cancelled'];
const JOBS_POLL_MS = 10000;

/** Амали навбатӣ барои ронанда/курьер (мувофиқи server/src/domain/status.ts) */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  driver_assigned: 'arrived',
  arrived: 'in_progress',
  in_progress: 'completed',
  ready: 'picked_up',
  picked_up: 'delivered',
};

function openNavigation(p: { lat: number; lon: number }) {
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;
  void Linking.openURL(url);
}

export default function DriverHomeScreen({ shift }: { shift: Shift }) {
  const { t, user, orders, refreshOrders, onWs, errText } = useStore();
  const isDriver = user?.role === 'driver';
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [active, setActive] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const activeId = orders.find((o) => !FINAL.includes(o.status))?.id ?? null;
  const activeStatus = orders.find((o) => o.id === activeId)?.status;

  const loadJobs = useCallback(async () => {
    if (!shift.online) return;
    try {
      setJobs(await api<DriverJob[]>('GET', '/jobs'));
    } catch (e) {
      setError(errText(e));
    }
  }, [shift.online, errText]);

  const loadActive = useCallback(async () => {
    if (!activeId) return setActive(null);
    try {
      setActive(await api<OrderDetail>('GET', `/orders/${activeId}`));
    } catch (e) {
      setError(errText(e));
    }
  }, [activeId, errText]);

  useEffect(() => {
    void refreshOrders().catch(() => {});
  }, [refreshOrders]);
  useEffect(() => {
    void loadActive();
  }, [loadActive, activeStatus]);

  // Рӯйхати фармоишҳо: ҳангоми «дар хат» ва бе фармоиши фаъол ҳар 10 с
  useEffect(() => {
    if (!shift.online || activeId) return;
    void loadJobs();
    const h = setInterval(loadJobs, JOBS_POLL_MS);
    return () => clearInterval(h);
  }, [shift.online, activeId, loadJobs]);

  // Пешниҳоди нав аз WebSocket
  useEffect(
    () =>
      onWs((m) => {
        if (m.event === 'ride.offer') {
          setOffer(m.data as RideOffer);
          void loadJobs();
        }
      }),
    [onWs, loadJobs],
  );

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
      void loadJobs();
    } finally {
      setBusy(false);
    }
  }

  const claim = (id: number) =>
    run(async () => {
      setOffer(null);
      await api('POST', `/orders/${id}/claim`);
      await refreshOrders();
    });

  const advance = (status: OrderStatus) =>
    run(async () => {
      await api('POST', `/orders/${active!.id}/status`, { status });
      await refreshOrders();
    });

  const reload = async () => {
    setLoading(true);
    await Promise.all([refreshOrders().catch(() => {}), loadJobs(), loadActive()]);
    setLoading(false);
  };

  // Даромади имрӯз: ронанда — нархи сафар, курьер — ҳаққи расонидан
  const today = new Date().toDateString();
  const doneToday = orders.filter((o) => (o.status === 'completed' || o.status === 'delivered') && new Date(o.created_at).toDateString() === today);
  const earned = doneToday.reduce((sum, o) => sum + (isDriver ? o.total : o.delivery_fee), 0);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[s.h2, { fontSize: 22, marginBottom: 0 }]}>{isDriver ? '🚕' : '🛵'} {t('work')}</Text>
        <Text style={{ color: shift.online ? C.primary : C.muted, fontWeight: '600' }}>● {shift.online ? t('online') : t('offlineShift')}</Text>
      </View>

      <Card style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.muted}>{t('todayEarnings')}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>{fmt(earned)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.muted}>{t('tripsToday')}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>{doneToday.length}</Text>
        </View>
      </Card>

      {!activeId && (
        <Button title={shift.online ? t('goOffline') : t('goOnline')} variant={shift.online ? 'ghost' : 'primary'} onPress={() => void (shift.online ? shift.goOffline() : shift.goOnline())} />
      )}
      <ErrorBanner text={shift.error ? t('gpsNeeded') : error} />

      {active ? (
        <ActiveJob job={active} me={shift.position} busy={busy} onAdvance={advance} />
      ) : shift.online ? (
        <>
          {offer && (
            <Card style={{ borderColor: C.gold, borderWidth: 2, gap: 8 }}>
              <Text style={[s.title, { fontSize: 17 }]}>🔔 {t('newOffer')}</Text>
              <Row label={t('toPickup')} value={`${offer.pickupKm.toFixed(1)} ${t('km')}`} />
              <Row label={t('total')} value={fmt(offer.total)} bold />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button title={t('skip')} variant="ghost" onPress={() => setOffer(null)} /></View>
                <View style={{ flex: 1 }}><Button title={t('accept')} onPress={() => claim(offer.orderId)} disabled={busy} /></View>
              </View>
            </Card>
          )}
          <Text style={s.h2}>{t('availableJobs')}</Text>
          {!jobs.length && <Text style={s.muted}>{t('noJobs')}</Text>}
          {jobs.map((j) => (
            <Card key={j.id} style={{ gap: 6 }}>
              {isDriver ? (
                <>
                  <Text style={s.title} numberOfLines={1}>{j.from_name ?? '?'} → {j.to_name ?? '?'}</Text>
                  <Row label={t('toPickup')} value={`${(j.pickupKm ?? 0).toFixed(1)} ${t('km')}`} />
                  <Row label={t('distance')} value={`${Number(j.route_km ?? 0).toFixed(1)} ${t('km')}`} />
                  <Row label={t('total')} value={fmt(j.total)} bold />
                </>
              ) : (
                <>
                  <Text style={s.title}>{j.merchant_name}</Text>
                  <Row label={t('dropoff')} value={j.address ?? '—'} />
                  <Row label={t('courierFee')} value={fmt(j.delivery_fee ?? 0)} bold />
                </>
              )}
              <Button title={t('accept')} onPress={() => claim(j.id)} disabled={busy} />
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function ActiveJob({ job, me, busy, onAdvance }: { job: OrderDetail; me: { lat: number; lon: number } | null; busy: boolean; onAdvance: (s: OrderStatus) => void }) {
  const { t, tr } = useStore();
  const next = NEXT[job.status];
  const taxi = job.kind === 'taxi';

  // Нуқтаҳо: такси — мизоҷ → мақсад; курьер — тарабхона → мизоҷ
  const pickup = taxi ? { lat: job.ride!.from_lat, lon: job.ride!.from_lon } : { lat: job.merchant_lat!, lon: job.merchant_lon! };
  const drop = taxi ? { lat: job.ride!.to_lat, lon: job.ride!.to_lon } : { lat: job.lat!, lon: job.lon! };
  const beforePickup = ['driver_assigned', 'arrived', 'accepted', 'ready'].includes(job.status);
  const target = beforePickup ? pickup : drop;

  return (
    <>
      <Text style={s.h2}>{t('activeJob')} #{job.id}</Text>
      <RouteMap from={pickup} to={drop} driver={me} driverIcon={taxi ? '🚕' : '🛵'} route={job.ride?.geometry ?? [[pickup.lat, pickup.lon], [drop.lat, drop.lon]]} height={280} />
      <Card style={{ gap: 6 }}>
        <Text style={s.title}>{t(`status_${job.status}` as StringKey)}</Text>
        <Row label={`🟢 ${t('pickup')}`} value={taxi ? job.ride!.from_name ?? '—' : job.merchant_name ?? '—'} />
        <Row label={`🔴 ${t('dropoff')}`} value={taxi ? job.ride!.to_name ?? '—' : job.address ?? '—'} />
        {!taxi && job.items.map((x) => <Row key={x.product_id} label={`${tr(x, 'name')} × ${x.qty}`} value="" />)}
        <Row label={taxi ? t('total') : t('courierFee')} value={fmt(taxi ? job.total : job.delivery_fee)} bold />
        {/* Пардохти нақд: аз мизоҷ ҷамъи пурраро гирифтан лозим */}
        {job.payment === 'cash' && <Text style={s.muted}>💵 {t('cash')}: {fmt(job.total)}</Text>}
      </Card>
      <Button title={`🧭 ${t('navigate')}`} variant="ghost" onPress={() => openNavigation(target)} />
      {next ? (
        <Button title={t(`act_${next}` as StringKey)} onPress={() => onAdvance(next)} disabled={busy} />
      ) : job.status === 'accepted' ? (
        <Text style={[s.muted, { textAlign: 'center' }]}>{t('waitKitchen')}</Text>
      ) : null}
      {(job.status === 'driver_assigned' || job.status === 'arrived') && <Button title={t('cancel')} variant="ghost" onPress={() => onAdvance('cancelled')} disabled={busy} />}
    </>
  );
}
