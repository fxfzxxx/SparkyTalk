"use client";

import { createApiClient } from "@sparkytalk/shared";

const USER_KEY = "sparkytalk.devUser";

export function getDevUserId(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function setDevUserId(username: string) {
  try {
    localStorage.setItem(USER_KEY, username);
  } catch {
    // storage unavailable (private mode); the username just won't persist
  }
}

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787",
  getUserId: getDevUserId,
});
