import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { GeoPoint } from '../data/mock';

export type MyLocation = { point: GeoPoint | null; status: 'loading' | 'ok' | 'denied' | 'unavailable' };

/** Ҷойгиршавии ҷорӣ (як маротиба). Бе иҷозат → null, барнома бо нуқтаи пешфарз кор мекунад. */
export function useMyLocation(): MyLocation {
  const [state, setState] = useState<MyLocation>({ point: null, status: 'loading' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) return alive && setState({ point: null, status: 'denied' });
        // Аввал ҷойи охирини маълум (зуд), баъд дақиқ
        const last = await Location.getLastKnownPositionAsync();
        if (last && alive) setState({ point: { lat: last.coords.latitude, lon: last.coords.longitude }, status: 'ok' });
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive) setState({ point: { lat: cur.coords.latitude, lon: cur.coords.longitude }, status: 'ok' });
      } catch {
        if (alive) setState((s) => (s.point ? s : { point: null, status: 'unavailable' }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
