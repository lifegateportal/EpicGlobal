import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { BASE_URL, API } from '../api/client';
import type { TelemetryPoint } from '../types';

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function normalizeTelemetry(payload: Record<string, unknown>): TelemetryPoint {
  return {
    time: String(payload?.timestamp ?? new Date().toLocaleTimeString('en-GB', { hour12: false })),
    cpu: clampPercent(payload?.cpu),
    ram: clampPercent(payload?.ram),
  };
}

type TelemetryState = {
  serverConnected: boolean;
  connectionStatusLabel: string;
  connectionStatusDetail: string;
  performanceData: TelemetryPoint[];
};

export function useTelemetry(enabled: boolean): TelemetryState {
  const [serverConnected, setServerConnected] = useState(false);
  const [connectionStatusLabel, setConnectionStatusLabel] = useState('Disconnected');
  const [connectionStatusDetail, setConnectionStatusDetail] = useState(
    `Telemetry endpoint: ${BASE_URL}`
  );
  const [performanceData, setPerformanceData] = useState<TelemetryPoint[]>([
    { time: '00:00', cpu: 0, ram: 0 },
  ]);

  const appendPoint = useCallback((point: TelemetryPoint) => {
    setPerformanceData((prev) => {
      const next = [...prev, point];
      if (next.length > 15) next.shift();
      return next;
    });
  }, []);

  // WebSocket connection for live telemetry
  useEffect(() => {
    if (!enabled) return;

    let hasShownConnectError = false;
    setConnectionStatusLabel('Connecting');
    setConnectionStatusDetail(`Connecting to ${BASE_URL}`);

    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      autoConnect: false,
    });

    socket.on('connect', () => {
      setServerConnected(true);
      setConnectionStatusLabel('Connected');
      setConnectionStatusDetail(`Connected to ${BASE_URL}`);
      toast.success('Secure link established to nyc-1.');
      socket.emit('telemetry_request');
    });

    socket.on('disconnect', (reason) => {
      setServerConnected(false);
      setConnectionStatusLabel('Disconnected');
      setConnectionStatusDetail(`Socket closed: ${reason}`);
      toast.error(`Connection to nyc-1 lost: ${reason}.`);
    });

    socket.on('connect_error', (error) => {
      const message = error.message || 'Unknown connection error';
      setServerConnected(false);
      setConnectionStatusLabel('Disconnected');
      setConnectionStatusDetail(`Unable to reach ${BASE_URL}: ${message}`);
      console.error('Socket connection failed', { BASE_URL, message, error });
      if (!hasShownConnectError) {
        toast.error(`Telemetry unavailable: ${message}.`);
        hasShownConnectError = true;
      }
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionStatusLabel('Connecting');
      setConnectionStatusDetail(`Retrying ${BASE_URL} (attempt ${attempt})`);
    });

    socket.on('telemetry', (data) => {
      appendPoint(normalizeTelemetry(data));
    });

    // Connect only after all handlers are attached to avoid missing the first payload.
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [enabled, appendPoint]);

  // REST polling fallback for environments where WS events are intermittent
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/orchestrator/telemetry?ts=${Date.now()}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (!cancelled && data?.success && data?.telemetry) {
          appendPoint(normalizeTelemetry(data.telemetry));
        }
      } catch {
        // Silent; WebSocket connection may still be active.
      }
    };

    poll();
    const interval = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, appendPoint]);

  return { serverConnected, connectionStatusLabel, connectionStatusDetail, performanceData };
}
