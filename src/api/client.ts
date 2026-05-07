const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

function resolveDefaultBaseUrl(): string {
  const host = window.location.hostname.toLowerCase();
  const isEpicGlobalHost = host === 'epicglobal.app' || host === 'www.epicglobal.app';
  const isCloudflarePreview = host.endsWith('.pages.dev');
  if (isEpicGlobalHost || isCloudflarePreview) {
    return 'https://api.epicglobal.app';
  }
  return window.location.origin;
}

/** Base WebSocket / HTTP origin shared across all API calls. */
export const BASE_URL: string = configuredSocketUrl || resolveDefaultBaseUrl();

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
  const baseInit: RequestInit = { ...init, credentials: init?.credentials || 'include' };
  if (!isOrchestrator || !key) return fetch(input, baseInit);
  const existingHeaders = init?.headers
    ? (init.headers instanceof Headers
        ? Object.fromEntries((init.headers as Headers).entries())
        : (init.headers as Record<string, string>))
    : {};
  return fetch(input, {
    ...baseInit,
    headers: { 'x-api-key': key, ...existingHeaders },
  });
}

export type GithubAuthSession = {
  enabled: boolean;
  authenticated: boolean;
  user?: {
    login: string;
    name?: string;
    avatarUrl?: string;
  };
};

export async function getGithubAuthSession(): Promise<GithubAuthSession> {
  const res = await apiFetch(`${API}/api/auth/github/session`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    return { enabled: false, authenticated: false };
  }
  return {
    enabled: Boolean(data.enabled),
    authenticated: Boolean(data.authenticated),
    user: data.user,
  };
}

export async function getGithubAuthConfig(): Promise<{ enabled: boolean }> {
  const res = await apiFetch(`${API}/api/auth/github/config`, { cache: 'no-store' });
  const data = await res.json();
  return { enabled: Boolean(res.ok && data?.success && data?.enabled) };
}

export function startGithubLogin(returnTo?: string): void {
  const target = returnTo || window.location.href;
  const loginUrl = `${API}/api/auth/github/login?returnTo=${encodeURIComponent(target)}`;
  window.location.href = loginUrl;
}

export async function logoutGithub(): Promise<boolean> {
  const res = await apiFetch(`${API}/api/auth/github/logout`, { method: 'POST' });
  const data = await res.json();
  return Boolean(res.ok && data?.success);
}
