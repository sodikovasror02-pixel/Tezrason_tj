import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { CUSTOMER_CANCELLABLE, STATUS_FLOW, useApi, useStore } from '../state/store';
import { api } from '../api/client';
import type { OrderDetail } from '../api/types';
import { Button, C, Card, ErrorView, Header, Loading, Row, s } from '../components/ui';
import RouteMap from '../components/RouteMap';
import { fmt } from '../data/pricing';
import type { StringKey } from '../i18n/strings';

/** Тафсилоти фармоиш: харита бо масир ва ронанда (такси), таркиб (хӯрок/маркет) */
export default function OrderScreen({ nav, id }: { nav: Nav; id: number }) {
  const { t, tr, orders, driverLocations, errText } = useStore();
  const { data: o, error, loading, reload } = useApi<OrderDetail>(`/orders/${id}`);

  // Ҳолат аз WebSocket тағйир ёфт → тафсилотро нав мекунем (driver_id ва ғ.)
  const liveStatus = orders.find((x) => x.id === id)?.status;
  useEffect(() => {
    if (o && liveStatus && liveStatus !== o.status) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus]);

  if (!o)
    return (
      <View style={s.screen}>
        <Header title={`${t('order')} #${id}`} onBack={nav.back} />
        {loading || !error ? <Loading text={t('loading')} /> : <ErrorView text={errText(error)} retryLabel={t('retry')} onRetry={reload} />}
      </View>
    );

  const status = liveStatus ?? o.status;
  const flow = STATUS_FLOW[o.kind];
  const step = flow.indexOf(status);
  const driver = driverLocations[id] ?? o.driverLocation;
  const showDriver = ['driver_assigned', 'arrived', 'in_progress', 'picked_up'].includes(status);

  const cancel = async () => {
    try {
      await api('POST', `/orders/${id}/status`, { status: 'cancelled' });
    } finally {
      void reload();
    }
  };

  return (
    <View style={s.screen}>
      <Header title={`${t('order')} #${id}`} onBack={nav.back} />
      <ScrollView contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        {o.ride && (
          <RouteMap
            from={{ lat: o.ride.from_lat, lon: o.ride.from_lon }}
            to={{ lat: o.ride.to_lat, lon: o.ride.to_lon }}
            route={o.ride.geometry}
            driver={showDriver ? driver : null}
            driverIcon={o.kind === 'taxi' ? '🚕' : '🛵'}
            height={300}
          />
        )}

        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {flow.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: status !== 'cancelled' && i <= step ? C.primary : C.line }} />
            ))}
          </View>
          <Text style={[s.title, { color: status === 'cancelled' ? C.accent : C.text }]}>{t(`status_${status}` as StringKey)}</Text>
          {showDriver && driver && o.kind === 'taxi' && <Text style={s.muted}>🚕 {t('driverOnMap')}</Text>}
        </Card>

        {o.ride ? (
          <Card>
            <Row label={`🟢 ${t('from')}`} value={o.ride.from_name ?? '—'} />
            <Row label={`🔴 ${t('to')}`} value={o.ride.to_name ?? '—'} />
            <Row label={t('distance')} value={`${Number(o.ride.route_km).toFixed(2)} ${t('km')}`} />
            <Row label={t('duration')} value={`${Number(o.ride.minutes).toFixed(0)} ${t('min')}`} />
            <Row label={t('total')} value={fmt(o.total)} bold />
          </Card>
        ) : (
          <Card>
            <Text style={[s.title, { marginBottom: 6 }]}>{o.merchant_name ?? t('items')}</Text>
            {o.items.map((x) => (
              <Row key={x.product_id} label={`${tr(x, 'name')} × ${x.qty}`} value={fmt(x.price * x.qty)} />
            ))}
            <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
            <Row label={t('delivery')} value={fmt(o.delivery_fee)} />
            <Row label={t('serviceFee')} value={fmt(o.service_fee)} />
            <Row label={t('total')} value={fmt(o.total)} bold />
          </Card>
        )}

        {CUSTOMER_CANCELLABLE.includes(status) && <Button title={t('cancel')} variant="ghost" onPress={cancel} />}
      </ScrollView>
    </View>
  );
}
