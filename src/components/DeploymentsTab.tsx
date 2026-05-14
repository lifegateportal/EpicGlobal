import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Trash2, KeyRound, RefreshCw, Search, ChevronDown, ChevronUp, ExternalLink, Plus, Eye, EyeOff, Lock, X, Pencil, Folder, FolderPlus, FilePlus, FileText, ArrowLeft, ChevronRight, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { API, apiFetch } from '../api/client';
import type { HistoryEntry, Project } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingRow = { id: string; key: string; value: string; showValue: boolean };
type FileEntry = { name: string; isDir: boolean; size: number; mtime: string };
type FileMgrState = { currentPath: string; entries: FileEntry[]; loading: boolean; editing: string | null; editContent: string; editSaving: boolean; uploading: boolean };

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
  const [expandedFiles, setExpandedFiles] = useState<string | null>(null);
  const [fileMgr, setFileMgr] = useState<Record<string, FileMgrState>>({});
  const [newItemModal, setNewItemModal] = useState<{ project: string; type: 'file' | 'folder' } | null>(null);
  const [newItemName, setNewItemName] = useState('');

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

  const deleteSecret = async (projectName: string, varKey: string) => {
    if (!confirm(`Delete ${varKey}?`)) return;
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/secrets/${encodeURIComponent(projectName.toLowerCase())}/${encodeURIComponent(varKey)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success(`${varKey} deleted.`);
        loadVaultPreview(projectName);
      } else {
        toast.error(data.error || 'Delete failed.');
      }
    } catch { toast.error('Could not reach API.'); }
  };

  const editSecret = (projectName: string, varKey: string) => {
    // Pre-fill a pending row with the existing key so user just types the new value
    const vault = getVault(projectName);
    const alreadyPending = vault.pending.some(r => r.key === varKey);
    if (!alreadyPending) {
      patchVault(projectName, { pending: [...vault.pending, { id: `row-${++rowCounter}`, key: varKey, value: '', showValue: false }] });
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

  // ── File Manager ───────────────────────────────────────────────────────────

  const getFileMgr = (name: string): FileMgrState =>
    fileMgr[name] ?? { currentPath: '', entries: [], loading: false, editing: null, editContent: '', editSaving: false, uploading: false };

  const patchFileMgr = (name: string, patch: Partial<FileMgrState>) =>
    setFileMgr(prev => ({ ...prev, [name]: { ...getFileMgr(name), ...patch } }));

  const browseFiles = async (name: string, subpath: string = '') => {
    patchFileMgr(name, { loading: true, currentPath: subpath });
    try {
      const qs = subpath ? `?path=${encodeURIComponent(subpath)}` : '';
      const res  = await apiFetch(`${API}/api/orchestrator/files/${encodeURIComponent(name)}/browse${qs}`);
      const data = await res.json();
      if (data.success) patchFileMgr(name, { entries: data.entries, loading: false });
      else { toast.error(data.error || 'Could not list files.'); patchFileMgr(name, { loading: false }); }
    } catch { toast.error('Could not reach API.'); patchFileMgr(name, { loading: false }); }
  };

  const toggleFiles = (name: string) => {
    if (expandedFiles === name) { setExpandedFiles(null); return; }
    setExpandedFiles(name);
    browseFiles(name, '');
  };

  const createItem = async () => {
    if (!newItemModal || !newItemName.trim()) return;
    const { project, type } = newItemModal;
    const mgr = getFileMgr(project);
    const relPath = mgr.currentPath ? `${mgr.currentPath}/${newItemName.trim()}` : newItemName.trim();
    const url = type === 'file'
      ? `${API}/api/orchestrator/files/${encodeURIComponent(project)}/file`
      : `${API}/api/orchestrator/files/${encodeURIComponent(project)}/folder`;
    try {
      const res  = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(type === 'file' ? { relPath, content: '' } : { relPath }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${type === 'file' ? 'File' : 'Folder'} created.`);
        setNewItemModal(null); setNewItemName('');
        browseFiles(project, mgr.currentPath);
      } else toast.error(data.error || 'Failed to create.');
    } catch { toast.error('Could not reach API.'); }
  };

  const deleteItem = async (projectName: string, relPath: string) => {
    if (!confirm(`Delete ${relPath}?`)) return;
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/files/${encodeURIComponent(projectName)}/item`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath }),
      });
      const data = await res.json();
      if (data.success) { toast.success('Deleted.'); browseFiles(projectName, getFileMgr(projectName).currentPath); }
      else toast.error(data.error || 'Delete failed.');
    } catch { toast.error('Could not reach API.'); }
  };

  const openEditor = async (projectName: string, relPath: string) => {
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/files/${encodeURIComponent(projectName)}/content?path=${encodeURIComponent(relPath)}`);
      const data = await res.json();
      if (data.success) patchFileMgr(projectName, { editing: relPath, editContent: data.content, editSaving: false });
      else toast.error(data.error || 'Could not load file.');
    } catch { toast.error('Could not reach API.'); }
  };

  const saveEdit = async (projectName: string) => {
    const mgr = getFileMgr(projectName);
    if (!mgr.editing) return;
    patchFileMgr(projectName, { editSaving: true });
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/files/${encodeURIComponent(projectName)}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relPath: mgr.editing, content: mgr.editContent }),
      });
      const data = await res.json();
      if (data.success) { toast.success('File saved.'); patchFileMgr(projectName, { editing: null, editContent: '', editSaving: false }); }
      else toast.error(data.error || 'Save failed.');
    } catch { toast.error('Could not reach API.'); }
    finally { patchFileMgr(projectName, { editSaving: false }); }
  };

  const uploadFiles = async (projectName: string, inputFiles: FileList) => {
    if (!inputFiles.length) return;
    patchFileMgr(projectName, { uploading: true });
    const mgr = getFileMgr(projectName);
    const fd  = new FormData();
    fd.append('targetPath', mgr.currentPath);
    Array.from(inputFiles).forEach(f => {
      fd.append('files', f);
      // webkitRelativePath preserves folder structure; fall back to plain name
      fd.append('relPaths', (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    });
    try {
      const res  = await apiFetch(`${API}/api/orchestrator/files/${encodeURIComponent(projectName)}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) { toast.success(`${data.count} file${data.count !== 1 ? 's' : ''} uploaded.`); browseFiles(projectName, mgr.currentPath); }
      else toast.error(data.error || 'Upload failed.');
    } catch { toast.error('Could not reach API.'); }
    finally { patchFileMgr(projectName, { uploading: false }); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const filtered = history.filter(({ projectName, status }) => {
    const q = query.toLowerCase();
    return !q || projectName?.toLowerCase().includes(q) || status?.toLowerCase().includes(q);
  });

  const liveProjectNames = Object.keys(projects).filter(n => Boolean(n) && n !== 'undefined');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

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
          <div className="divide-y divide-zinc-800/60 max-h-[440px] overflow-y-auto">{filtered.map((entry) => {
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
                              <div key={key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] items-center px-4 sm:px-5 py-3 hover:bg-zinc-900/20 transition-colors group">
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
                                <div className="flex items-center gap-1 transition-opacity justify-end">
                                  <button
                                    onClick={() => editSecret(name, key)}
                                    className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                                    title="Edit / rotate value"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => deleteSecret(name, key)}
                                    className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                                    title="Delete variable"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
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

      {/* STATIC FILE MANAGER ────────────────────────────────────────────── */}
      {liveProjectNames.some(n => projects[n]?.deployType === 'static') && (
        <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Folder size={16} className="text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Static File Manager</h2>
            </div>
            <span className="text-xs text-zinc-600">Create, edit &amp; delete files · static sites only</span>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {liveProjectNames.filter(n => projects[n]?.deployType === 'static').map(name => {
              const mgr     = getFileMgr(name);
              const project = projects[name];
              const isOpen  = expandedFiles === name;
              const breadcrumb = mgr.currentPath ? mgr.currentPath.split('/') : [];
              return (
                <div key={name}>
                  <button
                    onClick={() => toggleFiles(name)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Folder size={14} className="text-zinc-500 shrink-0" />
                      <span className="text-sm font-semibold text-zinc-100">{name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        project?.health.status === 'online' ? 'text-green-400 bg-green-950' : 'text-zinc-500 bg-zinc-800'
                      }`}>{project?.health.status ?? 'stopped'}</span>
                      {project?.domain && <span className="text-xs text-zinc-600">{project.domain}</span>}
                    </div>
                    {isOpen ? <ChevronUp size={14} className="text-zinc-500 shrink-0" /> : <ChevronDown size={14} className="text-zinc-500 shrink-0" />}
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
                        {mgr.editing ? (
                          /* ── Inline editor with line numbers ── */
                          <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono text-zinc-400 truncate">{mgr.editing}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => patchFileMgr(name, { editing: null, editContent: '' })}
                                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                >Cancel</button>
                                <button
                                  onClick={() => saveEdit(name)}
                                  disabled={mgr.editSaving}
                                  className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                                >{mgr.editSaving ? 'Saving…' : 'Save'}</button>
                              </div>
                            </div>
                            {/* Outer div scrolls — line numbers + textarea ride together, no JS sync needed */}
                            {(() => {
                              const lines = mgr.editContent.split('\n');
                              const lineCount = Math.max(lines.length, 20);
                              const LH = 21; // px — matches text-sm (14px) at 1.5 line-height
                              const PT = 12; // px — py-3
                              const editorH = lineCount * LH + PT * 2;
                              return (
                                <div className="border border-zinc-700 rounded-md overflow-auto bg-black" style={{ height: '18rem' }}>
                                  <div className="flex" style={{ minHeight: '18rem' }}>
                                    {/* Gutter */}
                                    <div
                                      className="sticky left-0 z-10 bg-[#111] border-r border-zinc-800 select-none shrink-0 text-right"
                                      style={{ minWidth: '3.2rem', paddingTop: PT, paddingBottom: PT }}
                                      aria-hidden="true"
                                    >
                                      {Array.from({ length: lineCount }, (_, i) => (
                                        <div key={i} className="pr-3 text-zinc-600 font-mono" style={{ fontSize: 12, lineHeight: `${LH}px` }}>
                                          {i + 1}
                                        </div>
                                      ))}
                                    </div>
                                    {/* Textarea — overflow hidden, height driven by content */}
                                    <textarea
                                      value={mgr.editContent}
                                      onChange={e => patchFileMgr(name, { editContent: e.target.value })}
                                      className="flex-1 bg-black text-zinc-200 font-mono resize-none focus:outline-none overflow-hidden pl-3 pr-3"
                                      style={{ fontSize: 14, lineHeight: `${LH}px`, paddingTop: PT, paddingBottom: PT, height: editorH, minWidth: 0 }}
                                      spellCheck={false}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <>
                            {/* Breadcrumb + action buttons */}
                            <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-zinc-800/40 bg-zinc-900/10 flex-wrap">
                              <div className="flex items-center gap-1 text-xs text-zinc-500 flex-wrap">
                                <button onClick={() => browseFiles(name, '')} className="hover:text-zinc-300 transition-colors">{name}</button>
                                {breadcrumb.map((part, i) => {
                                  const partPath = breadcrumb.slice(0, i + 1).join('/');
                                  return (
                                    <span key={i} className="flex items-center gap-1">
                                      <ChevronRight size={10} className="text-zinc-700" />
                                      <button onClick={() => browseFiles(name, partPath)} className="hover:text-zinc-300 transition-colors">{part}</button>
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2">
                                {mgr.currentPath && (
                                  <button
                                    onClick={() => {
                                      const up = mgr.currentPath.includes('/') ? mgr.currentPath.split('/').slice(0, -1).join('/') : '';
                                      browseFiles(name, up);
                                    }}
                                    className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                                    title="Go up"
                                  ><ArrowLeft size={13} /></button>
                                )}
                                {/* Hidden inputs — per-project ID */}
                                <input id={`fi-${name}`} type="file" multiple className="hidden"
                                  onChange={e => { if (e.target.files) uploadFiles(name, e.target.files); e.target.value = ''; }} />
                                <input id={`fld-${name}`} type="file" className="hidden"
                                  {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
                                  onChange={e => { if (e.target.files) uploadFiles(name, e.target.files); e.target.value = ''; }} />
                                <button
                                  onClick={() => document.getElementById(`fi-${name}`)?.click()}
                                  disabled={mgr.uploading}
                                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700/60 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
                                ><Upload size={13} /> {mgr.uploading ? 'Uploading…' : 'Upload Files'}</button>
                                <button
                                  onClick={() => document.getElementById(`fld-${name}`)?.click()}
                                  disabled={mgr.uploading}
                                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700/60 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
                                ><Folder size={13} /> Upload Folder</button>
                                <button
                                  onClick={() => { setNewItemModal({ project: name, type: 'folder' }); setNewItemName(''); }}
                                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700/60 px-2.5 py-1.5 rounded transition-colors"
                                ><FolderPlus size={13} /> New Folder</button>
                                <button
                                  onClick={() => { setNewItemModal({ project: name, type: 'file' }); setNewItemName(''); }}
                                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700/60 px-2.5 py-1.5 rounded transition-colors"
                                ><FilePlus size={13} /> New File</button>
                              </div>
                            </div>

                            {/* New item input */}
                            {newItemModal?.project === name && (
                              <div className="px-5 py-3 border-b border-zinc-800/40 bg-zinc-900/20 flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-zinc-500 shrink-0">
                                  {newItemModal.type === 'file' ? 'File name:' : 'Folder name:'}
                                </span>
                                <input
                                  autoFocus
                                  type="text"
                                  value={newItemName}
                                  onChange={e => setNewItemName(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') createItem(); if (e.key === 'Escape') setNewItemModal(null); }}
                                  placeholder={newItemModal.type === 'file' ? 'index.html' : 'assets'}
                                  className="flex-1 min-w-40 bg-black border border-zinc-700 rounded-md py-1.5 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                                />
                                <button onClick={createItem} className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1.5 rounded transition-colors">Create</button>
                                <button onClick={() => setNewItemModal(null)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
                              </div>
                            )}

                            {/* File listing */}
                            {mgr.loading ? (
                              <div className="px-5 py-6 text-center text-zinc-600 text-sm">Loading files…</div>
                            ) : mgr.entries.length === 0 ? (
                              <div className="px-5 py-6 text-center text-zinc-600 text-sm">Empty directory. Use the buttons above to create a file or folder.</div>
                            ) : (
                              <div className="divide-y divide-zinc-800/40 max-h-72 overflow-y-auto">
                                {mgr.entries.map(entry => {
                                  const relPath = mgr.currentPath ? `${mgr.currentPath}/${entry.name}` : entry.name;
                                  return (
                                    <div key={entry.name} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-900/20 transition-colors group">
                                      {entry.isDir
                                        ? <Folder size={14} className="text-blue-400 shrink-0" />
                                        : <FileText size={14} className="text-zinc-500 shrink-0" />}
                                      <button
                                        onClick={() => entry.isDir ? browseFiles(name, relPath) : openEditor(name, relPath)}
                                        className={`flex-1 text-sm text-left truncate ${entry.isDir ? 'text-zinc-200 font-medium hover:text-white' : 'text-zinc-300 hover:text-white'} transition-colors`}
                                      >{entry.name}</button>
                                      {!entry.isDir && (
                                        <span className="text-xs text-zinc-600 shrink-0 hidden sm:block">
                                          {entry.size < 1024 ? `${entry.size}B` : `${(entry.size / 1024).toFixed(1)}KB`}
                                        </span>
                                      )}
                                      <span className="text-xs text-zinc-700 shrink-0 hidden sm:block">
                                        {new Date(entry.mtime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                      <button
                                        onClick={() => deleteItem(name, relPath)}
                                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors shrink-0"
                                        title={`Delete ${entry.name}`}
                                      ><Trash2 size={12} /></button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

