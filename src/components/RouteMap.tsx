import React, { useEffect, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { GeoPoint } from '../data/mock';
import { C } from './ui';

export type RouteMapProps = {
  from?: GeoPoint | null;
  to?: GeoPoint | null;
  driver?: GeoPoint | null;
  /** [[lat, lon], …] */
  route?: [number, number][] | null;
  onPick?: (p: GeoPoint) => void;
  height?: number;
};

/** Маркази Душанбе */
export const DUSHANBE = { latitude: 38.5737, longitude: 68.7738, latitudeDelta: 0.08, longitudeDelta: 0.08 };

const ll = (p: GeoPoint) => ({ latitude: p.lat, longitude: p.lon });

/**
 * Харита (iOS — Apple Maps, Android — Google Maps).
 * Барои сохтани APK калиди Google Maps лозим аст: GOOGLE_MAPS_API_KEY (ниг. app.config.js).
 */
export default function RouteMap({ from, to, driver, route, onPick, height = 260 }: RouteMapProps) {
  const ref = useRef<MapView>(null);

  // Ҳамаи нуқтаҳоро дар экран ҷой медиҳем
  const key = JSON.stringify([from, to, route?.length, !!driver]);
  useEffect(() => {
    const pts = [from, to, driver].filter(Boolean).map((p) => ll(p as GeoPoint));
    if (route?.length) pts.push(...route.map(([lat, lon]) => ({ latitude: lat, longitude: lon })));
    if (pts.length >= 2) ref.current?.fitToCoordinates(pts, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true });
    else if (pts.length === 1) ref.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <MapView
      ref={ref}
      style={{ height, borderRadius: 14 }}
      initialRegion={DUSHANBE}
      showsUserLocation
      onPress={onPick ? (e) => onPick({ lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude }) : undefined}
    >
      {route && route.length > 1 && (
        <Polyline coordinates={route.map(([lat, lon]) => ({ latitude: lat, longitude: lon }))} strokeColor={C.primary} strokeWidth={5} />
      )}
      {from && <Marker coordinate={ll(from)} pinColor="green" />}
      {to && <Marker coordinate={ll(to)} pinColor="red" />}
      {driver && <Marker coordinate={ll(driver)} pinColor="gold" title="🚕" />}
    </MapView>
  );
}
