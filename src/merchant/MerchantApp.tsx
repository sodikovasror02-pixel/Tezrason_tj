import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, Vibration, View } from 'react-native';
import { api } from '../api/client';
import type { MerchantWithMenu, Order, OrderStatus, Product } from '../api/types';
import { FINAL_STATUSES, useStore } from '../state/store';
import { Button, C, Card, Chip, ErrorBanner, Loading, Row, s } from '../components/ui';
import { fmt } from '../data/pricing';
import type { StringKey } from '../i18n/strings';

const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const input = { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: C.text } as const;

/** Панели тарабхона (нақши merchant): Фармоишҳо · Меню · Танзимот */
export default function MerchantApp() {
  const { t, orders } = useStore();
  const [tab, setTab] = useState<'orders' | 'menu' | 'settings'>('orders');
  const newCount = orders.filter((o) => o.status === 'created').length;

  // Фармоиши нав → ларзиш (дар телефон)
  const prevNew = useRef(newCount);
  useEffect(() => {
    if (newCount > prevNew.current && Platform.OS !== 'web') Vibration.vibrate([0, 300, 150, 300]);
    prevNew.current = newCount;
  }, [newCount]);

  const tabs = [
    { key: 'orders', icon: '📋', label: newCount ? `${t('orders')} (${newCount})` : t('orders') },
    { key: 'menu', icon: '🍽', label: t('menu') },
    { key: 'settings', icon: '⚙️', label: t('settings') },
  ] as const;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{tab === 'orders' ? <Orders /> : tab === 'menu' ? <Menu /> : <Settings />}</View>
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

// ───────────── Фармоишҳо ─────────────

const SECTIONS: { status: OrderStatus; title: StringKey }[] = [
  { status: 'created', title: 'secNew' },
  { status: 'accepted', title: 'secKitchen' },
  { status: 'ready', title: 'secReady' },
  { status: 'picked_up', title: 'secOnWay' },
];

function Orders() {
  const { t, orders, ordersLoading, refreshOrders, errText, wsConnected } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, tickMinute] = useState(0);

  useEffect(() => {
    void refreshOrders().catch((e) => setError(errText(e)));
    const h = setInterval(() => tickMinute((x) => x + 1), 30000); // «N дақ пеш» нав шавад
    return () => clearInterval(h);
  }, [refreshOrders, errText]);

  const act = async (o: Order, status: OrderStatus) => {
    setBusyId(o.id);
    setError(null);
    try {
      await api('POST', `/orders/${o.id}/status`, { status });
      await refreshOrders();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  const active = orders.filter((o) => !FINAL_STATUSES.includes(o.status));
  const today = new Date().toDateString();
  const doneToday = orders.filter((o) => o.status === 'delivered' && new Date(o.created_at).toDateString() === today);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={ordersLoading} onRefresh={() => void refreshOrders()} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[s.h2, { fontSize: 22, marginBottom: 0 }]}>📋 {t('orders')}</Text>
        <Text style={[s.muted, { color: wsConnected ? C.primary : C.muted }]}>● {wsConnected ? t('live') : t('offline')}</Text>
      </View>
      <Card style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.muted}>{t('revenueToday')}</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{fmt(doneToday.reduce((x, o) => x + o.subtotal, 0))}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.muted}>{t('ordersToday')}</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{doneToday.length}</Text>
        </View>
      </Card>
      <ErrorBanner text={error} />
      {!active.length && <Text style={[s.muted, { textAlign: 'center', marginTop: 16 }]}>{t('noActiveOrders')}</Text>}

      {SECTIONS.map((sec) => {
        const list = active.filter((o) => o.status === sec.status);
        if (!list.length) return null;
        return (
          <View key={sec.status} style={{ gap: 10 }}>
            <Text style={s.h2}>{t(sec.title)} · {list.length}</Text>
            {list.map((o) => (
              <MerchantOrderCard key={o.id} o={o} busy={busyId === o.id} onAct={(st) => act(o, st)} />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function MerchantOrderCard({ o, busy, onAct }: { o: Order; busy: boolean; onAct: (s: OrderStatus) => void }) {
  const { t, tr } = useStore();
  const isNew = o.status === 'created';
  return (
    <Card style={{ gap: 6, borderColor: isNew ? C.gold : C.line, borderWidth: isNew ? 2 : 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[s.title, { fontSize: 17 }]}>#{o.id}</Text>
        <Text style={s.muted}>{hhmm(o.created_at)} · {minutesAgo(o.created_at)} {t('minAgo')}</Text>
      </View>
      {o.items.map((x) => (
        <Text key={x.product_id} style={{ fontSize: 16, color: C.text }}>
          <Text style={{ fontWeight: '800' }}>{x.qty} ×</Text> {tr(x, 'name')}
        </Text>
      ))}
      {o.comment ? <Text style={s.muted}>💬 {o.comment}</Text> : null}
      <Row label={`${t('subtotal')} · ${o.payment === 'card' ? `💳 ${t('paid')}` : `💵 ${t('cash')}`}`} value={fmt(o.subtotal)} bold />
      {(o.status === 'accepted' || o.status === 'ready') && (
        <Text style={{ color: o.courier_id ? C.primary : C.muted }}>{o.courier_id ? `🛵 ${t('courierAssigned')}` : `⏳ ${t('searchingCourier')}`}</Text>
      )}
      {isNew && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title={t('reject')} variant="ghost" onPress={() => onAct('cancelled')} disabled={busy} /></View>
          <View style={{ flex: 2 }}><Button title={t('acceptOrder')} onPress={() => onAct('accepted')} disabled={busy} /></View>
        </View>
      )}
      {o.status === 'accepted' && <Button title={`✅ ${t('markReady')}`} onPress={() => onAct('ready')} disabled={busy} />}
    </Card>
  );
}

// ───────────── Меню ─────────────

function Menu() {
  const { t, tr, errText } = useStore();
  const [m, setM] = useState<MerchantWithMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try {
      setM(await api<MerchantWithMenu>('GET', '/merchant'));
    } catch (e) {
      setError(errText(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (p: Product, body: Partial<Product>) => {
    setError(null);
    // Оптимистӣ: UI фавран; хато → бозгашт
    setM((x) => x && { ...x, products: x.products.map((q) => (q.id === p.id ? { ...q, ...body } : q)) });
    try {
      await api('PATCH', `/merchant/products/${p.id}`, body);
    } catch (e) {
      setError(errText(e));
      await load();
    }
  };

  if (!m) return error ? <ErrorBanner text={error} /> : <Loading text={t('loading')} />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={[s.h2, { fontSize: 22 }]}>🍽 {t('menu')}</Text>
      <ErrorBanner text={error} />
      {m.products.map((p) => (
        <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: p.available ? 1 : 0.6 }}>
          <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.title}>{tr(p, 'name')}</Text>
            <PriceInput value={p.price} onCommit={(price) => void patch(p, { price })} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Switch value={p.available} onValueChange={(v) => void patch(p, { available: v })} trackColor={{ true: C.primary, false: C.line }} accessibilityLabel={`${tr(p, 'name')}: ${t('inStock')}`} />
            <Text style={[s.muted, { fontSize: 11 }]}>{p.available ? t('inStock') : t('outOfStock')}</Text>
          </View>
        </Card>
      ))}
      {adding ? <NewProduct onDone={async () => { setAdding(false); await load(); }} /> : <Button title={`+ ${t('addProduct')}`} variant="ghost" onPress={() => setAdding(true)} />}
    </ScrollView>
  );
}

/** Нарх дар сомонӣ → дирам. Ҳангоми blur ё Enter сабт мешавад. */
function PriceInput({ value, onCommit }: { value: number; onCommit: (dirams: number) => void }) {
  const [text, setText] = useState(String(value / 100));
  useEffect(() => setText(String(value / 100)), [value]);
  const commit = () => {
    const d = Math.round(parseFloat(text.replace(',', '.')) * 100);
    if (Number.isFinite(d) && d >= 100 && d !== value) onCommit(d);
    else setText(String(value / 100));
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TextInput value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} keyboardType="decimal-pad" style={[input, { width: 90 }]} accessibilityLabel="price" />
      <Text style={s.muted}>c.</Text>
    </View>
  );
}

function NewProduct({ onDone }: { onDone: () => Promise<void> }) {
  const { t, errText } = useStore();
  const [nameTj, setNameTj] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [price, setPrice] = useState('');
  const [emoji, setEmoji] = useState('🍽');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await api('POST', '/merchant/products', { name_tj: nameTj.trim(), name_ru: nameRu.trim() || nameTj.trim(), price: Math.round(parseFloat(price.replace(',', '.')) * 100), emoji });
      await onDone();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={s.title}>{t('addProduct')}</Text>
      <TextInput placeholder={t('nameTj')} placeholderTextColor={C.muted} value={nameTj} onChangeText={setNameTj} style={input} />
      <TextInput placeholder={t('nameRu')} placeholderTextColor={C.muted} value={nameRu} onChangeText={setNameRu} style={input} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput placeholder={t('priceSomoni')} placeholderTextColor={C.muted} value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={[input, { flex: 1 }]} />
        <TextInput value={emoji} onChangeText={setEmoji} style={[input, { width: 60, textAlign: 'center' }]} maxLength={4} />
      </View>
      <ErrorBanner text={error} />
      <Button title={t('save')} onPress={save} disabled={!nameTj.trim() || !(parseFloat(price) >= 1)} />
    </Card>
  );
}

// ───────────── Танзимот ─────────────

function Settings() {
  const { t, errText } = useStore();
  const [m, setM] = useState<MerchantWithMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<MerchantWithMenu>('GET', '/merchant').then(setM, (e) => setError(errText(e)));
  }, [errText]);

  const patch = async (body: { is_open?: boolean; prep_min?: number }) => {
    if (!m) return;
    setError(null);
    const prev = m;
    setM({ ...m, ...body });
    try {
      await api('PATCH', '/merchant', body);
    } catch (e) {
      setM(prev);
      setError(errText(e));
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={[s.h2, { fontSize: 22 }]}>⚙️ {m?.name ?? t('settings')}</Text>
      <ErrorBanner text={error} />
      {m && (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{m.is_open ? `🟢 ${t('openNow')}` : `🔴 ${t('closedNow')}`}</Text>
              <Text style={s.muted}>{t('openHint')}</Text>
            </View>
            <Switch value={m.is_open} onValueChange={(v) => void patch({ is_open: v })} trackColor={{ true: C.primary, false: C.line }} accessibilityLabel={t('openNow')} />
          </Card>
          <Card style={{ gap: 8 }}>
            <Text style={s.title}>⏱ {t('prepTime')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 70 }}><Button title="−5" variant="ghost" onPress={() => void patch({ prep_min: Math.max(5, m.prep_min - 5) })} /></View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, minWidth: 80, textAlign: 'center' }}>{m.prep_min} {t('min')}</Text>
              <View style={{ width: 70 }}><Button title="+5" variant="ghost" onPress={() => void patch({ prep_min: Math.min(180, m.prep_min + 5) })} /></View>
            </View>
            <Text style={s.muted}>{t('prepHint')}</Text>
          </Card>
          <Card>
            <Row label={t('deliveryRadius')} value={`${m.delivery_radius_km} ${t('km')}`} />
            <Row label={t('minOrder')} value={fmt(m.min_order)} />
          </Card>
        </>
      )}
      <AccountBlock />
    </ScrollView>
  );
}

/** Забон ва баромадан (бе ScrollView-и дохилӣ) */
function AccountBlock() {
  const { t, lang, setLang, user, signOut } = useStore();
  return (
    <Card style={{ gap: 8 }}>
      <Row label={t('phone')} value={user?.phone ?? ''} />
      <View style={{ flexDirection: 'row' }}>
        <Chip label="Тоҷикӣ" active={lang === 'tj'} onPress={() => setLang('tj')} />
        <Chip label="Русский" active={lang === 'ru'} onPress={() => setLang('ru')} />
      </View>
      <Button title={t('logout')} variant="ghost" onPress={() => void signOut()} />
    </Card>
  );
}
