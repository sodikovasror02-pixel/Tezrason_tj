import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Токен дар Keychain (iOS) / Keystore (Android); дар веб — localStorage (танҳо барои development). */
const KEY = 'hizmat.token';

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function saveToken(t: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (t) globalThis.localStorage?.setItem(KEY, t);
      else globalThis.localStorage?.removeItem(KEY);
      return;
    }
    if (t) await SecureStore.setItemAsync(KEY, t);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* нигоҳ доштан нашуд — сессия то бастани барнома боқӣ мемонад */
  }
}
