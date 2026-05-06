import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Trash2, KeyRound, RefreshCw, Search, ChevronDown, ChevronUp, ExternalLink, Plus, Eye, EyeOff, Lock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { API, apiFetch } from '../api/client';
import type { HistoryEntry, Project } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingRow = { id: string; key: string; value: string; showValue: boolean };

type ProjectVault = {
  storedKeys: Record<string, string>; // key → masked value from server
  pending: PendingRow[];              // new vars being composed before save
  saving: boolean;
  loaded: boolean;
  updatedAt: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emptyVault = (): ProjectVault => ({
  storedKeys: {},
  pending: [],
  saving: false,
  loaded: false,
  updatedAt: null,
});

let rowCounter = 0;
const newRow = (): PendingRow => ({ id: `row-${++rowCounter}`, key: '', value: '', showValue: false });

// ─── Component ────────────────────────────────────────────────────────────────

export function DeploymentsTab() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expandedVault, setExpandedVault] = useState<string | null>(null);
  const [vaults, setVaults] = useState<Record<string, ProjectVault>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [histRes, projRes] = await Promise.all([
        apiFetch(`${API}/api/orchestrator/history`, { cache: 'no-store' }),
        apiFetch(`${API}/api/orchestrator/status`,  { cache: 'no-store' }),
      ]);
      const [histData, projData] = await Promise.all([histRes.json(), projRes.json()]);
      if (histData.success) setHistory(Array.isArray(histData.history) ? histData.history : []);
      if (projData.success) setProjects(projData.projects ?? {});
    } catch {
      toast.error('Could not load deployments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Delete history entry ───────────────────────────────────────────────────

  const deleteEntry = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`${API}/api/orchestrator/history/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setHistory(prev => prev.filter(e => e.id !== id));
        toast.success('Entry removed.');
      } else {
        toast.error(data.error || 'Could not delete entry.');
      }
    } catch {
      toast.error('Could not reach API.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Vault helpers ──────────────────────────────────────────────────────────

  const patchVault = (name: string, patch: Partial<ProjectVault>) =>
    setVaults(prev => ({ ...prev, [name]: { ...(prev[name] ?? emptyVault()), ...patch } }));

  const getVault = (name: string): ProjectVault => vaults[name] ?? emptyVault();

  const loadVaultPreview = async (name: string) => {
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/secrets/${encodeURIComponent(name.toLowerCase())}`);
      const data = await res.json();
      if (data.success) {
        patchVault(name, { storedKeys: data.secrets ?? {}, updatedAt: data.updatedAt ?? null, loaded: true });
      } else {
        patchVault(name, { loaded: true });
      }
    } catch {
      patchVault(name, { loaded: true });
    }
  };

  const toggleVault = (name: string) => {
    if (expandedVault === name) { setExpandedVault(null); return; }
    setExpandedVault(name);
    if (!getVault(name).loaded) loadVaultPreview(name);
  };

  // ── Pending row mutations ──────────────────────────────────────────────────

  const addRow = (name: string) =>
    patchVault(name, { pending: [...getVault(name).pending, newRow()] });

  const removeRow = (name: string, id: string) =>
    patchVault(name, { pending: getVault(name).pending.filter(r => r.id !== id) });

  const updateRow = (name: string, id: string, patch: Partial<PendingRow>) =>
    patchVault(name, {
      pending: getVault(name).pending.map(r => r.id === id ? { ...r, ...patch } : r),
    });

  // ── Save & apply ───────────────────────────────────────────────────────────

  const saveSecrets = async (name: string, rotate = false) => {
    const vault = getVault(name);
    const validRows = vault.pending.filter(r => r.key.trim() && r.value.trim());
    if (validRows.length === 0) { toast.error('Add at least one KEY + VALUE before saving.'); return; }

    const envText = validRows.map(r => `${r.key.trim().toUpperCase()}=${r.value.trim()}`).join('\n');
    patchVault(name, { saving: true });

    try {
      const res  = await apiFetch(`${API}/api/orchestrator/secrets/${encodeURIComponent(name.toLowerCase())}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envText, rotate }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(rotate ? 'Secrets rotated.' : 'Variables saved to vault.');
        patchVault(name, { pending: [], saving: false });
        loadVaultPreview(name);
      } else {
        toast.error(data.error || 'Failed to save secrets.');
        patchVault(name, { saving: false });
      }
    } catch {
      toast.error('Could not reach API.');
      patchVault(name, { saving: false });
    }
  };

  const applySecrets = async (name: string) => {
    patchVault(name, { saving: true });
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/secrets/${encodeURIComponent(name.toLowerCase())}/apply`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Secrets applied and process restarted.');
        loadVaultPreview(name);
      } else {
        toast.error(data.error || 'Failed to apply secrets.');
      }
    } catch { toast.error('Could not reach API.'); }
    finally { patchVault(name, { saving: false }); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = history.filter(({ projectName, status }) => {
    const q = query.toLowerCase();
    return !q || projectName?.toLowerCase().includes(q) || status?.toLowerCase().includes(q);
  });

  const liveProjectNames = Object.keys(projects).filter(n => Boolean(n) && n !== 'undefined');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* DEPLOYMENT HISTORY ─────────────────────────────────────────────── */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-3 sm:p-4 border-b border-zinc-800/60 flex items-center gap-2 bg-zinc-900/20">
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by project or status..."
              className="bg-black border border-zinc-800 rounded-md py-1.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 w-full sm:w-64"
            />
          </div>
          <button onClick={fetchAll} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-zinc-600 text-sm">Loading deployments...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-600 text-sm">
            {query ? 'No matching deployments.' : 'No deployments yet. Deploy a project from the Orchestrator tab.'}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60 overflow-hidden max-h-[440px] overflow-y-auto">
            {filtered.map((entry) => {
              const liveProject = projects[entry.projectName];
              const url = entry.details?.url
                ? String(entry.details.url)
                : liveProject?.domain ? `https://${liveProject.domain}` : null;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 sm:p-4 flex items-center justify-between bg-[#0A0A0A] hover:bg-zinc-900/40 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {entry.status === 'success'
                      ? <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                      : entry.status === 'failed'
                      ? <div className="w-4 h-4 rounded-full border-2 border-red-500 text-red-500 flex items-center justify-center text-[9px] font-bold shrink-0">!</div>
                      : <Trash2 size={15} className="text-zinc-600 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 mb-0.5 truncate">{entry.projectName || 'unknown-project'}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                        <span className="shrink-0">{new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} <span className="hidden sm:inline">{new Date(entry.timestamp).toLocaleTimeString()}</span></span>
                        {entry.details?.strategy === 'blue-green' && (
                          <span className="hidden sm:inline bg-blue-950 text-blue-400 border border-blue-800 rounded px-1.5 py-0.5">blue-green</span>
                        )}
                        {liveProject && (
                          <span className={`font-medium ${liveProject.health.status === 'online' ? 'text-green-400' : 'text-zinc-500'}`}>
                            {liveProject.health.status}
                          </span>
                        )}
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:underline truncate max-w-[120px] sm:max-w-[200px]">
                            {url} <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      entry.status === 'success' ? 'text-green-400 bg-green-950' :
                      entry.status === 'failed'  ? 'text-red-400 bg-red-950'   :
                      'text-zinc-500 bg-zinc-800/60'
                    }`}>{entry.status.toUpperCase()}</span>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      disabled={deletingId === entry.id}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-all disabled:opacity-30"
                      title="Remove entry"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ENVIRONMENT VARIABLES ───────────────────────────────────────────── */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Environment Variables</h2>
          </div>
          <span className="text-xs text-zinc-600">Encrypted vault · per project</span>
        </div>

        {liveProjectNames.length === 0 ? (
          <div className="p-6 text-center text-zinc-600 text-sm">No live projects. Deploy one first from the Orchestrator tab.</div>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {liveProjectNames.map((name) => {
              const vault  = getVault(name);
              const project = projects[name];
              const isOpen  = expandedVault === name;
              const storedEntries = Object.entries(vault.storedKeys);
              const hasPendingValid = vault.pending.some(r => r.key.trim() && r.value.trim());

              return (
                <div key={name}>
                  {/* Project header row */}
                  <button
                    onClick={() => toggleVault(name)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-zinc-100">{name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        project?.health.status === 'online' ? 'text-green-400 bg-green-950' : 'text-zinc-500 bg-zinc-800'
                      }`}>{project?.health.status ?? 'stopped'}</span>
                      {project?.domain && <span className="text-xs text-zinc-600">{project.domain}</span>}
                      {storedEntries.length > 0 && (
                        <span className="text-xs text-zinc-600">{storedEntries.length} variable{storedEntries.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {isOpen
                      ? <ChevronUp size={14} className="text-zinc-500 shrink-0" />
                      : <ChevronDown size={14} className="text-zinc-500 shrink-0" />}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden border-t border-zinc-800/60"
                      >
                        {/* Stored vars list */}
                        {!vault.loaded ? (
                          <div className="px-5 py-4 text-xs text-zinc-600">Loading stored variables...</div>
                        ) : storedEntries.length > 0 ? (
                          <div className="divide-y divide-zinc-800/40">
                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center px-4 sm:px-5 py-2 bg-zinc-900/20">
                              <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">Key</span>
                              <span className="hidden sm:block text-[10px] uppercase tracking-widest text-zinc-600 font-semibold w-40 text-center">Environments</span>
                              <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold sm:w-32 text-right">Updated</span>
                            </div>
                            {storedEntries.map(([key]) => (
                              <div key={key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center px-4 sm:px-5 py-3 hover:bg-zinc-900/20 transition-colors group">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Lock size={12} className="text-zinc-600 shrink-0" />
                                  <span className="text-sm font-mono text-zinc-200 font-medium truncate">{key}</span>
                                  <span className="hidden sm:inline text-[10px] border border-zinc-700 text-zinc-500 rounded px-1.5 py-0.5 shrink-0">Sensitive</span>
                                </div>
                                <span className="hidden sm:block text-xs text-zinc-500 w-40 text-center">Production &amp; Preview</span>
                                {vault.updatedAt ? (
                                  <span className="text-xs text-zinc-600 sm:w-32 text-right">
                                    {new Date(vault.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                ) : <span className="sm:w-32" />}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-5 py-4 text-xs text-zinc-600">No stored variables yet.</div>
                        )}

                        {/* Pending new-var rows */}
                        {vault.pending.length > 0 && (
                          <div className="px-5 py-3 space-y-2 border-t border-zinc-800/40">
                            {vault.pending.map((row) => (
                              <div key={row.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={row.key}
                                  onChange={(e) => updateRow(name, row.id, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                                  placeholder="VARIABLE_NAME"
                                  spellCheck={false}
                                  className="flex-1 min-w-0 bg-black border border-zinc-700 rounded-md py-2 px-3 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 uppercase"
                                />
                                <div className="relative flex-1 min-w-0">
                                  <input
                                    type={row.showValue ? 'text' : 'password'}
                                    value={row.value}
                                    onChange={(e) => updateRow(name, row.id, { value: e.target.value })}
                                    placeholder="Value"
                                    className="w-full bg-black border border-zinc-700 rounded-md py-2 pl-3 pr-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateRow(name, row.id, { showValue: !row.showValue })}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                                    tabIndex={-1}
                                  >
                                    {row.showValue ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                                </div>
                                <button
                                  onClick={() => removeRow(name, row.id)}
                                  className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors shrink-0"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Footer actions */}
                        <div className="flex flex-col gap-2 px-5 py-4 bg-zinc-900/10 border-t border-zinc-800/40">
                          {storedEntries.some(([k]) => k.startsWith('VITE_') || k.startsWith('REACT_APP_') || k.startsWith('NEXT_PUBLIC_')) && (
                            <p className="text-[11px] text-amber-500/70">
                              Public vars (VITE_*, REACT_APP_*, NEXT_PUBLIC_*) require a full rebuild — Apply &amp; Restart will rebuild automatically.
                            </p>
                          )}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => addRow(name)}
                            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors font-medium"
                          >
                            <Plus size={14} /> Add Environment Variable
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => applySecrets(name)}
                              disabled={vault.saving || storedEntries.length === 0}
                              className="h-8 px-3 rounded-md text-xs font-semibold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Apply &amp; Restart
                            </button>
                            <button
                              onClick={() => saveSecrets(name)}
                              disabled={vault.saving || !hasPendingValid}
                              className="h-8 px-4 rounded-md text-xs font-semibold bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              {vault.saving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

