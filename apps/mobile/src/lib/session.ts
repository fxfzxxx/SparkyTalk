import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'sparkytalk.devUser';
let current: string | null = null;

// expo-secure-store has no web implementation; the web preview keeps the username in localStorage.
const store =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
        setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
        deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
      }
    : SecureStore;

/** Dev-mode identity until real auth lands: the username sent as x-dev-user-id. */
export function getUserId(): string | null {
  return current;
}

export async function loadSession(): Promise<string | null> {
  current = await store.getItemAsync(KEY);
  return current;
}

export async function setSession(userId: string): Promise<void> {
  current = userId.trim() || null;
  if (current) await store.setItemAsync(KEY, current);
  else await store.deleteItemAsync(KEY);
}
