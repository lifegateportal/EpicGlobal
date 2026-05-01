import { useState, useEffect, type FormEvent } from 'react';
import { Trash2, RefreshCw, FileText, Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = 'https://api.epicglobal.app';

type ProjectHealth = {
  status: 'online' | 'stopped' | 'errored' | 'launching' | string;
  uptime: number | null;
  restarts: number;
  memory: number;
  cpu: number;
};

type Project = {
  port: number;
  repoUrl: string;
  domain?: string;
  health: ProjectHealth;
};

type HistoryEntry = {
  id: number;
  projectName: string;
  status: 'success' | 'failed' | 'deleted';
  timestamp: string;
  details: Record<string, string | number>;
};

type QueueSnapshot = {
  running: { id: string; projectName: string; startedAt: string } | null;
  queued: Array<{ id: string; projectName: string; enqueuedAt: string; position: number }>;
  totalQueued: number;
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'online') return <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium"><CheckCircle2 size={12} /> Online</span>;
  if (status === 'errored') return <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium"><XCircle size={12} /> Errored</span>;
  if (status === 'launching') return <span className="flex items-center gap-1.5 text-blue-400 text-xs font-medium"><Clock size={12} /> Launching</span>;
  return <span className="flex items-center gap-1.5 text-zinc-500 text-xs font-medium"><AlertCircle size={12} /> Stopped</span>;
}

export default function ProjectOrchestrator() {
  const [form, setForm] = useState({ projectName: '', repoUrl: '', domain: '' });
  const [deployStatus, setDeployStatus] = useState({ loading: false, logs: '', error: '' });
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [projectLogs, setProjectLogs] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<QueueSnapshot>({ running: null, queued: [], totalQueued: 0 });

  const fetchStatus = async () => {
    try {
      const res = await fetch(API + '/api/orchestrator/status');
      const data = await res.json();
      if (data.success) setProjects(data.projects);
    } catch {
      // Silently fail
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(API + '/api/orchestrator/history');
      const data = await res.json();
      if (data.success) setHistory(data.history);
    } catch {}
  };

  const fetchQueue = async () => {
    try {
      const res = await fetch(API + '/api/orchestrator/queue');
      const data = await res.json();
      if (data.success) setQueue(data.queue);
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchQueue();
    const interval = setInterval(() => {
      fetchStatus();
      fetchQueue();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleDeploy = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeployStatus({ loading: true, logs: 'Initiating remote orchestration...', error: '' });

    try {
      const res = await fetch(API + '/api/orchestrator/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (data.success) {
        toast.success(form.projectName + ' deployed successfully.');
        setDeployStatus({ loading: false, logs: 'Live at: ' + data.url + '\n\n' + data.log, error: '' });
        setForm({ projectName: '', repoUrl: '', domain: '' });
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

  const projectList = Object.entries(projects);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* DEPLOY FORM */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center gap-2">
          <Plus size={16} className="text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Deploy New Project</h2>
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
                <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">GitHub Repo URL</label>
                <input type="url" placeholder="https://github.com/user/repo" required
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
            <button type="submit" disabled={deployStatus.loading}
              className={'h-10 px-6 rounded-md text-sm font-semibold transition-colors ' + (deployStatus.loading ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white')}>
              {deployStatus.loading ? 'Deploying...' : 'Launch Project'}
            </button>
          </form>

          {(deployStatus.logs || deployStatus.error) && (
            <div className="mt-4 bg-black border border-zinc-800 rounded-lg p-4 h-40 overflow-y-auto font-mono text-xs">
              {deployStatus.error && <p className="text-red-400">Error: {deployStatus.error}</p>}
              {deployStatus.logs && <pre className="text-emerald-400 whitespace-pre-wrap">{deployStatus.logs}</pre>}
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
            <p className="text-zinc-300">Running: <span className="text-white font-medium">{queue.running.projectName}</span></p>
          ) : (
            <p className="text-zinc-500">No active deployment.</p>
          )}
          {queue.queued.length > 0 ? (
            <div className="mt-2 space-y-1">
              {queue.queued.map((item) => (
                <p key={item.id} className="text-zinc-500">Queued #{item.position}: {item.projectName}</p>
              ))}
            </div>
          ) : (
            <p className="text-zinc-600 mt-1">Queue empty.</p>
          )}
        </div>
      </div>

      {/* LIVE PROJECTS */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Live Projects <span className="text-zinc-600 font-normal ml-1">({projectList.length})</span></h2>
          <button onClick={fetchStatus} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
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
                    <span className="text-sm text-zinc-300 font-medium">{entry.projectName}</span>
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