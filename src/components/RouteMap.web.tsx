import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { GeoPoint } from '../data/mock';
import { C } from './ui';
import type { RouteMapProps } from './RouteMap';

/**
 * Версияи веб (react-native-maps веб-ро дастгирӣ намекунад): нақшаи схематикӣ
 * бо проексияи равшан (equirectangular) — танҳо барои санҷиш дар браузер.
 * x = (λ − λ_min)·cos φ₀,  y = φ_max − φ
 */
const BOUNDS = { minLat: 38.52, maxLat: 38.62, minLon: 68.72, maxLon: 68.86 };
const COS = Math.cos((38.57 * Math.PI) / 180);

export default function RouteMap({ from, to, driver, route, onPick, height = 260 }: RouteMapProps) {
  const [w, setW] = useState(0);
  const ref = useRef<React.ComponentRef<typeof Pressable>>(null);
  const spanX = (BOUNDS.maxLon - BOUNDS.minLon) * COS;
  const spanY = BOUNDS.maxLat - BOUNDS.minLat;
  const toXY = (p: GeoPoint) => ({ x: (((p.lon - BOUNDS.minLon) * COS) / spanX) * w, y: ((BOUNDS.maxLat - p.lat) / spanY) * height });
  const fromXY = (x: number, y: number): GeoPoint => ({ lat: BOUNDS.maxLat - (y / height) * spanY, lon: BOUNDS.minLon + ((x / w) * spanX) / COS });

  const segs: React.ReactNode[] = [];
  if (w && route && route.length > 1)
    for (let i = 1; i < route.length; i++) {
      const a = toXY({ lat: route[i - 1][0], lon: route[i - 1][1] });
      const b = toXY({ lat: route[i][0], lon: route[i][1] });
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      segs.push(
        <View
          key={i}
          style={{ position: 'absolute', left: (a.x + b.x) / 2 - len / 2, top: (a.y + b.y) / 2 - 2.5, width: len, height: 5, borderRadius: 3, backgroundColor: C.primary, transform: [{ rotate: `${ang}rad` }] }}
        />,
      );
    }

  const pin = (p: GeoPoint | null | undefined, emoji: string, label: string) => {
    if (!p || !w) return null;
    const { x, y } = toXY(p);
    return (
      <Text key={label} accessibilityLabel={label} style={{ position: 'absolute', left: x - 12, top: y - 26, fontSize: 22 }}>
        {emoji}
      </Text>
    );
  };

  return (
    <Pressable
      testID="route-map"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      ref={ref}
      onPress={
        onPick
          ? (e) => {
              // react-native-web: locationX нест — аз pageX ва ҳудуди элемент ҳисоб мекунем
              const el = ref.current as unknown as HTMLElement | null;
              const rect = el?.getBoundingClientRect?.();
              const { pageX, pageY } = e.nativeEvent;
              if (!rect || !Number.isFinite(pageX) || !Number.isFinite(pageY)) return;
              const x = pageX - (rect.left + window.scrollX);
              const y = pageY - (rect.top + window.scrollY);
              onPick(fromXY(x, y));
            }
          : undefined
      }
      style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#E3EEF9', borderWidth: 1, borderColor: C.line }}
    >
      {/* Дарёи Душанбе (тахминӣ) — барои мавқеъшиносӣ */}
      {w ? <View style={{ position: 'absolute', left: toXY({ lat: 0, lon: 68.775 }).x, top: 0, width: 4, height, backgroundColor: '#B9D4F0' }} /> : null}
      {segs}
      {pin(from, '🟢', 'from')}
      {pin(to, '🔴', 'to')}
      {pin(driver, '🚕', 'driver')}
      <View style={{ position: 'absolute', right: 6, bottom: 4 }}>
        <Text style={{ fontSize: 10, color: C.muted }}>web preview</Text>
      </View>
    </Pressable>
  );
}
