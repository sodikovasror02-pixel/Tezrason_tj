import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { API_URL } from '../api/client';
import { loadToken } from '../api/tokenStorage';

/**
 * GPS дар пасзамина: курьер метавонад навигаторро кушояд, экранро қулф кунад —
 * ҷойгиршавӣ ба сервер фиристода мешавад.
 *
 * Android: Foreground Service бо огоҳии доимӣ (талаби Google Play).
 * iOS: «Always» иҷозат + UIBackgroundModes=location (ниг. app.config.js).
 * Expo Go ва веб дастгирӣ намекунанд → барнома ба реҷаи foreground мегузарад.
 *
 * Муҳим: defineTask бояд дар сатҳи боло (index.ts) пеш аз render иҷро шавад —
 * система барномаро дар пасзамина бе UI бедор мекунад.
 */
export const COURIER_LOCATION_TASK = 'tezrason-courier-location';

if (Platform.OS !== 'web') {
  try {
    TaskManager.defineTask<{ locations: Location.LocationObject[] }>(COURIER_LOCATION_TASK, async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const last = data.locations[data.locations.length - 1];
      const token = await loadToken();
      if (!token) return;
      try {
        await fetch(`${API_URL}/courier/location`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ lat: last.coords.latitude, lon: last.coords.longitude }),
        });
      } catch {
        /* шабака нест — нуқтаи навбатӣ */
      }
    });
  } catch {
    /* TaskManager дастрас нест (масалан, Expo Go) */
  }
}

/** true — GPS-и пасзамина оғоз шуд; false — танҳо foreground (Expo Go, веб, бе иҷозат) */
export async function startBackgroundLocation(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await TaskManager.isAvailableAsync())) return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return false;
    if (await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK)) return true;
    await Location.startLocationUpdatesAsync(COURIER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000, // Android: ҳар 5 с
      distanceInterval: 10, // ё ҳар 10 м
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.OtherNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Тезрасон — шумо дар хат ҳастед',
        notificationBody: 'Ҷойгиршавӣ барои фармоишҳо фиристода мешавад',
        notificationColor: '#0F9D58',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(COURIER_LOCATION_TASK);
  } catch {
    /* аллакай қатъ шудааст */
  }
}
