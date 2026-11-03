import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { api } from '../api/client';
import type { GeoPoint } from '../data/mock';
import { startBackgroundLocation, stopBackgroundLocation } from './backgroundLocation';

/** Фосилаи фиристодани GPS ва «зинда будан» (сервер: TTL = 60 с) */
const SEND_EVERY_MS = 5000;
const HEARTBEAT_MS = 30000;

export type Shift = {
  online: boolean;
  /** background — GPS ҳатто вақте барнома пӯшида аст; foreground — танҳо ҳангоми кушода будан */
  mode: 'background' | 'foreground' | null;
  position: GeoPoint | null;
  error: 'denied' | 'unavailable' | null;
  goOnline: () => Promise<void>;
  goOffline: () => Promise<void>;
};

/**
 * Смена: ҳангоми «дар хат» ҷойгиршавӣ ба сервер фиристода мешавад.
 *  • Агар GPS-и пасзамина дастрас бошад (сохтани EAS + иҷозати «Ҳамеша») — онро вазифаи
 *    фоновӣ мефиристад; watch танҳо барои харитаи дохили барнома.
 *  • Вагарна (Expo Go, веб, иҷозат нест) — фиристодан аз watch бо throttle-и 5 с.
 */
export function useCourierShift(): Shift {
  const [online, setOnline] = useState(false);
  const [mode, setMode] = useState<Shift['mode']>(null);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<Shift['error']>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef<{ p: GeoPoint; sentAt: number } | null>(null);
  const pending = useRef<{ p: GeoPoint; timer: ReturnType<typeof setTimeout> } | null>(null);
  const sendFromForeground = useRef(true);

  /**
   * Throttle бо «думча» (trailing): нуқтаҳои зудтар аз 5 с партофта намешаванд —
   * охиринашон дар анҷоми фосила фиристода мешавад.
   */
  const send = useCallback(async (p: GeoPoint, force = false): Promise<void> => {
    const now = Date.now();
    const wait = last.current ? SEND_EVERY_MS - (now - last.current.sentAt) : 0;
    if (!force && wait > 0) {
      if (pending.current) pending.current.p = p;
      else
        pending.current = {
          p,
          timer: setTimeout(() => {
            const q = pending.current!.p;
            pending.current = null;
            void send(q, true);
          }, wait),
        };
      return;
    }
    if (pending.current) {
      // Нуқтаи интизорӣ ҳамеша навтар аст (масалан, ҳангоми heartbeat)
      clearTimeout(pending.current.timer);
      p = pending.current.p;
      pending.current = null;
    }
    last.current = { p, sentAt: now };
    try {
      await api('POST', '/courier/location', p);
    } catch {
      /* шабака нест — кӯшиши навбатӣ бо нуқтаи оянда */
    }
  }, []);

  const stopForeground = useCallback(() => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    sub.current?.remove();
    sub.current = null;
    if (heartbeat.current) clearInterval(heartbeat.current);
    heartbeat.current = null;
  }, []);

  const goOnline = useCallback(async () => {
    setError(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setError('denied');
    try {
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { lat: cur.coords.latitude, lon: cur.coords.longitude };
      setPosition(p);
      await send(p, true);

      const bg = await startBackgroundLocation();
      sendFromForeground.current = !bg;
      setMode(bg ? 'background' : 'foreground');

      sub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: SEND_EVERY_MS, distanceInterval: 10 },
        (loc) => {
          const q = { lat: loc.coords.latitude, lon: loc.coords.longitude };
          setPosition(q);
          if (sendFromForeground.current) void send(q);
        },
      );
      if (!bg) heartbeat.current = setInterval(() => last.current && void send(last.current.p, true), HEARTBEAT_MS);
      setOnline(true);
    } catch {
      stopForeground();
      setError('unavailable');
    }
  }, [send, stopForeground]);

  const goOffline = useCallback(async () => {
    stopForeground();
    await stopBackgroundLocation();
    setOnline(false);
    setMode(null);
    try {
      await api('POST', '/courier/offline');
    } catch {
      /* сервер худаш баъд аз 60 с курьерро «офлайн» мешуморад */
    }
  }, [stopForeground]);

  useEffect(() => stopForeground, [stopForeground]);
  return { online, mode, position, error, goOnline, goOffline };
}
