import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Trash2, RefreshCw, FileText, Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertCircle, KeyRound, Download, Upload, ShieldCheck, Bell, Copy, Link } from 'lucide-react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { BASE_URL, API } from '../api/client';
import type { Project, HistoryEntry, QueueSnapshot, BackupManifest, WatchdogEntry, AlertConfig } from '../types';

function StatusBadge({ status }: { status: string }) {
  if (status === 'online') return <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium"><CheckCircle2 size={12} /> Online</span>;
  if (status === 'errored') return <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium"><XCircle size={12} /> Errored</span>;
  if (status === 'launching') return <span className="flex items-center gap-1.5 text-blue-400 text-xs font-medium"><Clock size={12} /> Launching</span>;
  return <span className="flex items-center gap-1.5 text-zinc-500 text-xs font-medium"><AlertCircle size={12} /> Stopped</span>;
}

export default function ProjectOrchestrator() {
  const [form, setForm] = useState({ projectName: '', repoUrl: '', domain: '', accessToken: '' });
  const [deployStatus, setDeployStatus] = useState({ loading: false, logs: '', error: '' });
  const [deployedUrl, setDeployedUrl] = useState('');
  const [deployedWebhookUrl, setDeployedWebhookUrl] = useState('');
  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [webhookUrls, setWebhookUrls] = useState<Record<string, string>>({});
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
  const [watchdog, setWatchdog] = useState<Record<string, WatchdogEntry>>({});
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(API + '/api/orchestrator/status', { cache: 'no-store' });
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
      const res = await fetch(API + '/api/orchestrator/history', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {}
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch(API + '/api/orchestrator/queue', { cache: 'no-store' });
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
      const res = await fetch(API + '/api/orchestrator/backups');
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
      const res = await fetch(API + '/api/orchestrator/secrets/' + vaultForm.projectName.trim().toLowerCase());
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
      const res = await fetch(API + '/api/orchestrator/secrets/' + vaultForm.projectName.trim().toLowerCase(), {
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
      const res = await fetch(API + '/api/orchestrator/secrets/' + vaultForm.projectName.trim().toLowerCase() + '/apply', {
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
      const res = await fetch(API + '/api/orchestrator/backups/create', {
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
      const res = await fetch(API + '/api/orchestrator/backups/restore', {
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
      const res = await fetch(API + '/api/orchestrator/watchdog');
      const data = await res.json();
      if (data.success) setWatchdog(data.watchdog || {});
    } catch {}
  };

  const fetchAlertConfig = async () => {
    try {
      const res = await fetch(API + '/api/orchestrator/alerts/config');
      const data = await res.json();
      if (data.success) setAlertConfig(data.config);
    } catch {}
  };

  const runRepair = async () => {
    setActionLoading('repair');
    try {
      const res = await fetch(API + '/api/orchestrator/repair', { method: 'POST' });
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
      const res = await fetch(API + '/api/orchestrator/alerts/test', {
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

  const handleDeploy = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeployStatus({ loading: true, logs: 'Initiating remote orchestration...', error: '' });
    setDeployedUrl('');
    setDeployedWebhookUrl('');

    try {
      const res = await fetch(API + '/api/orchestrator/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (data.success) {
        const deployedProjectName = form.projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        toast.success(form.projectName + ' deployed successfully.');
        const deploymentLog = String(data.log || data.terminalOutput || 'Deployment finished');
        setDeployStatus({ loading: false, logs: deploymentLog, error: '' });
        setDeployedUrl(data.url || '');
        if (data.webhookSecret) {
          setDeployedWebhookUrl('https://api.epicglobal.app/api/orchestrator/webhook/' + deployedProjectName + '?secret=' + data.webhookSecret);
        }
        setForm({ projectName: '', repoUrl: '', domain: '', accessToken: '' });
        fetchStatus();
        fetchHistory();
        fetchQueue();
      } else {
        setDeployStatus({ loading: false, logs: '', error: data.error || 'Deployment failed.' });
        toast.error(data.error || 'Deployment failed.');
        fetchQueue();
      }
    } catch {
      setDeployStatus({ loading: false, logs: '', error: 'Connection failed. Check api.epicglobal.app DNS.' });
      toast.error('Could not reach API.');
      fetchQueue();
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm('Delete ' + name + '? This removes all files and stops the process.')) return;
    setActionLoading('delete-' + name);
    try {
      const res = await fetch(API + '/api/orchestrator/delete', {
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
    setDeployStatus({ loading: true, logs: 'Rolling back ' + name + '...', error: '' });
    try {
      const res = await fetch(API + '/api/orchestrator/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: name, repoUrl: repoUrl })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(name + ' redeployed.');
        setDeployStatus({ loading: false, logs: 'Rollback complete.\n\n' + data.log, error: '' });
        fetchStatus();
        fetchHistory();
      } else {
        setDeployStatus({ loading: false, logs: '', error: data.error });
        toast.error('Rollback failed.');
      }
    } catch {
      toast.error('Could not reach API.');
      setDeployStatus({ loading: false, logs: '', error: 'Connection failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFetchLogs = async (name: string) => {
    if (expandedLogs === name) { setExpandedLogs(null); return; }
    setExpandedLogs(name);
    try {
      const res = await fetch(API + '/api/logs/' + name);
      const data = await res.json();
      setProjectLogs((prev) => ({ ...prev, [name]: data.logs || 'No logs available.' }));
    } catch {
      setProjectLogs((prev) => ({ ...prev, [name]: 'Failed to fetch logs.' }));
    }
  };

  const projectList = Object.entries(projects).filter(([name]) => Boolean(name) && name !== 'undefined');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* DEPLOY FORM */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center gap-2">
          <Plus size={16} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Deploy New Project</h2>
          <span className="ml-auto text-xs text-blue-400 bg-blue-950/50 border border-blue-900/50 rounded px-2 py-0.5">Blue-green for existing projects</span>
        </div>
        <div className="p-6">
          <form onSubmit={handleDeploy} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Project Name</label>
                <input type="text" placeholder="my-app" required
                  className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                  value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Git Repo URL</label>
                <input type="url" placeholder="https://github.com / gitlab.com / gitea / …" required
                  className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                  value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Custom Domain <span className="text-zinc-600 normal-case">(optional)</span></label>
                <input type="text" placeholder="mysite.com"
                  className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                  value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                Access Token <span className="text-zinc-600 normal-case">(optional — for private repos)</span>
              </label>
              <input type="password" placeholder="GitHub PAT / GitLab token / Bitbucket app password / Gitea token"
                className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} />
              <p className="text-xs text-zinc-600">Token is embedded into the clone URL and never stored or logged.</p>
            </div>
            <button type="submit" disabled={deployStatus.loading}
              className={'h-10 px-6 rounded-md text-sm font-semibold transition-colors ' + (deployStatus.loading ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white')}>
              {deployStatus.loading ? 'Deploying...' : 'Launch Project'}
            </button>
          </form>

          {(deployStatus.logs || deployStatus.error) && (
            <div className="mt-4 space-y-2">
              {deployedUrl && (
                <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-800/40 rounded-md px-3 py-2">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  <span className="text-xs text-zinc-400">Live at:</span>
                  <a
                    href={deployedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline truncate"
                  >
                    {deployedUrl}
                  </a>
                </div>
              )}
              {deployedWebhookUrl && (
                <div className="flex items-center gap-2 bg-blue-950/30 border border-blue-800/40 rounded-md px-3 py-2">
                  <Link size={13} className="text-blue-400 shrink-0" />
                  <span className="text-xs text-zinc-400">Push webhook:</span>
                  <span className="text-xs text-blue-300 font-mono truncate flex-1">{deployedWebhookUrl}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(deployedWebhookUrl); toast.success('Webhook URL copied.'); }}
                    className="text-zinc-500 hover:text-zinc-200 shrink-0"
                    title="Copy webhook URL"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              )}
              <div className="bg-black border border-zinc-800 rounded-lg p-4 h-40 overflow-y-auto font-mono text-xs">
                {deployStatus.error && <p className="text-red-400">Error: {deployStatus.error}</p>}
                {deployStatus.logs && <pre className="text-emerald-400 whitespace-pre-wrap">{deployStatus.logs}</pre>}
              </div>
            </div>
          )}
        </div>
      </div>

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
                <div className="p-4 flex items-center justify-between hover:bg-zinc-900/20 transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-zinc-200">{name}</span>
                        <StatusBadge status={project.health.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-600">
                        <span>:{project.port}</span>
                        {project.domain && <span>{project.domain}</span>}
                        <span>{project.health.memory}MB</span>
                        <span>{project.health.restarts} restarts</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4 shrink-0">
                    <button
                      onClick={async () => {
                        if (expandedWebhook === name) { setExpandedWebhook(null); return; }
                        setExpandedWebhook(name);
                        if (!webhookUrls[name]) {
                          try {
                            const r = await fetch(`${API}/api/orchestrator/webhook/${encodeURIComponent(name)}/info`);
                            const d = await r.json();
                            if (d.success) setWebhookUrls(prev => ({ ...prev, [name]: d.webhookUrl }));
                          } catch { /* silent */ }
                        }
                      }}
                      className="p-2 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded-md transition-colors" title="Webhook URL">
                      <Link size={14} />
                    </button>
                    <button onClick={() => handleFetchLogs(name)}
                      className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors" title="View logs">
                      {expandedLogs === name ? <ChevronUp size={14} /> : <FileText size={14} />}
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
                  </div>
                </div>
                {expandedWebhook === name && (
                  <div className="px-4 pb-3 bg-black border-t border-zinc-900">
                    <div className="flex items-center gap-2 bg-blue-950/20 border border-blue-900/30 rounded-md px-3 py-2 mt-3">
                      <Link size={12} className="text-blue-400 shrink-0" />
                      <span className="text-xs text-zinc-500">Push webhook URL:</span>
                      <span className="text-xs text-blue-300 font-mono truncate flex-1">
                        {webhookUrls[name] || 'Loading…'}
                      </span>
                      {webhookUrls[name] && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(webhookUrls[name]); toast.success('Webhook URL copied.'); }}
                          className="text-zinc-500 hover:text-zinc-200 shrink-0"
                          title="Copy"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 mt-1.5 px-1">
                      Paste this URL into your repo's webhook settings (GitHub → Settings → Webhooks, GitLab → Settings → Integrations, etc.) to auto-redeploy on every push.
                    </p>
                  </div>
                )}
                {expandedLogs === name && (
                  <div className="px-4 pb-4 bg-black">
                    <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap h-48 overflow-y-auto p-3 border border-zinc-800 rounded-md">
                      {projectLogs[name] || 'Fetching logs...'}
                    </pre>
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
          <h2 className="text-sm font-semibold text-zinc-100">Deployment History <span className="text-zinc-600 font-normal ml-1">({history.length})</span></h2>
          {showHistory ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
        </button>

        {showHistory && (
          <div className="divide-y divide-zinc-800/60 max-h-80 overflow-y-auto">
            {history.length === 0 ? (
              <div className="p-6 text-center text-zinc-600 text-sm">No history yet.</div>
            ) : history.map((entry) => (
              <div key={entry.id} className="p-3 px-5 flex items-center justify-between hover:bg-zinc-900/20">
                <div className="flex items-center gap-3">
                  {entry.status === 'success' && <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
                  {entry.status === 'failed' && <XCircle size={14} className="text-red-400 shrink-0" />}
                  {entry.status === 'deleted' && <Trash2 size={14} className="text-zinc-500 shrink-0" />}
                  <div>
                    <span className="text-sm text-zinc-300 font-medium">{entry.projectName || 'unknown-project'}</span>
                    {entry.details.strategy === 'blue-green' && (
                      <span className="ml-2 text-xs bg-blue-950 text-blue-400 border border-blue-800 rounded px-1.5 py-0.5">blue-green</span>
                    )}
                    {entry.details.url && <span className="ml-2 text-xs text-zinc-600">{String(entry.details.url)}</span>}
                  </div>
                </div>
                <span className="text-xs text-zinc-600 shrink-0 ml-4">{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}