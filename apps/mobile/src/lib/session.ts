import * as SecureStore from 'expo-secure-store';

const KEY = 'sparkytalk.devUser';
let current: string | null = null;

/** Dev-mode identity until real auth lands: the username sent as x-dev-user-id. */
export function getUserId(): string | null {
  return current;
}

export async function loadSession(): Promise<string | null> {
  current = await SecureStore.getItemAsync(KEY);
  return current;
}

export async function setSession(userId: string): Promise<void> {
  current = userId.trim() || null;
  if (current) await SecureStore.setItemAsync(KEY, current);
  else await SecureStore.deleteItemAsync(KEY);
}
