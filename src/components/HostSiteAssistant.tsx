import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronRight, FileText, Folder, MessageSquare, Paperclip, RefreshCw, Send, Undo2, X } from 'lucide-react';
import { API, apiFetch } from '../api/client';

type FileEntry = { name: string; isDir: boolean; size: number; mtime: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ProposedEdit = { oldText: string; newText: string };
type ProposedChange = {
  path: string;
  kind: 'text' | 'image';
  beforeContent: string | null;
  afterContent: string | null;
  edits: ProposedEdit[];
  mimeType: string | null;
  imageDataUrl: string | null;
};
type FileHistoryEntry = { id: string; createdAt: string; files: string[]; undoneAt: string | null };
type AssistantResponse = {
  success: boolean;
  error?: string;
  entries?: FileEntry[];
  content?: string;
  answer?: string;
  pendingChangeId?: string | null;
  proposedFiles?: string[];
  changes?: ProposedChange[];
  changedFiles?: string[];
  history?: FileHistoryEntry[];
  restoredFiles?: string[];
  deployed?: boolean;
  projectName?: string;
  url?: string;
};

const CREATE_NEW_SITE = '__create_new_site__';

export function HostSiteAssistant({ projectNames, onClose }: { projectNames: string[]; onClose: () => void }) {
  const [availableProjects, setAvailableProjects] = useState(projectNames);
  const [selectedProject, setSelectedProject] = useState(projectNames[0] || CREATE_NEW_SITE);
  const [newProjectName, setNewProjectName] = useState('');
  const [mobilePanel, setMobilePanel] = useState<'files' | 'chat'>('chat');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingChangeId, setPendingChangeId] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<ProposedChange[]>([]);
  const [imageAttachment, setImageAttachment] = useState<{ file: File; dataUrl: string } | null>(null);
  const [history, setHistory] = useState<FileHistoryEntry[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const creatingNewSite = selectedProject === CREATE_NEW_SITE;
  const projectName = creatingNewSite
    ? newProjectName.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    : selectedProject;
  const breadcrumbs = currentPath ? currentPath.split('/') : [];

  const request = useCallback(async (endpoint: string, init?: RequestInit): Promise<AssistantResponse> => {
    const response = await apiFetch(`${API}${endpoint}`, init);
    const data = await response.json() as AssistantResponse;
    if (!response.ok || !data.success) throw new Error(data.error || 'The request could not be completed.');
    return data;
  }, []);

  const loadFiles = useCallback(async (subpath = '') => {
    if (creatingNewSite || !selectedProject) {
      setCurrentPath('');
      setEntries([]);
      return;
    }
    setLoadingFiles(true);
    try {
      const query = new URLSearchParams({ projectName: selectedProject });
      if (subpath) query.set('path', subpath);
      const data = await request(`/api/orchestrator/site-assistant/files?${query}`);
      setCurrentPath(subpath);
      setEntries(data.entries || []);
      setPreview(null);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load website files.');
    } finally {
      setLoadingFiles(false);
    }
  }, [creatingNewSite, request, selectedProject]);

  const loadHistory = useCallback(async () => {
    if (creatingNewSite || !selectedProject) {
      setHistory([]);
      return;
    }
    try {
      const query = new URLSearchParams({ projectName: selectedProject });
      const data = await request(`/api/orchestrator/site-assistant/history?${query}`);
      setHistory(data.history || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load website history.');
    }
  }, [creatingNewSite, request, selectedProject]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFiles('');
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedProject, creatingNewSite, loadFiles, loadHistory]);

  useEffect(() => {
    if (chatScroll.current) chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [messages, chatLoading]);

  const openFile = async (relPath: string) => {
    try {
      const query = new URLSearchParams({ projectName: selectedProject, path: relPath });
      const data = await request(`/api/orchestrator/site-assistant/content?${query}`);
      setPreview({ path: relPath, content: data.content || '' });
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not open this website file.');
    }
  };

  const selectImage = (file: File | undefined) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      setError('Attach a JPEG, PNG, GIF, or WebP image smaller than 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageAttachment({ file, dataUrl: reader.result });
        setError('');
      } else setError('Could not read the attached image.');
    };
    reader.onerror = () => setError('Could not read the attached image.');
    reader.readAsDataURL(file);
  };

  const sendMessage = async () => {
    const message = chatInput.trim();
    if ((!message && !imageAttachment) || chatLoading || !projectName) return;
    if (creatingNewSite && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(projectName)) {
      setError('Choose a website name using lowercase letters, numbers, and hyphens.');
      return;
    }
    setChatInput('');
    setChatLoading(true);
    setError('');
    const prompt = message || 'Please inspect this image and suggest a suitable website placement.';
    setMessages(previous => [...previous, {
      role: 'user',
      content: imageAttachment ? `${prompt}\n[Image attached: ${imageAttachment.file.name}]` : prompt
    }]);
    try {
      const data = await request('/api/orchestrator/site-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          createProject: creatingNewSite,
          message: prompt,
          history: messages.slice(-20),
          ...(imageAttachment ? {
            image: {
              name: imageAttachment.file.name,
              mimeType: imageAttachment.file.type,
              data: imageAttachment.dataUrl.split(',')[1]
            }
          } : {})
        })
      });
      const proposed = data.proposedFiles?.length
        ? `\n\nProposed files awaiting your review: ${data.proposedFiles.join(', ')}`
        : '';
      setMessages(previous => [...previous, { role: 'assistant', content: `${data.answer || ''}${proposed}` }]);
      setImageAttachment(null);
      if (data.pendingChangeId) {
        const proposal = await request(`/api/orchestrator/site-assistant/changes/${encodeURIComponent(data.pendingChangeId)}`);
        setPendingChangeId(data.pendingChangeId);
        setPendingChanges(proposal.changes || []);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The host assistant could not respond.');
    } finally {
      setChatLoading(false);
    }
  };

  const discardChanges = async () => {
    if (!pendingChangeId) return;
    try {
      await request(`/api/orchestrator/site-assistant/changes/${encodeURIComponent(pendingChangeId)}`, { method: 'DELETE' });
      setPendingChangeId(null);
      setPendingChanges([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not discard proposed changes.');
    }
  };

  const applyChanges = async () => {
    if (!pendingChangeId) return;
    setApplying(true);
    setError('');
    try {
      const data = await request(`/api/orchestrator/site-assistant/changes/${encodeURIComponent(pendingChangeId)}/apply`, { method: 'POST' });
      const confirmation = data.deployed
        ? `Created and deployed ${data.projectName} at ${data.url}.`
        : `Applied changes to: ${(data.changedFiles || []).join(', ')}`;
      setMessages(previous => [...previous, { role: 'assistant', content: confirmation }]);
      if (data.deployed && data.projectName) {
        setAvailableProjects(previous => [...new Set([...previous, data.projectName!])]);
        setSelectedProject(data.projectName);
      }
      setPendingChangeId(null);
      setPendingChanges([]);
      await loadFiles(currentPath);
      await loadHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not apply the proposed changes.');
    } finally {
      setApplying(false);
    }
  };

  const undoChange = async (entry: FileHistoryEntry) => {
    if (!window.confirm(`Undo changes to ${entry.files.join(', ')}?`)) return;
    setUndoingId(entry.id);
    try {
      const data = await request(`/api/orchestrator/site-assistant/history/${encodeURIComponent(entry.id)}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: selectedProject })
      });
      setMessages(previous => [...previous, { role: 'assistant', content: `Undid changes to: ${(data.restoredFiles || []).join(', ')}` }]);
      await loadFiles(currentPath);
      await loadHistory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not undo this change.');
    } finally {
      setUndoingId(null);
    }
  };

  const changeProject = (nextProject: string) => {
    setSelectedProject(nextProject);
    setMessages([]);
    setPendingChangeId(null);
    setPendingChanges([]);
    setImageAttachment(null);
    setCurrentPath('');
    setPreview(null);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex h-[100dvh] flex-col overflow-hidden bg-black text-zinc-300 font-sans">
      <header className="shrink-0 border-b border-zinc-800 bg-[#0A0A0A] px-3 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Bot size={17} className="shrink-0 text-sky-400" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white">Host website assistant</h1>
              <p className="hidden text-[11px] text-zinc-500 sm:block">Scoped access to static websites · up to 8,192 response tokens</p>
            </div>
          </div>
          <select
            value={selectedProject}
            onChange={event => changeProject(event.target.value)}
            aria-label="Select a static website"
            className="min-w-0 max-w-[48%] rounded-md border border-zinc-700 bg-black px-2.5 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-500 sm:max-w-64"
          >
            {availableProjects.map(name => <option key={name} value={name}>{name}</option>)}
            <option value={CREATE_NEW_SITE}>Create a new static website…</option>
          </select>
          <button onClick={onClose} aria-label="Close host assistant" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X size={17} />
          </button>
        </div>
        {creatingNewSite && (
          <input
            value={newProjectName}
            onChange={event => setNewProjectName(event.target.value)}
            placeholder="New website name, for example spring-campaign"
            className="mt-3 w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600"
          />
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
          <button onClick={() => setMobilePanel('files')} className={`rounded-md px-3 py-2 text-xs font-medium ${mobilePanel === 'files' ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400'}`}>Website files</button>
          <button onClick={() => setMobilePanel('chat')} className={`rounded-md px-3 py-2 text-xs font-medium ${mobilePanel === 'chat' ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400'}`}>Assistant</button>
        </div>
      </header>

      <main className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2">
        <section className={`${mobilePanel === 'files' ? 'flex' : 'hidden'} relative min-h-0 flex-col border-r border-zinc-800 md:flex`}>
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2"><Folder size={15} /><h2 className="text-sm font-semibold text-white">Website files</h2></div>
            {!creatingNewSite && <button onClick={() => void loadFiles(currentPath)} title="Refresh files" className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><RefreshCw size={14} /></button>}
          </div>
          {!creatingNewSite && (
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-zinc-800/70 px-4 py-3 text-xs text-zinc-500">
              <button onClick={() => void loadFiles('')} className="hover:text-white">{selectedProject}</button>
              {breadcrumbs.map((part, index) => (
                <span key={index} className="flex items-center gap-1">
                  <ChevronRight size={11} />
                  <button onClick={() => void loadFiles(breadcrumbs.slice(0, index + 1).join('/'))} className="hover:text-white">{part}</button>
                </span>
              ))}
            </div>
          )}
          {creatingNewSite ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
              New website files are created by the assistant and remain staged until you choose Apply and deploy.
            </div>
          ) : (
            <div className="flex-1 min-h-0 divide-y divide-zinc-800/60 overflow-y-auto">
              {loadingFiles ? <p className="p-5 text-sm text-zinc-600">Loading files…</p> : entries.length === 0 ? (
                <p className="p-5 text-sm text-zinc-600">This folder is empty.</p>
              ) : entries.map(entry => {
                const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                return (
                  <div key={relPath} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/50">
                    {entry.isDir ? <Folder size={14} className="text-blue-400" /> : <FileText size={14} className="text-zinc-500" />}
                    <button onClick={() => entry.isDir ? void loadFiles(relPath) : void openFile(relPath)} className="min-w-0 flex-1 truncate text-left text-sm hover:text-white">{entry.name}</button>
                    {!entry.isDir && <span className="text-[11px] text-zinc-600">{entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {!creatingNewSite && history.length > 0 && (
            <div className="max-h-40 shrink-0 space-y-2 overflow-y-auto border-t border-zinc-800 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-400"><Undo2 size={13} /> Saved versions</p>
              {history.slice(0, 8).map(entry => (
                <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-zinc-600">{new Date(entry.createdAt).toLocaleString()} · {entry.files.join(', ')}{entry.undoneAt ? ' · undone' : ''}</span>
                  {!entry.undoneAt && <button onClick={() => void undoChange(entry)} disabled={undoingId === entry.id} className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-40">{undoingId === entry.id ? 'Undoing…' : 'Undo'}</button>}
                </div>
              ))}
            </div>
          )}
          {preview && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[60%] flex-col border-t border-zinc-700 bg-[#0A0A0A] shadow-2xl">
              <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">{preview.path}</span>
                <button onClick={() => setPreview(null)} aria-label="Close file preview" className="p-1 text-zinc-500 hover:text-white"><X size={14} /></button>
              </div>
              <pre className="overflow-auto p-3 text-[11px] leading-relaxed text-zinc-300">{preview.content}</pre>
            </div>
          )}
        </section>

        <section className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-col md:flex`}>
          <div ref={chatScroll} className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3 sm:p-4">
            {messages.length === 0 && (
              <div className="rounded-lg border border-zinc-800 bg-[#0A0A0A] p-4 text-sm text-zinc-500">
                <MessageSquare size={15} className="mb-2 text-zinc-600" />
                {creatingNewSite
                  ? 'Describe the complete static website you want built. The assistant can create a multi-page, mobile-first site and deploy it after your approval.'
                  : 'Ask for a targeted fix, a full rewrite of selected files, or a review of this website. Changes are staged for your approval.'}
              </div>
            )}
            {messages.map((entry, index) => (
              <div key={index} className={`max-w-[95%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${entry.role === 'user' ? 'ml-auto border-zinc-700 bg-zinc-800 text-zinc-100' : 'mr-auto border-zinc-800 bg-[#0A0A0A] text-zinc-300'}`}>
                {entry.content}
              </div>
            ))}
            {chatLoading && <p className="text-xs text-zinc-600 animate-pulse">Assistant is working with the selected website…</p>}
            <div ref={messagesEnd} />
          </div>
          {error && <p role="alert" className="shrink-0 border-t border-red-900/50 bg-red-950/20 px-4 py-2 text-xs text-red-300">{error}</p>}
          {pendingChangeId && pendingChanges.length > 0 && (
            <div className="max-h-[38%] shrink-0 space-y-2 overflow-y-auto border-t border-amber-900/40 bg-amber-950/10 p-3">
              <div>
                <p className="text-sm font-medium text-amber-200">Review proposed changes</p>
                <p className="mt-1 text-xs text-zinc-500">{creatingNewSite ? 'Nothing is deployed until you approve this new website.' : 'Nothing is saved to the website until you approve these files.'}</p>
              </div>
              {pendingChanges.map(change => (
                <details key={change.path} className="rounded border border-zinc-800 bg-black">
                  <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-zinc-300">{change.kind === 'image' ? 'Image asset: ' : ''}{change.path}</summary>
                  <div className="space-y-2 border-t border-zinc-800 p-3">
                    {change.kind === 'image' && change.imageDataUrl ? (
                      <img src={change.imageDataUrl} alt={`Proposed image ${change.path}`} className="max-h-36 max-w-full rounded object-contain" />
                    ) : change.edits.length > 0 ? change.edits.map((edit, index) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-2">
                        <pre className="max-h-28 overflow-auto rounded bg-red-950/20 p-2 text-[11px] leading-relaxed text-red-200 whitespace-pre-wrap">{edit.oldText}</pre>
                        <pre className="max-h-28 overflow-auto rounded bg-green-950/20 p-2 text-[11px] leading-relaxed text-green-200 whitespace-pre-wrap">{edit.newText}</pre>
                      </div>
                    )) : <pre className="max-h-32 overflow-auto whitespace-pre-wrap p-2 text-[11px] leading-relaxed text-zinc-400">{change.afterContent}</pre>}
                  </div>
                </details>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => void discardChanges()} disabled={applying} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-40">Discard</button>
                <button onClick={() => void applyChanges()} disabled={applying} className="rounded bg-amber-300 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-200 disabled:opacity-40">
                  {applying ? 'Applying…' : creatingNewSite ? 'Apply and deploy' : 'Apply changes'}
                </button>
              </div>
            </div>
          )}
          {imageAttachment && (
            <div className="flex shrink-0 items-center gap-3 border-t border-zinc-800 px-3 py-2">
              <img src={imageAttachment.dataUrl} alt="Image attached for visual reference" className="h-10 w-10 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{imageAttachment.file.name}</span>
              <button type="button" onClick={() => setImageAttachment(null)} title="Remove attached image" className="rounded p-1 text-zinc-500 hover:text-white"><X size={14} /></button>
            </div>
          )}
          <form onSubmit={event => { event.preventDefault(); void sendMessage(); }} className="flex shrink-0 items-end gap-2 border-t border-zinc-800 bg-[#0A0A0A] p-3">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={event => { selectImage(event.target.files?.[0]); event.target.value = ''; }} />
            <button type="button" onClick={() => fileInput.current?.click()} title="Attach an image" className="rounded-md border border-zinc-800 p-2.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><Paperclip size={15} /></button>
            <textarea
              value={chatInput}
              onChange={event => setChatInput(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
              rows={2}
              placeholder={creatingNewSite ? 'Describe your new static website…' : 'Request a website fix, rewrite, or review…'}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-600"
            />
            <button type="submit" disabled={chatLoading || (!chatInput.trim() && !imageAttachment) || !projectName} className="rounded-md bg-white p-2.5 text-black hover:bg-zinc-200 disabled:opacity-40" title="Send message"><Send size={15} /></button>
          </form>
          <div className="flex shrink-0 items-center gap-1 px-4 pb-2 text-[11px] text-zinc-700"><Check size={11} /> {creatingNewSite ? 'New sites deploy only after your approval.' : 'Changes are scoped to this site, backed up, and undoable.'}</div>
        </section>
      </main>
    </div>
  );
}
