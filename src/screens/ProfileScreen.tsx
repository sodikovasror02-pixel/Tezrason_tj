import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { API_URL } from '../api/client';
import { Button, Card, Chip, Row, s } from '../components/ui';

export default function ProfileScreen() {
  const { t, lang, setLang, orders, user, signOut, deliveryAddress } = useStore();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={[s.h2, { fontSize: 22 }]}>{t('profile')}</Text>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 56 }}>👤</Text>
        <Text style={s.title}>{user?.name ?? user?.phone}</Text>
        <Text style={s.muted}>{user?.phone}</Text>
      </Card>
      <Card>
        <Row label={t('address')} value={deliveryAddress?.label ?? '—'} />
        <Row label={t('orders')} value={String(orders.length)} />
        {__DEV__ ? <Row label="API" value={API_URL} /> : null}
      </Card>
      <Text style={s.title}>{t('language')}</Text>
      <View style={{ flexDirection: 'row' }}>
        <Chip label="Тоҷикӣ" active={lang === 'tj'} onPress={() => setLang('tj')} />
        <Chip label="Русский" active={lang === 'ru'} onPress={() => setLang('ru')} />
      </View>
      <View style={{ marginTop: 12 }}>
        <Button title={t('logout')} variant="ghost" onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}
