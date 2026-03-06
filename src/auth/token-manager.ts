import type { AuthCredentials } from '../types';

const STORAGE_PREFIX = 'auth_';

function storageKey(providerId: string): string {
  return `${STORAGE_PREFIX}${providerId}`;
}

export function isExpired(creds: AuthCredentials): boolean {
  return Date.now() >= creds.expiresAt;
}

export async function saveCredentials(
  providerId: string,
  creds: AuthCredentials,
): Promise<void> {
  const key = storageKey(providerId);
  await chrome.storage.local.set({ [key]: creds });
}

export async function getCredentials(
  providerId: string,
): Promise<AuthCredentials | null> {
  const key = storageKey(providerId);
  const result = await chrome.storage.local.get(key);
  const creds = result[key] as AuthCredentials | undefined;
  if (!creds) return null;
  if (isExpired(creds)) return null;
  return creds;
}

export async function clearCredentials(providerId: string): Promise<void> {
  const key = storageKey(providerId);
  await chrome.storage.local.remove(key);
}

export async function mergeCredentials(
  providerId: string,
  partial: { bearerToken?: string; cookies?: Record<string, string> },
): Promise<void> {
  const key = storageKey(providerId);
  const result = await chrome.storage.local.get(key);
  const existing = (result[key] as AuthCredentials | undefined) ?? {
    cookies: {},
    expiresAt: Date.now() + 86_400_000,
  };

  if (partial.bearerToken) {
    existing.bearerToken = partial.bearerToken;
  }
  if (partial.cookies) {
    existing.cookies = { ...existing.cookies, ...partial.cookies };
  }
  existing.expiresAt = Date.now() + 86_400_000;

  await chrome.storage.local.set({ [key]: existing });
}
