import React, { useEffect } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Nav } from '../nav';
import { CUSTOMER_CANCELLABLE, STATUS_FLOW, useApi, useStore } from '../state/store';
import { api } from '../api/client';
import type { OrderDetail } from '../api/types';
import { Button, C, Card, ErrorView, Header, Loading, Row, s } from '../components/ui';
import RouteMap from '../components/RouteMap';
import { fmt } from '../data/pricing';
import type { StringKey } from '../i18n/strings';
import { addressDetails } from './AddressesScreen';
import { openCheckout } from './CartScreen';

const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

/** Тафсилоти фармоиш: харита (тарабхона → мизоҷ + курьер), ETA, курьер, таркиб */
export default function OrderScreen({ nav, id }: { nav: Nav; id: number }) {
  const { t, tr, orders, courierLocations, errText } = useStore();
  const { data: o, error, loading, reload } = useApi<OrderDetail>(`/orders/${id}`);

  // Ҳолат ё курьер аз WebSocket тағйир ёфт → тафсилотро нав мекунем
  const live = orders.find((x) => x.id === id);
  useEffect(() => {
    if (o && live && (live.status !== o.status || live.courier_id !== o.courier_id)) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.status, live?.courier_id]);

  if (!o)
    return (
      <View style={s.screen}>
        <Header title={`${t('order')} #${id}`} onBack={nav.back} />
        {loading || !error ? <Loading text={t('loading')} /> : <ErrorView text={errText(error)} retryLabel={t('retry')} onRetry={reload} />}
      </View>
    );

  const status = live?.status ?? o.status;
  const step = STATUS_FLOW.indexOf(status);
  const courier = courierLocations[id] ?? o.courierLocation;
  const active = !['delivered', 'cancelled'].includes(status);

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
        <RouteMap
          from={{ lat: o.merchant_lat, lon: o.merchant_lon }}
          to={{ lat: o.lat, lon: o.lon }}
          driver={active && o.courier_id ? courier : null}
          driverIcon="🛵"
          height={240}
        />

        <Card style={{ gap: 8 }}>
          {status !== 'awaiting_payment' && status !== 'cancelled' && (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {STATUS_FLOW.map((_, i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? C.primary : C.line }} />
              ))}
            </View>
          )}
          <Text style={[s.title, { fontSize: 17, color: status === 'cancelled' ? C.accent : C.text }]}>{t(`status_${status}` as StringKey)}</Text>
          {active && o.eta_at && status !== 'awaiting_payment' && (
            <Text style={{ color: C.primary, fontWeight: '700' }}>⏱ {t('etaAt')} {hhmm(o.eta_at)}</Text>
          )}
          {o.payment_status === 'refunded' && <Text style={s.muted}>💳 {t('refunded')}</Text>}
        </Card>

        {status === 'awaiting_payment' && o.checkoutUrl && (
          <Button title={`💳 ${t('payNow')} · ${fmt(o.total)}`} onPress={() => void openCheckout(o.checkoutUrl!)} />
        )}

        {o.courier_id && active && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 28 }}>🛵</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{o.courier_name ?? t('courier')}</Text>
              <Text style={s.muted}>{courier ? t('courierOnMap') : t('courierAssigned')}</Text>
            </View>
            {o.courier_phone && (
              <Text onPress={() => void Linking.openURL(`tel:${o.courier_phone}`)} style={{ color: C.primary, fontWeight: '700', padding: 8 }} accessibilityRole="button">
                📞 {t('call')}
              </Text>
            )}
          </Card>
        )}

        <Card>
          <Text style={[s.title, { marginBottom: 6 }]}>{o.merchant_name}</Text>
          {o.items.map((x) => (
            <Row key={x.product_id} label={`${tr(x, 'name')} × ${x.qty}`} value={fmt(x.price * x.qty)} />
          ))}
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
          <Row label={t('delivery')} value={fmt(o.delivery_fee)} />
          <Row label={t('serviceFee')} value={fmt(o.service_fee)} />
          <Row label={`${t('total')} (${o.payment === 'card' ? t('card') : t('cash')})`} value={fmt(o.total)} bold />
        </Card>

        <Card style={{ gap: 2 }}>
          <Text style={s.muted}>{t('address')}</Text>
          <Text style={{ color: C.text }}>{o.address}</Text>
          {addressDetails(o, t) ? <Text style={s.muted}>{addressDetails(o, t)}</Text> : null}
          {o.comment ? <Text style={s.muted}>💬 {o.comment}</Text> : null}
        </Card>

        {CUSTOMER_CANCELLABLE.includes(status) && <Button title={t('cancel')} variant="ghost" onPress={cancel} />}
      </ScrollView>
    </View>
  );
}
