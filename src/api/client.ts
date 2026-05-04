const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

/** Base WebSocket / HTTP origin shared across all API calls. */
export const BASE_URL: string = configuredSocketUrl || window.location.origin;

/** Trailing-slash-stripped BASE_URL for direct path concatenation. */
export const API: string = BASE_URL.replace(/\/$/, '');

const LS_KEY = 'eg_orchestrator_api_key';

/** API key sent with every orchestrator request.
 *  Priority: localStorage (user-entered) → VITE_ORCHESTRATOR_API_KEY (build-time) */
export function getOrchestratorApiKey(): string {
  try {
    return localStorage.getItem(LS_KEY)?.trim() || import.meta.env.VITE_ORCHESTRATOR_API_KEY?.trim() || '';
  } catch {
    return import.meta.env.VITE_ORCHESTRATOR_API_KEY?.trim() || '';
  }
}

export function setOrchestratorApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(LS_KEY, key.trim());
    else localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

/** @deprecated use getOrchestratorApiKey() for live value */
export const ORCHESTRATOR_API_KEY: string = import.meta.env.VITE_ORCHESTRATOR_API_KEY?.trim() || '';

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
 * Drop-in replacement for `fetch` that automatically injects the API key
 * header on any request whose URL contains `/api/orchestrator`.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const key = getOrchestratorApiKey();
  const isOrchestrator = input.includes('/api/orchestrator');
  if (!isOrchestrator || !key) return fetch(input, init);
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
