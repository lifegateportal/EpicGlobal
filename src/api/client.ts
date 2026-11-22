const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

function resolveDefaultBaseUrl(): string {
  const host = window.location.hostname.toLowerCase();
  const isEpicGlobalHost = host === 'epicglobal.app' || host === 'www.epicglobal.app';
  const isCloudflareHost = host.endsWith('.pages.dev') || host.endsWith('.workers.dev');
  if (isEpicGlobalHost || isCloudflareHost) {
    return 'https://api.epicglobal.app';
  }
  return configuredSocketUrl || window.location.origin;
}

/** Base WebSocket / HTTP origin shared across all API calls. */
export const BASE_URL: string = resolveDefaultBaseUrl();

/** Trailing-slash-stripped BASE_URL for direct path concatenation. */
export const API: string = BASE_URL.replace(/\/$/, '');

const LS_KEY = 'eg_orchestrator_api_key';

/** API key entered by the platform owner and stored in this browser only. */
export function getOrchestratorApiKey(): string {
  try {
    return localStorage.getItem(LS_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setOrchestratorApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(LS_KEY, key.trim());
    else localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new Event('eg-api-key-updated'));
  } catch { /* ignore */ }
}

/** @deprecated use getOrchestratorApiKey() for the browser-entered value */
export const ORCHESTRATOR_API_KEY = '';

/** Returns headers including the API key for orchestrator fetch calls. */
export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = getOrchestratorApiKey();
  return {
    'Content-Type': 'application/json',
    ...(key ? { 'x-api-key': key } : {}),
    ...extra,
  };
}

/**
 * Drop-in replacement for `fetch` that injects the platform key on protected APIs.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const key = getOrchestratorApiKey();
  const isProtectedApi = input.includes('/api/') && !input.includes('/api/shared/');
  if (!isProtectedApi || !key) return fetch(input, init);
  const existingHeaders = init?.headers
    ? (init.headers instanceof Headers
        ? Object.fromEntries((init.headers as Headers).entries())
        : (init.headers as Record<string, string>))
    : {};
  return fetch(input, {
    ...init,
    headers: { 'x-api-key': key, ...existingHeaders },
  });
}
