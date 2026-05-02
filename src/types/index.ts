export type TelemetryPoint = { time: string; cpu: number; ram: number };

export type ProjectHealth = {
  status: 'online' | 'stopped' | 'errored' | 'launching' | string;
  uptime: number | null;
  restarts: number;
  memory: number;
  cpu: number;
};

export type Project = {
  port: number;
  repoUrl: string;
  domain?: string;
  health: ProjectHealth;
};

export type HistoryEntry = {
  id: number;
  projectName: string;
  status: 'success' | 'failed' | 'deleted';
  timestamp: string;
  details: Record<string, string | number> & { strategy?: string };
};

export type QueueSnapshot = {
  running: { id: string; projectName: string; startedAt: string } | null;
  queued: Array<{ id: string; projectName: string; enqueuedAt: string; position: number }>;
  totalQueued: number;
};

export type BackupManifest = {
  backupId: string;
  createdAt: string | null;
  includeDeployments: boolean;
};

export type WatchdogEntry = {
  status: 'ok' | 'failing' | 'healed' | 'down';
  url: string;
  checkedAt: string;
  healedAt?: string;
  lastError?: string;
  consecutiveFails?: number;
};

export type AlertConfig = {
  telegram: boolean;
  discord: boolean;
  telegramChatId: string | null;
};
