import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Nav } from '../nav';
import { useApi, useStore } from '../state/store';
import { api } from '../api/client';
import type { Address, Point } from '../api/types';
import { Button, C, Card, Chip, ErrorBanner, ErrorView, Header, Loading, s } from '../components/ui';
import RouteMap from '../components/RouteMap';
import { useMyLocation } from '../hooks/useMyLocation';
import { DUSHANBE_CENTER } from '../data/mock';

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 12, fontSize: 15, color: C.text } as const;

/** Тафсилоти суроға барои курьер: «дар. 2 · ош. 4 · хона 17» */
export function addressDetails(a: Pick<Address, 'entrance' | 'floor' | 'apartment'>, t: (k: 'entranceShort' | 'floorShort' | 'aptShort') => string) {
  return [a.entrance && `${t('entranceShort')} ${a.entrance}`, a.floor && `${t('floorShort')} ${a.floor}`, a.apartment && `${t('aptShort')} ${a.apartment}`].filter(Boolean).join(' · ');
}

/** Майдони хурд. Берун аз компонент — вагарна ҳар render онро аз нав месозад ва фокус гум мешавад. */
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.muted}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} style={input} maxLength={20} accessibilityLabel={label} />
    </View>
  );
}

/** Рӯйхати суроғаҳои нигоҳдошташуда: интихоб / нест кардан / илова */
export default function AddressesScreen({ nav }: { nav: Nav }) {
  const { t, deliveryAddress, setDeliveryAddress, errText } = useStore();
  const { data, error, loading, reload } = useApi<Address[]>('/addresses');
  const [err, setErr] = useState<string | null>(null);

  const remove = async (a: Address) => {
    try {
      await api('DELETE', `/addresses/${a.id}`);
      if (deliveryAddress?.id === a.id) setDeliveryAddress(null);
      await reload();
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <View style={s.screen}>
      <Header title={t('myAddresses')} onBack={nav.back} />
      {loading && !data ? (
        <Loading text={t('loading')} />
      ) : error && !data ? (
        <ErrorView text={errText(error)} retryLabel={t('retry')} onRetry={reload} />
      ) : (
        <ScrollView contentContainerStyle={s.pad}>
          {!data?.length && <Text style={s.muted}>{t('noAddresses')}</Text>}
          {data?.map((a) => {
            const selected = deliveryAddress?.id === a.id;
            return (
              <Card
                key={a.id}
                onPress={() => {
                  setDeliveryAddress(a);
                  nav.back();
                }}
                style={{ borderColor: selected ? C.primary : C.line, borderWidth: selected ? 2 : 1, gap: 4 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.title}>{selected ? '✓ ' : ''}{a.label}</Text>
                  <Text onPress={() => void remove(a)} style={{ color: C.accent, fontSize: 13, padding: 4 }} accessibilityRole="button">
                    {t('delete')}
                  </Text>
                </View>
                <Text style={{ color: C.text }}>{a.text}</Text>
                {addressDetails(a, t) ? <Text style={s.muted}>{addressDetails(a, t)}</Text> : null}
              </Card>
            );
          })}
          <ErrorBanner text={err} />
          <Button title={`+ ${t('addAddress')}`} onPress={() => nav.push({ name: 'addressNew' })} />
        </ScrollView>
      )}
    </View>
  );
}

/** Суроғаи нав: нуқта дар харита (ё GPS) + матн + тафсилот барои курьер */
export function AddressNewScreen({ nav }: { nav: Nav }) {
  const { t, setDeliveryAddress, errText } = useStore();
  const me = useMyLocation();
  const [point, setPoint] = useState<Point | null>(null);
  const [label, setLabel] = useState(t('labelHome'));
  const [text, setText] = useState('');
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [apartment, setApartment] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Аввал — ҷойи ҷорӣ (агар иҷозат бошад)
  useEffect(() => {
    if (me.point && !point) setPoint(me.point);
  }, [me.point, point]);

  const save = async () => {
    if (!point) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api<Address>('POST', '/addresses', {
        label: label.trim(), text: text.trim(), ...point,
        entrance: entrance.trim() || null, floor: floor.trim() || null, apartment: apartment.trim() || null, comment: comment.trim() || null,
      });
      setDeliveryAddress(a);
      nav.back();
      nav.back();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.screen}>
      <Header title={t('addAddress')} onBack={nav.back} />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <RouteMap to={point ?? undefined} onPick={setPoint} height={220} />
        <Text style={[s.muted, { textAlign: 'center' }]}>{point ? `📍 ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` : t('tapMapHint')}</Text>
        {me.point && <Button title={`📍 ${t('myLocation')}`} variant="ghost" onPress={() => setPoint(me.point)} />}

        <View style={{ flexDirection: 'row' }}>
          {[t('labelHome'), t('labelWork'), t('labelOther')].map((x) => (
            <Chip key={x} label={x} active={label === x} onPress={() => setLabel(x)} />
          ))}
        </View>
        <Text style={s.muted}>{t('streetHouse')}</Text>
        <TextInput value={text} onChangeText={setText} placeholder={t('streetPlaceholder')} placeholderTextColor={C.muted} style={input} maxLength={200} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field label={t('entrance')} value={entrance} onChange={setEntrance} />
          <Field label={t('floor')} value={floor} onChange={setFloor} />
          <Field label={t('apartment')} value={apartment} onChange={setApartment} />
        </View>
        <Text style={s.muted}>{t('courierComment')}</Text>
        <TextInput value={comment} onChangeText={setComment} placeholder={t('commentPlaceholder')} placeholderTextColor={C.muted} style={[input, { minHeight: 60 }]} multiline maxLength={300} />

        <ErrorBanner text={error} />
        <Button title={t('saveAddress')} onPress={save} disabled={!point || text.trim().length < 3 || busy} />
        {!point && <Text style={[s.muted, { textAlign: 'center' }]}>{t('pickPointFirst')}</Text>}
        <View style={{ height: 8 }} />
        {/* Ҳангоми набудани GPS харита ба маркази Душанбе нигаронида мешавад */}
        {!me.point && !point && <Button title={t('cityCenter')} variant="ghost" onPress={() => setPoint(DUSHANBE_CENTER)} />}
      </ScrollView>
    </View>
  );
}
