import { createApiClient } from '@sparkytalk/shared';

import { getUserId } from '@/lib/session';

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  getUserId,
});
