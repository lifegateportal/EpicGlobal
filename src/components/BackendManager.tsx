import { useState, useEffect, useRef } from 'react';
import { Trash2, RefreshCw, FileText, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertCircle, KeyRound, Download, Upload, ShieldCheck, Bell, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { BASE_URL, API, apiFetch } from '../api/client';
import type { Project, HistoryEntry, QueueSnapshot, BackupManifest, WatchdogEntry, AlertConfig } from '../types';

function StatusBadge({ status }: { status: string }) {
  if (status === 'online') return <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium"><CheckCircle2 size={12} /> Online</span>;
  if (status === 'errored') return <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium"><XCircle size={12} /> Errored</span>;
  if (status === 'launching') return <span className="flex items-center gap-1.5 text-blue-400 text-xs font-medium"><Clock size={12} /> Launching</span>;
  return <span className="flex items-center gap-1.5 text-zinc-500 text-xs font-medium"><AlertCircle size={12} /> Stopped</span>;
}

export default function ProjectOrchestrator() {
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [projectLogs, setProjectLogs] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<QueueSnapshot>({ running: null, queued: [], totalQueued: 0 });
  const [vaultForm, setVaultForm] = useState({ projectName: '', envText: '' });
  const [vaultPreview, setVaultPreview] = useState<Record<string, string>>({});
  const [vaultUpdatedAt, setVaultUpdatedAt] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [renamingProject, setRenamingProject] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedFiles, setExpandedFiles] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<Record<string, string[]>>({});
  const [renamingFile, setRenamingFile] = useState<{ project: string; file: string } | null>(null);
  const [renameFileValue, setRenameFileValue] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [expandedHistoryLogId, setExpandedHistoryLogId] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>('');
  const [watchdog, setWatchdog] = useState<Record<string, WatchdogEntry>>({});
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/status', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const nextProjects = data.projects && typeof data.projects === 'object' ? data.projects : {};
        setProjects(nextProjects);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/history', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {}
  };

  const toggleProjectHistory = async (name: string) => {
    if (expandedHistory === name) { setExpandedHistory(null); return; }
    setExpandedHistory(name);
    if (history.length === 0) await fetchHistory();
  };

  const fetchQueue = async () => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/queue', { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.queue) {
        setQueue({
          running: data.queue.running
            ? {
                ...data.queue.running,
                projectName: data.queue.running.projectName || 'unknown-project'
              }
            : null,
          queued: Array.isArray(data.queue.queued)
            ? data.queue.queued.map((item: { id: string; projectName?: string; enqueuedAt: string; position: number }) => ({
                ...item,
                projectName: item.projectName || 'unknown-project'
              }))
            : [],
          totalQueued: Number(data.queue.totalQueued) || 0
        });
      }
    } catch {}
  };

  const fetchBackups = async () => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/backups');
      const data = await res.json();
      if (data.success) setBackups(data.backups || []);
    } catch {}
  };

  const fetchVaultPreview = async () => {
    if (!vaultForm.projectName.trim()) {
      toast.error('Enter a project name first.');
      return;
    }
    try {
      const res = await apiFetch(API + '/api/orchestrator/secrets/' + vaultForm.projectName.trim().toLowerCase());
      const data = await res.json();
      if (data.success) {
        setVaultPreview(data.secrets || {});
        setVaultUpdatedAt(data.updatedAt || null);
      } else {
        toast.error(data.error || 'Failed to load secrets preview.');
      }
    } catch {
      toast.error('Could not reach API.');
    }
  };

  const saveVaultSecrets = async (rotate: boolean) => {
    if (!vaultForm.projectName.trim()) {
      toast.error('Enter a project name first.');
      return;
    }
    if (!vaultForm.envText.trim()) {
      toast.error('Enter KEY=VALUE lines to save.');
      return;
    }
    setActionLoading(rotate ? 'vault-rotate' : 'vault-save');
    try {
      const res = await apiFetch(API + '/api/orchestrator/secrets/' + vaultForm.projectName.trim().toLowerCase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envText: vaultForm.envText, rotate: rotate })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(rotate ? 'Secrets rotated.' : 'Secrets saved.');
        fetchVaultPreview();
      } else {
        toast.error(data.error || 'Failed to save secrets.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const applyVaultSecrets = async () => {
    if (!vaultForm.projectName.trim()) {
      toast.error('Enter a project name first.');
      return;
    }
    setActionLoading('vault-apply');
    try {
      const res = await apiFetch(API + '/api/orchestrator/secrets/' + vaultForm.projectName.trim().toLowerCase() + '/apply', {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Secrets applied and process restarted.');
        fetchStatus();
      } else {
        toast.error(data.error || 'Failed to apply secrets.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const createBackup = async () => {
    setActionLoading('backup-create');
    try {
      const res = await apiFetch(API + '/api/orchestrator/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ includeDeployments: true })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Backup created: ' + data.backup.backupId);
        fetchBackups();
      } else {
        toast.error(data.error || 'Backup failed.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const restoreBackup = async (backupId: string) => {
    if (!confirm('Restore backup ' + backupId + '? This may overwrite deployment state.')) return;
    setActionLoading('backup-restore-' + backupId);
    try {
      const res = await apiFetch(API + '/api/orchestrator/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: backupId, includeDeployments: true })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Backup restored.');
        fetchStatus();
        fetchHistory();
      } else {
        toast.error(data.error || 'Restore failed.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const fetchWatchdog = async () => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/watchdog');
      const data = await res.json();
      if (data.success) setWatchdog(data.watchdog || {});
    } catch {}
  };

  const fetchAlertConfig = async () => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/alerts/config');
      const data = await res.json();
      if (data.success) setAlertConfig(data.config);
    } catch {}
  };

  const runRepair = async () => {
    setActionLoading('repair');
    try {
      const res = await apiFetch(API + '/api/orchestrator/repair', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('Repair complete. Synced ' + data.synced + ' project(s). Caddy reloaded.');
        fetchStatus();
        fetchHistory();
      } else {
        toast.error(data.error || 'Repair failed.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const sendTestAlert = async () => {
    setActionLoading('alert-test');
    try {
      const res = await apiFetch(API + '/api/orchestrator/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'manual' })
      });
      const data = await res.json();
      if (data.success) toast.success('Test alert sent.');
      else toast.error(data.error || 'Test alert failed.');
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchQueue();
    fetchBackups();
    fetchWatchdog();
    fetchAlertConfig();
    const interval = setInterval(() => {
      fetchStatus();
      fetchQueue();
      fetchWatchdog();
    }, 15000);

    // Real-time watchdog events over socket
    const socket = io(BASE_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('watchdog_state', (state: Record<string, WatchdogEntry>) => {
      setWatchdog(state);
    });

    socket.on('watchdog_event', (event: WatchdogEntry & { name: string; message: string }) => {
      if (event.status === 'healed') {
        toast.success('Watchdog healed: ' + event.name);
      } else if (event.status === 'down') {
        toast.error('Watchdog: ' + event.name + ' is down.');
      }
      fetchWatchdog();
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const handleDelete = async (name: string) => {
    if (!confirm('Delete ' + name + '? This removes all files and stops the process.')) return;
    setActionLoading('delete-' + name);
    try {
      const res = await apiFetch(API + '/api/orchestrator/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(name + ' deleted.');
        fetchStatus();
        fetchHistory();
      } else {
        toast.error(data.error || 'Delete failed.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async (name: string, repoUrl: string) => {
    setActionLoading('rollback-' + name);
    try {
      const res = await apiFetch(API + '/api/orchestrator/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name, repoUrl: repoUrl })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(name + ' redeployed.');
        fetchStatus();
        fetchHistory();
      } else {
        toast.error(data.error || 'Rollback failed.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFetchFiles = async (name: string) => {
    try {
      const res = await apiFetch(API + '/api/orchestrator/files/' + name);
      const data = await res.json();
      if (data.success) setProjectFiles(prev => ({ ...prev, [name]: data.files }));
    } catch { /* ignore */ }
  };

  const handleRenameFile = async (projectName: string, oldFile: string) => {
    const newFile = renameFileValue.trim();
    if (!newFile || newFile === oldFile) { setRenamingFile(null); return; }
    setActionLoading('rename-file-' + projectName);
    try {
      const res = await apiFetch(API + '/api/orchestrator/rename-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, oldFile, newFile }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Renamed to ${newFile}`);
        setRenamingFile(null);
        handleFetchFiles(projectName);
      } else {
        toast.error(data.error || 'Rename failed.');
      }
    } catch { toast.error('Could not reach API.'); }
    finally { setActionLoading(null); }
  };

  const handleRename = async (oldName: string) => {
    const newName = renameValue.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!newName || newName === oldName) { setRenamingProject(null); return; }
    setActionLoading('rename-' + oldName);
    try {
      const res = await apiFetch(API + '/api/orchestrator/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Renamed to ' + data.newName + '.');
        setRenamingProject(null);
        fetchStatus();
      } else {
        toast.error(data.error || 'Rename failed.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFetchLogs = async (name: string) => {
    if (expandedLogs === name) { setExpandedLogs(null); return; }
    setExpandedLogs(name);
    try {
      const res = await apiFetch(API + '/api/logs/' + name);
      const data = await res.json();
      setProjectLogs((prev) => ({ ...prev, [name]: data.logs || 'No logs available.' }));
    } catch {
      setProjectLogs((prev) => ({ ...prev, [name]: 'Failed to fetch logs.' }));
    }
  };

  const projectList = Object.entries(projects).filter(([name]) => Boolean(name) && name !== 'undefined');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* DEPLOY QUEUE */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-4 bg-zinc-900/20 border-b border-zinc-800/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Deploy Queue</h2>
          <button onClick={fetchQueue} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh queue">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="p-4 text-sm">
          {queue.running ? (
            <p className="text-zinc-300">Running: <span className="text-white font-medium">{queue.running.projectName || 'unknown-project'}</span></p>
          ) : (
            <p className="text-zinc-500">No active deployment.</p>
          )}
          {queue.queued.length > 0 ? (
            <div className="mt-2 space-y-1">
              {queue.queued.map((item) => (
                <p key={item.id} className="text-zinc-500">Queued #{item.position}: {item.projectName || 'unknown-project'}</p>
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 mt-1">Queue empty.</p>
          )}
        </div>
      </div>

      {/* SECRETS VAULT */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center gap-2">
          <KeyRound size={16} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Encrypted Secrets Vault</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Project Name</label>
              <input
                type="text"
                placeholder="my-app"
                className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                value={vaultForm.projectName}
                onChange={(e) => setVaultForm({ ...vaultForm, projectName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Updated</label>
              <div className="h-10 px-3 flex items-center rounded-md border border-zinc-800 bg-black text-sm text-zinc-500">
                {vaultUpdatedAt ? new Date(vaultUpdatedAt).toLocaleString() : 'No secrets loaded'}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">KEY=VALUE Lines</label>
            <textarea
              placeholder={'DATABASE_URL=postgres://...\nJWT_SECRET=...\nAPI_KEY=...'}
              className="w-full min-h-28 bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
              value={vaultForm.envText}
              onChange={(e) => setVaultForm({ ...vaultForm, envText: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => saveVaultSecrets(false)}
              disabled={actionLoading === 'vault-save'}
              className="h-9 px-3 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
            >
              Save Secrets
            </button>
            <button
              onClick={() => saveVaultSecrets(true)}
              disabled={actionLoading === 'vault-rotate'}
              className="h-9 px-3 rounded-md text-xs font-semibold bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
            >
              Rotate Secrets
            </button>
            <button
              onClick={applyVaultSecrets}
              disabled={actionLoading === 'vault-apply'}
              className="h-9 px-3 rounded-md text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
            >
              Apply to Runtime
            </button>
            <button
              onClick={fetchVaultPreview}
              className="h-9 px-3 rounded-md text-xs font-semibold border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
            >
              Load Masked Preview
            </button>
          </div>

          <div className="bg-black border border-zinc-800 rounded-md p-3 text-xs">
            {Object.keys(vaultPreview).length === 0 ? (
              <p className="text-zinc-600">No stored secrets preview yet.</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(vaultPreview).map(([key, value]) => (
                  <p key={key} className="text-zinc-400"><span className="text-zinc-300">{key}</span>= {value}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BACKUP + RESTORE */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download size={16} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Backups & Restore</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={createBackup}
              disabled={actionLoading === 'backup-create'}
              className="h-8 px-3 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
            >
              Create Full Backup
            </button>
            <button onClick={fetchBackups} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh backups">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {backups.length === 0 ? (
            <p className="text-sm text-zinc-600">No backups created yet.</p>
          ) : backups.map((backup) => (
            <div key={backup.backupId} className="flex items-center justify-between bg-black border border-zinc-800 rounded-md px-3 py-2">
              <div>
                <p className="text-sm text-zinc-300 font-medium">{backup.backupId}</p>
                <p className="text-xs text-zinc-600">
                  {backup.createdAt ? new Date(backup.createdAt).toLocaleString() : 'Unknown date'}
                  {backup.includeDeployments ? ' • includes deployments' : ' • metadata only'}
                </p>
              </div>
              <button
                onClick={() => restoreBackup(backup.backupId)}
                disabled={actionLoading === 'backup-restore-' + backup.backupId}
                className="h-8 px-3 rounded-md text-xs font-semibold bg-amber-700 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white flex items-center gap-1"
              >
                <Upload size={12} /> Restore
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* AUTO-HEAL WATCHDOG */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Auto-Heal Watchdog</h2>
            <span className="text-xs text-zinc-600">checks every 60s, restarts after 2 fails</span>
          </div>
          <button onClick={fetchWatchdog} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh watchdog">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="p-4">
          {Object.keys(watchdog).length === 0 ? (
            <p className="text-sm text-zinc-600">No projects monitored yet. Watchdog activates after first deploy.</p>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {Object.entries(watchdog).map(([name, entry]) => (
                <div key={name} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {entry.status === 'ok' && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                    {entry.status === 'healed' && <CheckCircle2 size={14} className="text-blue-400 shrink-0" />}
                    {entry.status === 'failing' && <AlertCircle size={14} className="text-amber-400 shrink-0" />}
                    {entry.status === 'down' && <XCircle size={14} className="text-red-400 shrink-0" />}
                    <div>
                      <span className="text-sm text-zinc-300 font-medium">{name}</span>
                      {entry.status === 'failing' && (
                        <span className="ml-2 text-xs text-amber-400">{entry.consecutiveFails || 1} consecutive fail(s)</span>
                      )}
                      {entry.status === 'healed' && entry.healedAt && (
                        <span className="ml-2 text-xs text-blue-400">Healed {new Date(entry.healedAt).toLocaleTimeString()}</span>
                      )}
                      {entry.lastError && (
                        <p className="text-xs text-red-400 mt-0.5 max-w-xs truncate">{entry.lastError}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={'text-xs font-medium px-2 py-0.5 rounded ' +
                      (entry.status === 'ok' ? 'text-green-400 bg-green-950' :
                       entry.status === 'healed' ? 'text-blue-400 bg-blue-950' :
                       entry.status === 'failing' ? 'text-amber-400 bg-amber-950' :
                       'text-red-400 bg-red-950')}>
                      {entry.status.toUpperCase()}
                    </span>
                    {entry.checkedAt && (
                      <p className="text-xs text-zinc-600 mt-0.5">{new Date(entry.checkedAt).toLocaleTimeString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ALERT SETTINGS */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center gap-2">
          <Bell size={16} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Alert Notifications</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={'flex items-center gap-3 p-3 rounded-lg border ' + (alertConfig?.telegram ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/20')}>
              <div className={'w-2 h-2 rounded-full ' + (alertConfig?.telegram ? 'bg-green-400' : 'bg-zinc-600')} />
              <div>
                <p className="text-sm font-medium text-zinc-200">Telegram</p>
                {alertConfig?.telegram
                  ? <p className="text-xs text-zinc-500">Chat ID: {alertConfig.telegramChatId}</p>
                  : <p className="text-xs text-zinc-600">Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID on server</p>
                }
              </div>
            </div>
            <div className={'flex items-center gap-3 p-3 rounded-lg border ' + (alertConfig?.discord ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/20')}>
              <div className={'w-2 h-2 rounded-full ' + (alertConfig?.discord ? 'bg-green-400' : 'bg-zinc-600')} />
              <div>
                <p className="text-sm font-medium text-zinc-200">Discord</p>
                {alertConfig?.discord
                  ? <p className="text-xs text-zinc-500">Webhook configured</p>
                  : <p className="text-xs text-zinc-600">Set DISCORD_WEBHOOK_URL on server</p>
                }
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={sendTestAlert}
              disabled={actionLoading === 'alert-test' || (!alertConfig?.telegram && !alertConfig?.discord)}
              className="h-9 px-4 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
            >
              Send Test Alert
            </button>
            <button onClick={fetchAlertConfig} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh alert config">
              <RefreshCw size={14} />
            </button>
            {!alertConfig?.telegram && !alertConfig?.discord && (
              <p className="text-xs text-zinc-600">Configure at least one channel on the server to enable alerts.</p>
            )}
          </div>

          <div className="bg-zinc-900/30 border border-zinc-800 rounded-md p-3 text-xs text-zinc-500 space-y-1">
            <p className="text-zinc-400 font-medium mb-1">Alerts fire on:</p>
            <p>• Deploy success / failure</p>
            <p>• Watchdog auto-restart (warning)</p>
            <p>• Watchdog unable to heal (error)</p>
          </div>
        </div>
      </div>

      {/* LIVE PROJECTS */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Live Projects <span className="text-zinc-600 font-normal ml-1">({projectList.length})</span></h2>
          <div className="flex items-center gap-2">
            <button
              onClick={runRepair}
              disabled={actionLoading === 'repair'}
              className="h-7 px-3 rounded-md text-xs font-semibold bg-amber-700 hover:bg-amber-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white"
              title="Sync PM2 processes → registry → Caddy routes"
            >
              {actionLoading === 'repair' ? 'Repairing...' : 'Repair Routing'}
            </button>
            <button onClick={fetchStatus} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {loadingProjects ? (
          <div className="p-8 text-center text-zinc-600 text-sm">Loading projects...</div>
        ) : projectList.length === 0 ? (
          <div className="p-8 text-center text-zinc-600 text-sm">No projects deployed yet.</div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {projectList.map(([name, project]) => (
              <div key={name}>
                <div className="p-3 sm:p-4 flex items-center justify-between hover:bg-zinc-900/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-0.5">
                        {renamingProject === name ? (
                          <form onSubmit={(e) => { e.preventDefault(); handleRename(name); }} className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="bg-black border border-zinc-600 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-white w-36"
                              onKeyDown={(e) => e.key === 'Escape' && setRenamingProject(null)}
                            />
                            <button type="submit" className="p-1 text-green-400 hover:text-green-300"><Check size={13} /></button>
                            <button type="button" onClick={() => setRenamingProject(null)} className="p-1 text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
                          </form>
                        ) : (
                          <span className="text-sm font-medium text-zinc-200 truncate">{name}</span>
                        )}
                        <StatusBadge status={project.deployType === 'static' ? 'online' : project.health.status} />
                        {project.deployType === 'static' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-medium">Static</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                        {project.deployType === 'static' ? (
                          <a
                            href={'https://' + name + '.epicglobal.app'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 truncate max-w-[200px]"
                          >
                            {name}.epicglobal.app <ExternalLink size={10} />
                          </a>
                        ) : (
                          <>
                            <span>:{project.port}</span>
                            {project.domain && <span className="truncate max-w-[140px] sm:max-w-none">{project.domain}</span>}
                            <span>{project.health.memory}MB</span>
                            <span className="hidden sm:inline">{project.health.restarts} restarts</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 sm:gap-1 ml-2 shrink-0">
                    <button onClick={() => toggleProjectHistory(name)}
                      className="p-2 text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 rounded-md transition-colors" title="Project history">
                      <Clock size={14} className={expandedHistory === name ? 'text-amber-400' : ''} />
                    </button>
                    {project.deployType === 'static' ? (
                      <>
                        <button
                          onClick={() => {
                            if (expandedFiles === name) { setExpandedFiles(null); }
                            else { setExpandedFiles(name); handleFetchFiles(name); }
                          }}
                          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
                          title="Manage files"
                        >
                          <FileText size={14} className={expandedFiles === name ? 'text-zinc-200' : ''} />
                        </button>
                        <button onClick={() => handleDelete(name)}
                          disabled={actionLoading === 'delete-' + name}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleFetchLogs(name)}
                          className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors" title="View logs">
                          <FileText size={14} className={expandedLogs === name ? 'text-zinc-200' : ''} />
                        </button>
                        <button onClick={() => handleRollback(name, project.repoUrl)}
                          disabled={actionLoading === 'rollback-' + name}
                          className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-md transition-colors" title="Redeploy">
                          <RefreshCw size={14} className={actionLoading === 'rollback-' + name ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => handleDelete(name)}
                          disabled={actionLoading === 'delete-' + name}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {expandedLogs === name && (
                  <div className="px-3 sm:px-4 pb-4 bg-black">
                    <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap h-48 overflow-y-auto p-3 border border-zinc-800 rounded-md">
                      {projectLogs[name] || 'Fetching logs...'}
                    </pre>
                  </div>
                )}
                {expandedHistory === name && (
                  <div className="px-3 sm:px-4 pb-3 bg-zinc-950 border-t border-zinc-800/60">
                    <p className="text-xs text-zinc-500 pt-3 mb-2 font-medium">History - <span className="text-zinc-300">{name}</span></p>
                    {(() => {
                      const entries = history.filter(e => e.projectName === name);
                      if (entries.length === 0) return <p className="text-xs text-zinc-600">No history for this project yet.</p>;
                      return (
                        <ul className="space-y-1 max-h-56 overflow-y-auto">
                          {entries.slice().reverse().map(entry => (
                            <li key={entry.id} className="py-1 border-b border-zinc-800/40 last:border-0">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  {entry.status === 'success' && <CheckCircle2 size={12} className="text-green-400 shrink-0" />}
                                  {entry.status === 'failed' && <XCircle size={12} className="text-red-400 shrink-0" />}
                                  {entry.status === 'deleted' && <Trash2 size={12} className="text-zinc-500 shrink-0" />}
                                  <span className="text-xs text-zinc-400 truncate">
                                    {entry.details?.strategy || entry.status}
                                    {entry.details?.url ? <span className="text-zinc-600 ml-1">{String(entry.details.url)}</span> : null}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {(entry.details?.log || entry.details?.error) && (
                                    <button
                                      onClick={() => setExpandedHistoryLogId(expandedHistoryLogId === entry.id ? null : entry.id)}
                                      className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                                    >
                                      {expandedHistoryLogId === entry.id ? 'Hide logs' : 'View logs'}
                                    </button>
                                  )}
                                  <span className="text-[10px] text-zinc-600">{new Date(entry.timestamp).toLocaleString()}</span>
                                </div>
                              </div>
                              {expandedHistoryLogId === entry.id && (
                                <pre className="mt-2 text-[11px] text-amber-300 whitespace-pre-wrap bg-black border border-zinc-800 rounded p-2 max-h-48 overflow-y-auto">
                                  {String(entry.details?.log || entry.details?.error || 'No logs recorded.')}
                                </pre>
                              )}
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </div>
                )}
                {expandedFiles === name && (
                  <div className="px-3 sm:px-4 pb-3 bg-zinc-950 border-t border-zinc-800/60">
                    <p className="text-xs text-zinc-500 mb-2 pt-3">Files in <span className="text-zinc-300 font-mono">/var/www/epic-deployments/{name}/</span></p>
                    {(projectFiles[name] ?? []).length === 0 ? (
                      <p className="text-xs text-zinc-600">No files found.</p>
                    ) : (
                      <ul className="space-y-1">
                        {(projectFiles[name] ?? []).map(file => (
                          <li key={file} className="flex items-center gap-2 text-xs font-mono">
                            {renamingFile?.project === name && renamingFile?.file === file ? (
                              <form onSubmit={(e) => { e.preventDefault(); handleRenameFile(name, file); }} className="flex items-center gap-1 flex-1">
                                <input
                                  autoFocus
                                  value={renameFileValue}
                                  onChange={(e) => setRenameFileValue(e.target.value)}
                                  className="bg-black border border-zinc-600 rounded px-2 py-0.5 text-xs text-zinc-100 focus:outline-none focus:border-white flex-1 min-w-0"
                                  onKeyDown={(e) => e.key === 'Escape' && setRenamingFile(null)}
                                />
                                <button type="submit" disabled={actionLoading === 'rename-file-' + name} className="p-1 text-green-400 hover:text-green-300"><Check size={12} /></button>
                                <button type="button" onClick={() => setRenamingFile(null)} className="p-1 text-zinc-500 hover:text-zinc-300"><X size={12} /></button>
                              </form>
                            ) : (
                              <>
                                <span className={`flex-1 truncate ${file === 'index.html' ? 'text-green-400' : 'text-amber-400'}`}>{file}</span>
                                <button
                                  onClick={() => { setRenamingFile({ project: name, file }); setRenameFileValue(file); }}
                                  className="p-1 text-zinc-600 hover:text-zinc-300"
                                  title="Rename file"
                                >
                                  <Pencil size={11} />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DEPLOYMENT HISTORY */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory(); }}
          className="w-full p-5 flex items-center justify-between bg-zinc-900/20 hover:bg-zinc-900/40 transition-colors">
          <h2 className="text-sm font-semibold text-zinc-100">All Deployment History <span className="text-zinc-600 font-normal ml-1">({history.length})</span></h2>
          {showHistory ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
        </button>

        {showHistory && (
          <>
            {/* Project filter */}
            <div className="px-5 pt-3 pb-2 border-b border-zinc-800/60 flex items-center gap-2">
              <label className="text-xs text-zinc-500 shrink-0">Filter by project:</label>
              <select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                className="flex-1 bg-black border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
              >
                <option value="">All projects</option>
                {Array.from(new Set(history.map(e => e.projectName))).sort().map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {historyFilter && <button onClick={() => setHistoryFilter('')} className="text-zinc-600 hover:text-zinc-400"><X size={13} /></button>}
            </div>
            <div className="divide-y divide-zinc-800/60 max-h-80 overflow-y-auto">
              {(() => {
                const filtered = historyFilter ? history.filter(e => e.projectName === historyFilter) : history;
                if (filtered.length === 0) return <div className="p-6 text-center text-zinc-600 text-sm">No history yet.</div>;
                return filtered.slice().reverse().map((entry) => (
                  <div key={entry.id} className="p-3 px-5 flex items-center justify-between hover:bg-zinc-900/20">
                    <div className="flex items-center gap-3">
                      {entry.status === 'success' && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                      {entry.status === 'failed' && <XCircle size={14} className="text-red-400 shrink-0" />}
                      {entry.status === 'deleted' && <Trash2 size={14} className="text-zinc-500 shrink-0" />}
                      <div>
                        <span className="text-sm text-zinc-300 font-medium">{entry.projectName || 'unknown-project'}</span>
                        {entry.details?.strategy && (
                          <span className="ml-2 text-xs bg-zinc-900 text-zinc-400 border border-zinc-700 rounded px-1.5 py-0.5">{String(entry.details.strategy)}</span>
                        )}
                        {entry.details?.url && <span className="ml-2 text-xs text-zinc-600">{String(entry.details.url)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0 ml-4">{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                ));
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}