const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

/** Base WebSocket / HTTP origin shared across all API calls. */
export const BASE_URL: string = configuredSocketUrl || window.location.origin;

/** Trailing-slash-stripped BASE_URL for direct path concatenation. */
export const API: string = BASE_URL.replace(/\/$/, '');
