import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const C = {
  bg: '#F5F6F8',
  card: '#FFFFFF',
  text: '#16181D',
  muted: '#6B7280',
  line: '#E5E7EB',
  primary: '#0F9D58', // сабзи парчами ТҶ
  accent: '#D32F2F', // сурх
  gold: '#F2B705',
};

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={s.headerSide}>
          <Text style={s.back}>‹</Text>
        </Pressable>
      ) : (
        <View style={s.headerSide} />
      )}
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[s.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({ title, onPress, disabled, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'ghost' }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        variant === 'ghost' && s.btnGhost,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[s.btnText, variant === 'ghost' && { color: C.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function QtyStepper({ qty, onMinus, onPlus }: { qty: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={onMinus} style={s.stepBtn} hitSlop={6}>
        <Text style={s.stepTxt}>−</Text>
      </Pressable>
      <Text style={s.qty}>{qty}</Text>
      <Pressable onPress={onPlus} style={s.stepBtn} hitSlop={6}>
        <Text style={s.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && s.bold]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.bold]}>{value}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  headerSide: { width: 56, justifyContent: 'center' },
  back: { fontSize: 32, color: C.text, marginTop: -4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: C.text },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.line },
  btn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.primary },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginRight: 8 },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.text, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 10 },
  stepBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 18, color: C.primary, fontWeight: '700' },
  qty: { minWidth: 20, textAlign: 'center', fontWeight: '600', color: C.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { color: C.muted, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14 },
  bold: { fontWeight: '700', color: C.text, fontSize: 16 },
  h2: { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 10 },
  muted: { color: C.muted, fontSize: 13 },
  title: { fontSize: 15, fontWeight: '600', color: C.text },
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 16, gap: 12 },
  emoji: { fontSize: 30 },
});

export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
      <ActivityIndicator color={C.primary} size="large" />
      {text ? <Text style={s.muted}>{text}</Text> : null}
    </View>
  );
}

export function ErrorView({ text, retryLabel, onRetry }: { text: string; retryLabel: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 40 }}>⚠️</Text>
      <Text style={[s.muted, { textAlign: 'center', fontSize: 15 }]}>{text}</Text>
      <View style={{ width: 180 }}>
        <Button title={retryLabel} onPress={onRetry} variant="ghost" />
      </View>
    </View>
  );
}

export function ErrorBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={{ backgroundColor: '#FDECEA', borderRadius: 10, padding: 10 }}>
      <Text style={{ color: C.accent, fontSize: 14 }}>{text}</Text>
    </View>
  );
}
