import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Токен дар Keychain (iOS) / Keystore (Android); дар веб — localStorage (танҳо барои development). */
const KEY = 'tezrason.token';
/** AFTER_FIRST_UNLOCK — то вазифаи GPS-и пасзамина токенро ҳангоми қулфи экран хонда тавонад (iOS) */
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export async function loadToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY, OPTS);
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
    if (t) await SecureStore.setItemAsync(KEY, t, OPTS);
    else await SecureStore.deleteItemAsync(KEY, OPTS);
  } catch {
    /* нигоҳ доштан нашуд — сессия то бастани барнома боқӣ мемонад */
  }
}
