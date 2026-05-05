import { useState, useRef, type FormEvent, type ChangeEvent } from 'react';
import {
  GitBranch, Upload, Zap, ArrowRight, ArrowLeft,
  CheckCircle2, XCircle, Loader2, ExternalLink, Copy, Check,
  Globe, KeyRound, Link2, FileCode2, RefreshCw, Plus, X, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { API, getOrchestratorApiKey, apiFetch } from '../api/client';

/* ─── types ─────────────────────────────────────────────────────── */
type Source = 'github' | 'epicodespaces' | 'git' | 'upload';

type EnvRow = { id: number; key: string; value: string };

type DeployState =
  | { phase: 'idle' }
  | { phase: 'deploying' }
  | { phase: 'success'; url: string; log: string }
  | { phase: 'error'; message: string; log: string };

/* ─── helpers ───────────────────────────────────────────────────── */
let envRowId = 0;
const newEnvRow = (): EnvRow => ({ id: ++envRowId, key: '', value: '' });

function slugify(v: string) {
  return v.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

/* ─── source tiles ───────────────────────────────────────────────── */
const SOURCES: { id: Source; label: string; sub: string; icon: React.ReactNode; accent: string }[] = [
  {
    id: 'github',
    label: 'GitHub',
    sub: 'Clone & deploy any public or private repository',
    icon: <GitBranch size={22} className="text-zinc-400" />,  // lucide-react has no Github icon; GitBranch used as proxy
    accent: 'hover:border-zinc-500 hover:bg-zinc-900/40',
  },
  {
    id: 'epicodespaces',
    label: 'EpiCodeSpaces',
    sub: 'Push from your IDE using the API connection',
    icon: <FileCode2 size={22} />,
    accent: 'hover:border-indigo-500/60 hover:bg-indigo-950/20',
  },
  {
    id: 'git',
    label: 'Custom Git URL',
    sub: 'Any git remote — GitLab, Bitbucket, self-hosted',
    icon: <GitBranch size={22} />,
    accent: 'hover:border-emerald-500/60 hover:bg-emerald-950/20',
  },
  {
    id: 'upload',
    label: 'File / ZIP Upload',
    sub: 'Upload a built static site or a ZIP archive',
    icon: <Upload size={22} />,
    accent: 'hover:border-amber-500/60 hover:bg-amber-950/20',
  },
];

/* ─── step indicator ─────────────────────────────────────────────── */
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all
      ${done ? 'border-green-500 bg-green-500/20 text-green-400' : active ? 'border-white bg-white/10 text-zinc-100' : 'border-zinc-700 text-zinc-600'}`}>
      {done ? <Check size={13} /> : n}
    </div>
  );
}

/* ─── main component ─────────────────────────────────────────────── */
export function SetupTab() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [source, setSource] = useState<Source | null>(null);

  /* form fields */
  const [repoUrl, setRepoUrl]           = useState('');
  const [projectName, setProjectName]   = useState('');
  const [domain, setDomain]             = useState('');
  const [accessToken, setAccessToken]   = useState('');
  const [envRows, setEnvRows]           = useState<EnvRow[]>([]);
  const [uploadFile, setUploadFile]     = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* deploy state */
  const [deployState, setDeployState] = useState<DeployState>({ phase: 'idle' });
  const [logLines, setLogLines]         = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  /* ── helpers ── */
  const autoSlug = (url: string) => {
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    if (match) setProjectName(slugify(match[1]));
  };

  const autoDomain = (name: string) => {
    if (name) setDomain(`${name}.epicglobal.app`);
  };

  const updateEnvRow = (id: number, patch: Partial<EnvRow>) =>
    setEnvRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));

  const removeEnvRow = (id: number) =>
    setEnvRows(rows => rows.filter(r => r.id !== id));

  const envText = envRows
    .filter(r => r.key.trim())
    .map(r => `${r.key.trim()}=${r.value}`)
    .join('\n');

  const canProceedStep1 = source !== null;
  const canProceedStep2 = source === 'upload'
    ? Boolean(projectName.trim() && uploadFile)
    : Boolean(projectName.trim() && repoUrl.trim());

  /* ── deploy ── */
  const handleDeploy = async (e: FormEvent) => {
    e.preventDefault();
    if (!getOrchestratorApiKey()) {
      toast.error('API key not set — go to Settings and save your ORCHESTRATOR_API_KEY first.');
      return;
    }

    setDeployState({ phase: 'deploying' });
    setLogLines('Connecting to Orchestrator…\n');

    try {
      let data: { success: boolean; url?: string; log?: string; terminalOutput?: string; error?: string };

      if (source === 'upload') {
        if (!uploadFile) { toast.error('Select a file.'); setDeployState({ phase: 'idle' }); return; }
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('projectName', slugify(projectName));
        if (domain.trim()) fd.append('domain', domain.trim());
        if (envText) fd.append('envText', envText);
        const res = await apiFetch(`${API}/api/orchestrator/upload`, { method: 'POST', body: fd });
        data = await res.json();
      } else {
        const payload: Record<string, string> = {
          projectName: slugify(projectName),
          repoUrl: repoUrl.trim(),
          domain: domain.trim() || `${slugify(projectName)}.epicglobal.app`,
        };
        if (accessToken.trim()) payload.accessToken = accessToken.trim();
        if (envText) payload.envText = envText;
        const res = await apiFetch(`${API}/api/orchestrator/deploy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        data = await res.json();
      }

      const log = String(data.terminalOutput || data.log || '').trim();
      setLogLines(log);
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

      if (data.success) {
        setDeployState({ phase: 'success', url: data.url || `https://${domain || slugify(projectName) + '.epicglobal.app'}`, log });
        toast.success(`${projectName} deployed successfully!`);
      } else {
        setDeployState({ phase: 'error', message: data.error || 'Deployment failed.', log });
        toast.error(data.error || 'Deployment failed.');
      }
    } catch (err) {
      const msg = 'Could not reach API. Check VITE_SOCKET_URL and API key.';
      setLogLines(msg);
      setDeployState({ phase: 'error', message: msg, log: msg });
      toast.error(msg);
    }
  };

  /* ── reset ── */
  const reset = () => {
    setStep(1); setSource(null);
    setRepoUrl(''); setProjectName(''); setDomain(''); setAccessToken('');
    setEnvRows([]); setUploadFile(null); setLogLines('');
    setDeployState({ phase: 'idle' });
  };

  /* ────────────────── render ────────────────────────────────────── */
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Connect a Project</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Deploy any repo or file to your EpicGlobal platform in seconds.</p>
        </div>

        {/* step dots */}
        <div className="hidden sm:flex items-center gap-2">
          {([1, 2, 3] as const).map((n, i) => (
            <>
              <StepDot key={n} n={n} active={step === n} done={step > n} />
              {i < 2 && <div key={`sep-${n}`} className={`w-8 h-px ${step > n ? 'bg-green-600' : 'bg-zinc-800'}`} />}
            </>
          ))}
        </div>
      </div>

      {/* ═══ STEP 1 — choose source ═══════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">1 — Choose a source</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {SOURCES.map(s => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={`text-left flex items-start gap-4 p-5 rounded-xl border transition-all
                  ${source === s.id
                    ? 'border-white bg-white/5 shadow-lg shadow-white/5'
                    : `border-zinc-800 bg-[#0A0A0A] ${s.accent}`}
                `}
              >
                <div className={`mt-0.5 ${source === s.id ? 'text-zinc-100' : 'text-zinc-500'}`}>{s.icon}</div>
                <div>
                  <p className={`text-sm font-semibold mb-1 ${source === s.id ? 'text-zinc-100' : 'text-zinc-300'}`}>{s.label}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{s.sub}</p>
                </div>
                {source === s.id && (
                  <Check size={15} className="text-white ml-auto mt-0.5 shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => canProceedStep1 && setStep(2)}
              disabled={!canProceedStep1}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg disabled:opacity-30 hover:bg-zinc-200 transition-colors"
            >
              Continue <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2 — configure ═══════════════════════════════════ */}
      {step === 2 && source && (
        <form onSubmit={e => { e.preventDefault(); if (canProceedStep2) setStep(3); }} className="space-y-5">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">2 — Configure</p>

          {/* EpiCodeSpaces info banner */}
          {source === 'epicodespaces' && (
            <div className="border border-indigo-800/40 bg-indigo-950/20 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <Link2 size={15} className="text-indigo-400" />
                <p className="text-sm font-medium text-zinc-100">EpiCodeSpaces Connection</p>
              </div>
              <p className="text-xs text-zinc-400">
                In your EpiCodeSpaces IDE, set these two environment variables then call the deploy endpoint from your project:
              </p>
              <div className="space-y-2">
                {[
                  ['EPICGLOBAL_API_URL', API],
                  ['EPICGLOBAL_API_KEY', getOrchestratorApiKey() || '(not set — go to Settings to save your key)'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 bg-black border border-zinc-800 rounded-md px-3 py-2">
                    <code className="text-xs text-zinc-500 shrink-0">{k}=</code>
                    <code className={`text-xs flex-1 font-mono select-all ${k === 'EPICGLOBAL_API_KEY' && !getOrchestratorApiKey() ? 'text-amber-400' : 'text-indigo-300'}`}>{v}</code>
                    <CopyBtn text={`${k}=${v}`} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                You can also deploy from EpiCodeSpaces by providing the repo URL below and clicking Deploy.
              </p>
            </div>
          )}

          {/* Repo URL / file upload */}
          {source === 'upload' ? (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">ZIP or static file *</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-colors"
              >
                <Upload size={20} className="text-zinc-500" />
                {uploadFile
                  ? <p className="text-sm text-zinc-200 font-medium">{uploadFile.name}</p>
                  : <p className="text-sm text-zinc-500">Click to select or drop a .zip or index.html</p>}
                <p className="text-xs text-zinc-600">Max 100 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.html,.htm,text/html"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">
                {source === 'github' ? 'GitHub repo URL *' : 'Git remote URL *'}
              </label>
              <div className="relative">
                <GitBranch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                <input
                  type="url"
                  value={repoUrl}
                  onChange={e => { setRepoUrl(e.target.value); autoSlug(e.target.value); }}
                  placeholder="https://github.com/you/my-app.git"
                  required
                  className="w-full bg-black border border-zinc-800 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Two-column: Project name + Domain */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">Project name *</label>
              <input
                type="text"
                value={projectName}
                onChange={e => { setProjectName(slugify(e.target.value)); autoDomain(slugify(e.target.value)); }}
                placeholder="my-app"
                required
                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
              />
              <p className="text-xs text-zinc-600">Lowercase, hyphens only. Used as PM2 process name.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <Globe size={12} /> Subdomain
              </label>
              <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                placeholder={`${projectName || 'my-app'}.epicglobal.app`}
                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <p className="text-xs text-zinc-600">Leave blank to auto-generate from project name.</p>
            </div>
          </div>

          {/* Access token (GitHub / custom git only) */}
          {(source === 'github' || source === 'git') && (
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <KeyRound size={12} /> Access token <span className="text-zinc-600">(optional — private repos)</span>
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="ghp_••••••••••••••••"
                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
              />
              <p className="text-xs text-zinc-600">Never stored. Used only for this clone operation.</p>
            </div>
          )}

          {/* Environment variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5">
                <Zap size={12} /> Environment variables <span className="text-zinc-600">(optional)</span>
              </label>
              <button
                type="button"
                onClick={() => setEnvRows(r => [...r, newEnvRow()])}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded-md px-2.5 py-1 transition-colors"
              >
                <Plus size={11} /> Add var
              </button>
            </div>
            {envRows.length > 0 && (
              <div className="space-y-2">
                {envRows.map(row => (
                  <div key={row.id} className="flex gap-2">
                    <input
                      type="text"
                      value={row.key}
                      onChange={e => updateEnvRow(row.id, { key: e.target.value.replace(/\s/g, '_').toUpperCase() })}
                      placeholder="KEY"
                      className="w-40 bg-black border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={e => updateEnvRow(row.id, { value: e.target.value })}
                      placeholder="value"
                      className="flex-1 bg-black border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvRow(row.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors p-2"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* nav */}
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={() => setStep(1)} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-100 transition-colors">
              <ArrowLeft size={14} /> Back
            </button>
            <button
              type="submit"
              disabled={!canProceedStep2}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg disabled:opacity-30 hover:bg-zinc-200 transition-colors"
            >
              Review & Deploy <ArrowRight size={15} />
            </button>
          </div>
        </form>
      )}

      {/* ═══ STEP 3 — review + deploy ═════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-5">
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">3 — Review & Deploy</p>

          {/* summary card */}
          {deployState.phase !== 'success' && (
            <div className="border border-zinc-800 bg-[#0A0A0A] rounded-xl divide-y divide-zinc-800/60">
              {([
                { label: 'Source', value: SOURCES.find(s => s.id === source)?.label },
                source !== 'upload' ? { label: 'Repo URL', value: repoUrl } : null,
                source === 'upload' && uploadFile ? { label: 'File', value: uploadFile.name } : null,
                { label: 'Project name', value: slugify(projectName) || '—', mono: true },
                { label: 'Domain', value: domain || `${slugify(projectName)}.epicglobal.app`, mono: true },
                envRows.filter(r => r.key).length > 0 ? { label: 'Env vars', value: `${envRows.filter(r => r.key).length} variable(s)` } : null,
                accessToken ? { label: 'Access token', value: '••••••••' } : null,
              ] as ({ label: string; value?: string; mono?: boolean } | null)[]).filter((row): row is { label: string; value?: string; mono?: boolean } => row !== null).map((row, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3">
                  <span className="text-xs text-zinc-500 w-28 shrink-0">{row.label}</span>
                  <span className={`text-sm text-zinc-200 ${row.mono ? 'font-mono' : ''} truncate`}>{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* deploy / result area */}
          {deployState.phase === 'idle' && (
            <form onSubmit={handleDeploy}>
              <div className="flex items-center justify-between gap-4">
                <button type="button" onClick={() => setStep(2)} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-100 transition-colors">
                  <ArrowLeft size={14} /> Edit
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors shadow-lg shadow-white/10"
                >
                  <Zap size={15} /> Deploy to EpicGlobal
                </button>
              </div>
            </form>
          )}

          {deployState.phase === 'deploying' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 border border-blue-800/40 bg-blue-950/10 rounded-xl">
                <Loader2 size={16} className="text-blue-400 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-zinc-100">Deploying {projectName}…</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Cloning, building, and starting your project under PM2.</p>
                </div>
              </div>
              {logLines && (
                <pre ref={logRef} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-400 font-mono h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {logLines}
                </pre>
              )}
            </div>
          )}

          {deployState.phase === 'success' && (
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-5 border border-green-800/40 bg-green-950/10 rounded-xl">
                <CheckCircle2 size={22} className="text-green-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 mb-1">🎉 {projectName} is live!</p>
                  <a
                    href={deployState.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-indigo-300 hover:text-indigo-200 font-mono break-all"
                  >
                    {deployState.url} <ExternalLink size={12} className="shrink-0" />
                  </a>
                </div>
                <CopyBtn text={deployState.url} />
              </div>

              {deployState.log && (
                <details className="group">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 flex items-center gap-1.5 select-none">
                    <ChevronRight size={12} className="group-open:rotate-90 transition-transform" /> Show deploy log
                  </summary>
                  <pre className="mt-2 bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-400 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {deployState.log}
                  </pre>
                </details>
              )}

              <div className="flex gap-3">
                <button
                  onClick={reset}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded-lg px-4 py-2.5 transition-colors"
                >
                  <RefreshCw size={13} /> Deploy another project
                </button>
              </div>
            </div>
          )}

          {deployState.phase === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 border border-red-800/40 bg-red-950/10 rounded-xl">
                <XCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-zinc-100">Deployment failed</p>
                  <p className="text-xs text-zinc-400 mt-1">{deployState.message}</p>
                </div>
              </div>
              {deployState.log && (
                <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs text-red-400/80 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {deployState.log}
                </pre>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setDeployState({ phase: 'idle' }); setLogLines(''); }}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600 rounded-lg px-4 py-2.5 transition-colors"
                >
                  <RefreshCw size={13} /> Try again
                </button>
                <button onClick={() => setStep(2)} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                  ← Edit config
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EpiCodeSpaces quick-connect reference (always visible) ── */}
      <div className="border border-indigo-900/40 bg-[#0A0A0A] rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-5 hover:bg-zinc-900/20 transition-colors"
          onClick={e => { const d = (e.currentTarget.nextElementSibling as HTMLElement); d.style.display = d.style.display === 'none' ? 'block' : 'none'; }}
        >
          <div className="flex items-center gap-2.5">
            <Link2 size={14} className="text-indigo-400" />
            <span className="text-sm font-medium text-zinc-100">EpiCodeSpaces API credentials</span>
            <span className="text-xs text-zinc-600 hidden sm:inline">— use these in your IDE to deploy directly</span>
          </div>
          <ChevronRight size={14} className="text-zinc-600" />
        </button>
        <div style={{ display: 'none' }} className="border-t border-indigo-900/30">
          <div className="p-5 space-y-3">
            {[
              { label: 'API URL', value: API, color: 'text-indigo-300' },
              { label: 'API Key', value: getOrchestratorApiKey() || '(not set — save in Settings)', color: getOrchestratorApiKey() ? 'text-emerald-300' : 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="space-y-1">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">{label}</p>
                <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-md px-3 py-2.5">
                  <code className={`text-sm flex-1 font-mono select-all ${color}`}>{value}</code>
                  {value && <CopyBtn text={value} />}
                </div>
              </div>
            ))}
            <p className="text-xs text-zinc-600 pt-1 border-t border-zinc-800/60">
              <code className="bg-zinc-900 px-1 rounded">POST {API}/api/orchestrator/deploy</code> · header: <code className="bg-zinc-900 px-1 rounded">x-api-key</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
