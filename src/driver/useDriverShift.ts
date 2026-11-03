import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { api } from '../api/client';
import type { GeoPoint } from '../data/mock';

/** Фосилаи фиристодани GPS ва «зинда будан» (сервер: TTL = 60 с) */
const SEND_EVERY_MS = 5000;
const HEARTBEAT_MS = 30000;

export type Shift = {
  online: boolean;
  position: GeoPoint | null;
  error: 'denied' | 'unavailable' | null;
  goOnline: () => Promise<void>;
  goOffline: () => Promise<void>;
};

/**
 * Смена: ҳангоми «дар хат» ҷойгиршавӣ ба сервер фиристода мешавад
 * (на зудтар аз 5 с, ва ҳар 30 с ҳатман — то сервер ронандаро «зинда» донад).
 * Маҳдудият: танҳо вақте барнома кушода аст (foreground).
 */
export function useDriverShift(): Shift {
  const [online, setOnline] = useState(false);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<Shift['error']>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef<{ p: GeoPoint; sentAt: number } | null>(null);

  const pending = useRef<{ p: GeoPoint; timer: ReturnType<typeof setTimeout> } | null>(null);

  /**
   * Throttle бо «думча» (trailing): нуқтаҳои зудтар аз 5 с партофта намешаванд —
   * охиринашон дар анҷоми фосила фиристода мешавад. Вагарна, агар ронанда
   * баъди ҳаракат истад, ҷойи охирин то heartbeat (30 с) ба сервер намерасид.
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
      await api('POST', '/drivers/location', p);
    } catch {
      /* шабака нест — кӯшиши навбатӣ бо нуқтаи оянда */
    }
  }, []);

  const stop = useCallback(() => {
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
      sub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: SEND_EVERY_MS, distanceInterval: 10 },
        (loc) => {
          const q = { lat: loc.coords.latitude, lon: loc.coords.longitude };
          setPosition(q);
          void send(q);
        },
      );
      heartbeat.current = setInterval(() => last.current && void send(last.current.p, true), HEARTBEAT_MS);
      setOnline(true);
    } catch {
      stop();
      setError('unavailable');
    }
  }, [send, stop]);

  const goOffline = useCallback(async () => {
    stop();
    setOnline(false);
    try {
      await api('POST', '/drivers/offline');
    } catch {
      /* сервер худаш баъд аз 60 с ронандаро «мурда» мешуморад */
    }
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { online, position, error, goOnline, goOffline };
}
