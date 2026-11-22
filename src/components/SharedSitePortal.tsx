import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronRight, FileText, Folder, LogOut, MessageSquare, RefreshCw, Save, Send, Trash2, Upload } from 'lucide-react';
import { API } from '../api/client';

type FileEntry = { name: string; isDir: boolean; size: number; mtime: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type SharedResponse = {
  success: boolean;
  error?: string;
  projectName?: string;
  domain?: string | null;
  entries?: FileEntry[];
  content?: string;
  answer?: string;
  pendingChangeId?: string | null;
  proposedFiles?: string[];
  changes?: Array<{ path: string; content: string }>;
  changedFiles?: string[];
  count?: number;
};

export default function SharedSitePortal({ shareId }: { shareId: string }) {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [domain, setDomain] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newItemType, setNewItemType] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingChangeId, setPendingChangeId] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Array<{ path: string; content: string }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const request = useCallback(async (endpoint: string, init?: RequestInit): Promise<SharedResponse> => {
    const response = await fetch(`${API}/api/shared/${encodeURIComponent(shareId)}${endpoint}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });
    const data = await response.json() as SharedResponse;
    if (!response.ok || !data.success) {
      const requestError = new Error(data.error || 'The request could not be completed.') as Error & { status?: number };
      requestError.status = response.status;
      throw requestError;
    }
    return data;
  }, [shareId]);

  const browse = useCallback(async (subpath: string) => {
    try {
      const query = subpath ? `?path=${encodeURIComponent(subpath)}` : '';
      const data = await request(`/files${query}`);
      setCurrentPath(subpath);
      setEntries(data.entries || []);
      setSelectedFile(null);
      setError('');
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Could not load website files.';
      setError(message);
      if ((requestError as Error & { status?: number }).status === 401) setAuthenticated(false);
    }
  }, [request]);

  useEffect(() => {
    let active = true;
    request('/session')
      .then(async data => {
        const files = await request('/files');
        if (!active) return;
        setProjectName(data.projectName || '');
        setDomain(data.domain || null);
        setEntries(files.entries || []);
        setAuthenticated(true);
      })
      .catch(requestError => {
        if (active && (requestError as Error & { status?: number }).status !== 401) {
          setError(requestError instanceof Error ? requestError.message : 'Could not validate this access link.');
        }
      });
    return () => { active = false; };
  }, [request]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const data = await request('/login', { method: 'POST', body: JSON.stringify({ password }) });
      setProjectName(data.projectName || '');
      setDomain(data.domain || null);
      setCurrentPath('');
      setAuthenticated(true);
      setPassword('');
      void browse('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not log in.');
    }
  };

  const logout = async () => {
    try { await request('/logout', { method: 'POST' }); }
    catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not log out from the server.');
    }
    finally {
      setAuthenticated(false);
      setEntries([]);
      setMessages([]);
      setSelectedFile(null);
    }
  };

  const openFile = async (relPath: string) => {
    try {
      const data = await request(`/content?path=${encodeURIComponent(relPath)}`);
      setSelectedFile(relPath);
      setFileContent(data.content || '');
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not open this file.');
      if ((requestError as Error & { status?: number }).status === 401) setAuthenticated(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await request('/file', { method: 'PUT', body: JSON.stringify({ relPath: selectedFile, content: fileContent }) });
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not save this file.');
      if ((requestError as Error & { status?: number }).status === 401) setAuthenticated(false);
    } finally {
      setSaving(false);
    }
  };

  const createItem = async () => {
    if (!newItemType || !newItemName.trim()) return;
    const relPath = currentPath ? `${currentPath}/${newItemName.trim()}` : newItemName.trim();
    try {
      await request('/items', { method: 'POST', body: JSON.stringify({ type: newItemType, relPath }) });
      setNewItemName('');
      setNewItemType(null);
      await browse(currentPath);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create this item.');
    }
  };

  const deleteItem = async (relPath: string) => {
    if (!window.confirm(`Delete ${relPath}?`)) return;
    try {
      await request('/item', { method: 'DELETE', body: JSON.stringify({ relPath }) });
      if (selectedFile === relPath) setSelectedFile(null);
      await browse(currentPath);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete this item.');
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!window.confirm('Upload these files? Files with the same names will be replaced.')) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('targetPath', currentPath);
    Array.from(files).forEach(file => {
      formData.append('files', file);
      formData.append('relPaths', (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
    });
    try {
      await request('/upload', { method: 'POST', body: formData });
      await browse(currentPath);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not upload files.');
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    setChatInput('');
    setChatLoading(true);
    setError('');
    setMessages(previous => [...previous, { role: 'user', content: message }]);
    try {
      const data = await request('/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history: messages.slice(-10) }),
      });
      const proposed = data.proposedFiles?.length
        ? `\n\nProposed changes (not applied): ${data.proposedFiles.join(', ')}`
        : '';
      setMessages(previous => [...previous, { role: 'assistant', content: `${data.answer || ''}${proposed}` }]);
      if (data.pendingChangeId) {
        const proposal = await request(`/changes/${encodeURIComponent(data.pendingChangeId)}`);
        setPendingChangeId(data.pendingChangeId);
        setPendingChanges(proposal.changes || []);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The site assistant could not respond.');
      if ((requestError as Error & { status?: number }).status === 401) setAuthenticated(false);
    } finally {
      setChatLoading(false);
    }
  };

  const discardChanges = async () => {
    if (!pendingChangeId) return;
    try {
      await request(`/changes/${encodeURIComponent(pendingChangeId)}`, { method: 'DELETE' });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not discard proposed changes.');
    } finally {
      setPendingChangeId(null);
      setPendingChanges([]);
    }
  };

  const applyChanges = async () => {
    if (!pendingChangeId || !window.confirm(`Apply the proposed changes to ${pendingChanges.length} website file(s)?`)) return;
    try {
      const data = await request(`/changes/${encodeURIComponent(pendingChangeId)}/apply`, { method: 'POST' });
      setMessages(previous => [...previous, { role: 'assistant', content: `Applied changes to: ${(data.changedFiles || []).join(', ')}` }]);
      setPendingChangeId(null);
      setPendingChanges([]);
      await browse(currentPath);
      if (selectedFile && data.changedFiles?.includes(selectedFile)) await openFile(selectedFile);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not apply proposed changes.');
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black text-zinc-300 flex items-center justify-center p-4 font-sans">
        <form onSubmit={login} className="w-full max-w-sm rounded-xl border border-zinc-800 bg-[#0A0A0A] p-7 space-y-4">
          <div className="w-10 h-10 rounded-lg bg-white text-black flex items-center justify-center font-bold">EG</div>
          <div>
            <h1 className="text-lg font-semibold text-white">Website access</h1>
            <p className="text-sm text-zinc-500 mt-1">Enter the password provided by your site administrator.</p>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            autoFocus
            placeholder="Access password"
            className="w-full rounded-md border border-zinc-800 bg-black px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-zinc-600"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="w-full rounded-md bg-white py-2.5 text-sm font-medium text-black hover:bg-zinc-200">Continue</button>
        </form>
      </div>
    );
  }

  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans">
      <header className="border-b border-zinc-800 bg-[#0A0A0A] px-4 py-3 sm:px-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-zinc-600">Website workspace</p>
          <h1 className="text-base font-semibold text-white truncate">{projectName}</h1>
          {domain && <p className="text-xs text-zinc-500 truncate">{domain}</p>}
        </div>
        <button onClick={() => void logout()} className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:text-white">
          <LogOut size={14} /> Log out
        </button>
      </header>

      <main className="grid min-h-[calc(100vh-74px)] grid-cols-1 gap-4 p-4 lg:grid-cols-2 lg:p-6">
        <section className="min-w-0 rounded-xl border border-zinc-800 bg-[#0A0A0A] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2"><Folder size={15} /><h2 className="text-sm font-semibold text-white">Website files</h2></div>
            <button onClick={() => void browse(currentPath)} title="Refresh files" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><RefreshCw size={14} /></button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3">
            <div className="flex items-center gap-1 text-xs text-zinc-500 flex-wrap">
              <button onClick={() => void browse('')} className="hover:text-white">{projectName}</button>
              {breadcrumbs.map((part, index) => (
                <span key={index} className="flex items-center gap-1">
                  <ChevronRight size={11} />
                  <button onClick={() => void browse(breadcrumbs.slice(0, index + 1).join('/'))} className="hover:text-white">{part}</button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileInput} type="file" multiple className="hidden" onChange={event => { void uploadFiles(event.target.files); event.target.value = ''; }} />
              <button onClick={() => fileInput.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded bg-zinc-800 px-2.5 py-1.5 text-xs hover:bg-zinc-700 disabled:opacity-50">
                <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <button onClick={() => { setNewItemType('folder'); setNewItemName(''); }} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs hover:bg-zinc-700">New folder</button>
              <button onClick={() => { setNewItemType('file'); setNewItemName(''); }} className="rounded bg-zinc-800 px-2.5 py-1.5 text-xs hover:bg-zinc-700">New file</button>
            </div>
          </div>
          {newItemType && (
            <form onSubmit={event => { event.preventDefault(); void createItem(); }} className="flex gap-2 border-b border-zinc-800/70 p-3">
              <input autoFocus value={newItemName} onChange={event => setNewItemName(event.target.value)} placeholder={newItemType === 'file' ? 'index.html' : 'assets'} className="min-w-0 flex-1 rounded border border-zinc-700 bg-black px-2.5 py-1.5 text-sm outline-none focus:border-zinc-500" />
              <button className="rounded bg-zinc-700 px-3 text-xs text-white">Create</button>
              <button type="button" onClick={() => setNewItemType(null)} className="px-2 text-xs text-zinc-500">Cancel</button>
            </form>
          )}
          {error && <p className="border-b border-red-900/50 bg-red-950/20 px-4 py-2 text-xs text-red-300">{error}</p>}
          <div className="divide-y divide-zinc-800/60 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-600">This folder is empty.</p>
            ) : entries.map(entry => {
              const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
              return (
                <div key={relPath} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/50">
                  {entry.isDir ? <Folder size={14} className="text-blue-400" /> : <FileText size={14} className="text-zinc-500" />}
                  <button onClick={() => entry.isDir ? void browse(relPath) : void openFile(relPath)} className="min-w-0 flex-1 truncate text-left text-sm hover:text-white">
                    {entry.name}
                  </button>
                  {!entry.isDir && <span className="text-[11px] text-zinc-600">{entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}</span>}
                  <button onClick={() => void deleteItem(relPath)} title={`Delete ${entry.name}`} className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
          {selectedFile && (
            <div className="border-t border-zinc-800 p-3 flex flex-1 flex-col gap-2 min-h-80">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs text-zinc-400">{selectedFile}</span>
                <button onClick={() => void saveFile()} disabled={saving} className="flex items-center gap-1.5 rounded bg-zinc-700 px-3 py-1.5 text-xs text-white hover:bg-zinc-600 disabled:opacity-50">
                  {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} Save
                </button>
              </div>
              <textarea value={fileContent} onChange={event => setFileContent(event.target.value)} spellCheck={false} className="min-h-72 flex-1 resize-y rounded border border-zinc-800 bg-black p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-zinc-600" />
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-zinc-800 bg-[#0A0A0A] overflow-hidden flex flex-col min-h-[32rem]">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <Bot size={16} className="text-sky-400" /><h2 className="text-sm font-semibold text-white">DeepSeek site assistant</h2>
          </div>
          <p className="border-b border-zinc-800/70 px-4 py-2.5 text-xs text-zinc-500">The assistant can read this website’s text-based files only. Content it reads is sent to DeepSeek; proposed edits require your approval before they are saved.</p>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border border-zinc-800 bg-black/50 p-4 text-sm text-zinc-500">
                <MessageSquare size={15} className="mb-2 text-zinc-600" />
                Ask for a change, or ask the assistant to review files and documents in this website.
              </div>
            )}
            {messages.map((entry, index) => (
              <div key={index} className={`max-w-[95%] rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap ${entry.role === 'user' ? 'ml-auto bg-zinc-800 text-zinc-100' : 'mr-auto bg-black text-zinc-300 border border-zinc-800'}`}>
                {entry.content}
              </div>
            ))}
            {chatLoading && <p className="text-xs text-zinc-600 animate-pulse">Assistant is working with the website files…</p>}
          </div>
          {pendingChangeId && pendingChanges.length > 0 && (
            <div className="border-t border-amber-900/40 bg-amber-950/10 p-3 space-y-3">
              <div>
                <p className="text-sm font-medium text-amber-200">Review proposed changes</p>
                <p className="text-xs text-zinc-500 mt-1">Nothing is saved to the website until you apply these files.</p>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {pendingChanges.map(change => (
                  <details key={change.path} className="rounded border border-zinc-800 bg-black">
                    <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-zinc-300">{change.path}</summary>
                    <pre className="max-h-48 overflow-auto border-t border-zinc-800 p-3 text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap">{change.content}</pre>
                  </details>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => void discardChanges()} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white">Discard</button>
                <button onClick={() => void applyChanges()} className="rounded bg-amber-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-200">Apply changes</button>
              </div>
            </div>
          )}
          <form onSubmit={event => { event.preventDefault(); void sendMessage(); }} className="flex items-end gap-2 border-t border-zinc-800 p-3">
            <textarea value={chatInput} onChange={event => setChatInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={3} placeholder="Describe what you want to change…" className="min-w-0 flex-1 resize-y rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600" />
            <button type="submit" disabled={chatLoading || !chatInput.trim()} className="rounded-md bg-white p-2.5 text-black hover:bg-zinc-200 disabled:opacity-40" title="Send message"><Send size={15} /></button>
          </form>
          <div className="px-4 pb-3 text-[11px] text-zinc-700 flex items-center gap-1"><Check size={11} /> Changes are limited to this site’s files.</div>
        </section>
      </main>
    </div>
  );
}
