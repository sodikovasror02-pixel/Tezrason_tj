import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from '../state/store';
import { Card, Chip, Row, s } from '../components/ui';

export default function ProfileScreen() {
  const { t, lang, setLang, orders } = useStore();
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Text style={[s.h2, { fontSize: 22 }]}>{t('profile')}</Text>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 56 }}>👤</Text>
        <Text style={s.title}>Меҳмон</Text>
        <Text style={s.muted}>+992 •• ••• ••••</Text>
      </Card>
      <Card>
        <Row label={t('address')} value={t('addressDefault')} />
        <Row label={t('orders')} value={String(orders.length)} />
      </Card>
      <Text style={s.title}>{t('language')}</Text>
      <View style={{ flexDirection: 'row' }}>
        <Chip label="Тоҷикӣ" active={lang === 'tj'} onPress={() => setLang('tj')} />
        <Chip label="Русский" active={lang === 'ru'} onPress={() => setLang('ru')} />
      </View>
    </ScrollView>
  );
}
