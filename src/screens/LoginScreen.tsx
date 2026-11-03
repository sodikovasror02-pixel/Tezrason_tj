import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import type { User } from '../api/types';
import { useStore } from '../state/store';
import { Button, C, Chip, ErrorBanner, s } from '../components/ui';

const input = { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, fontSize: 18, color: C.text } as const;

export default function LoginScreen() {
  const { t, lang, setLang, signIn, errText } = useStore();
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = `+992${digits}`;

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

  const requestCode = () =>
    run(async () => {
      const r = await api<{ ok: true; devCode?: string }>('POST', '/auth/otp/request', { phone });
      setDevCode(r.devCode ?? null);
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      const r = await api<{ token: string; user: User }>('POST', '/auth/otp/verify', { phone, code });
      await signIn(r.token, r.user);
    });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.screen, { justifyContent: 'center' }]}>
      <View style={[s.pad, { gap: 14 }]}>
        <Text style={{ fontSize: 34, fontWeight: '800', color: C.primary }}>{t('appName')}</Text>
        <Text style={s.h2}>{t('login')}</Text>

        {step === 'phone' ? (
          <>
            <Text style={s.muted}>{t('loginHint')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>+992</Text>
              <TextInput
                style={[input, { flex: 1, minWidth: 0 }]}
                keyboardType="phone-pad"
                maxLength={9}
                placeholder="90 123 4567"
                placeholderTextColor={C.muted}
                value={digits}
                onChangeText={(v) => setDigits(v.replace(/\D/g, ''))}
                autoFocus
              />
            </View>
            <ErrorBanner text={error} />
            <Button title={t('getCode')} onPress={requestCode} disabled={digits.length !== 9 || busy} />
          </>
        ) : (
          <>
            <Text style={s.muted}>{t('codeSent').replace('{phone}', phone)}</Text>
            <TextInput
              style={[input, { letterSpacing: 8, textAlign: 'center' }]}
              keyboardType="number-pad"
              maxLength={6}
              placeholder={t('enterCode')}
              placeholderTextColor={C.muted}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              autoFocus
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />
            {devCode ? <Text style={s.muted}>{t('devCode')}: {devCode}</Text> : null}
            <ErrorBanner text={error} />
            <Button title={t('confirm')} onPress={verify} disabled={code.length !== 6 || busy} />
            <Button title={t('changePhone')} variant="ghost" onPress={() => { setStep('phone'); setCode(''); setError(null); }} />
          </>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12 }}>
          <Chip label="Тоҷикӣ" active={lang === 'tj'} onPress={() => setLang('tj')} />
          <Chip label="Русский" active={lang === 'ru'} onPress={() => setLang('ru')} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
