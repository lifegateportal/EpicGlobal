const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

/** Base WebSocket / HTTP origin shared across all API calls. */
export const BASE_URL: string = configuredSocketUrl || window.location.origin;

/** Trailing-slash-stripped BASE_URL for direct path concatenation. */
export const API: string = BASE_URL.replace(/\/$/, '');

/** API key sent with every orchestrator request. Set via VITE_ORCHESTRATOR_API_KEY. */
export const ORCHESTRATOR_API_KEY: string = import.meta.env.VITE_ORCHESTRATOR_API_KEY?.trim() || '';

/** Returns headers including the API key for orchestrator fetch calls. */
export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(ORCHESTRATOR_API_KEY ? { 'x-api-key': ORCHESTRATOR_API_KEY } : {}),
    ...extra,
  };
}

/**
 * Drop-in replacement for `fetch` that automatically injects the API key
 * header on any request whose URL contains `/api/orchestrator`.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const isOrchestrator = input.includes('/api/orchestrator');
  if (!isOrchestrator || !ORCHESTRATOR_API_KEY) return fetch(input, init);
  const existingHeaders = init?.headers
    ? (init.headers instanceof Headers
        ? Object.fromEntries((init.headers as Headers).entries())
        : (init.headers as Record<string, string>))
    : {};
  return fetch(input, {
    ...init,
    headers: { 'x-api-key': ORCHESTRATOR_API_KEY, ...existingHeaders },
  });
}
