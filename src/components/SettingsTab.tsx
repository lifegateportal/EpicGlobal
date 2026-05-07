import { useEffect, useState } from 'react';
import { ApiTopology } from './ApiTopology';
import { Copy, Eye, EyeOff, Check, Link2, Save, LogIn, LogOut } from 'lucide-react';
import {
  API,
  getOrchestratorApiKey,
  setOrchestratorApiKey,
  getGithubAuthSession,
  startGithubLogin,
  logoutGithub,
  type GithubAuthSession,
} from '../api/client';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors">
      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );
}

export function SettingsTab() {
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(() => getOrchestratorApiKey());
  const [saved, setSaved] = useState(false);
  const apiUrl = API;
  const activeKey = getOrchestratorApiKey();
  const [githubSession, setGithubSession] = useState<GithubAuthSession>({ enabled: false, authenticated: false });
  const [githubSessionLoading, setGithubSessionLoading] = useState(false);
  const maskedKey = activeKey
    ? activeKey.slice(0, 6) + '••••••••••••••••••••••••••' + activeKey.slice(-4)
    : '';

  const handleSave = () => {
    setOrchestratorApiKey(keyInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    setGithubSessionLoading(true);
    getGithubAuthSession()
      .then(setGithubSession)
      .catch(() => setGithubSession({ enabled: false, authenticated: false }))
      .finally(() => setGithubSessionLoading(false));
  }, []);

  const handleGithubLogout = async () => {
    const ok = await logoutGithub();
    if (ok) {
      setGithubSession((prev) => ({ ...prev, authenticated: false, user: undefined }));
    }
  };

  return (
    <div className="space-y-6">

      {/* CONNECT EXTERNAL APP */}
      <div className="border border-indigo-900/50 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-indigo-900/40 bg-indigo-950/20 flex items-center gap-2">
          <Link2 size={15} className="text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Connect External App</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Use these credentials in EpiCodeSpaces (or any app) to deploy directly to EpicGlobal.</p>
          </div>
        </div>
        <div className="p-5 space-y-4">

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">GitHub Sign-In</label>
            <div className="flex items-center justify-between gap-3 bg-black border border-zinc-800 rounded-md px-3 py-2.5">
              <div className="min-w-0">
                {githubSessionLoading ? (
                  <p className="text-sm text-zinc-400">Checking GitHub session…</p>
                ) : githubSession.authenticated ? (
                  <p className="text-sm text-emerald-300 truncate">Connected as @{githubSession.user?.login}</p>
                ) : githubSession.enabled ? (
                  <p className="text-sm text-zinc-400">Not connected. Sign in for private repo deployment.</p>
                ) : (
                  <p className="text-sm text-amber-400">OAuth not configured on server.</p>
                )}
              </div>
              {githubSession.authenticated ? (
                <button
                  onClick={handleGithubLogout}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                >
                  <LogOut size={12} /> Sign out
                </button>
              ) : githubSession.enabled ? (
                <button
                  onClick={() => startGithubLogin(window.location.href)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors"
                >
                  <LogIn size={12} /> Sign in
                </button>
              ) : null}
            </div>
          </div>

          {/* API URL */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Orchestrator API URL</label>
            <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-md px-3 py-2.5">
              <code className="text-sm text-indigo-300 flex-1 select-all">{apiUrl}</code>
              <CopyButton text={apiUrl} />
            </div>
          </div>

          {/* API Key — editable */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">API Key</label>
            <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-md px-3 py-2.5">
              <input
                type={showKey ? 'text' : 'password'}
                className="flex-1 bg-transparent text-sm text-emerald-300 font-mono outline-none placeholder:text-zinc-600"
                placeholder="Paste your ORCHESTRATOR_API_KEY here…"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
              />
              <button onClick={() => setShowKey(v => !v)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors">
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              {keyInput && <CopyButton text={keyInput} />}
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors"
              >
                {saved ? <Check size={12} className="text-green-300" /> : <Save size={12} />}
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>
            {!activeKey && (
              <p className="text-xs text-amber-500/80">Paste your server's <code className="bg-zinc-900 px-1 rounded">ORCHESTRATOR_API_KEY</code> above and click Save.</p>
            )}
            {activeKey && (
              <p className="text-xs text-zinc-600">Active key: <span className="text-zinc-500 font-mono">{maskedKey}</span> — stored in browser localStorage.</p>
            )}
          </div>

          {/* Usage instructions */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Deploy Endpoint</label>
            <div className="relative bg-zinc-950 border border-zinc-800 rounded-md p-3">
              <pre className="text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">{`POST ${apiUrl}/api/orchestrator/deploy
Headers:
  x-api-key: <your API key>
  Content-Type: application/json

Body:
{
  "projectName": "my-app",
  "repoUrl": "https://github.com/you/repo.git",
  "domain": "my-app.epicglobal.app"
}`}</pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={`POST ${apiUrl}/api/orchestrator/deploy\nHeaders:\n  x-api-key: ${activeKey}\n  Content-Type: application/json\n\nBody:\n{\n  "projectName": "my-app",\n  "repoUrl": "https://github.com/you/repo.git",\n  "domain": "my-app.epicglobal.app"\n}`} />
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-600 border-t border-zinc-800/60 pt-3">
            In EpiCodeSpaces, set <code className="bg-zinc-900 px-1 rounded text-zinc-400">EPICGLOBAL_API_URL</code> and <code className="bg-zinc-900 px-1 rounded text-zinc-400">EPICGLOBAL_API_KEY</code> to the values above, then call the deploy endpoint from your IDE.
          </p>
        </div>
      </div>

      {/* ARCHITECTURE MAP */}
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20">
          <h2 className="text-sm font-semibold text-zinc-100">Architecture Map</h2>
          <p className="text-xs text-zinc-500 mt-1">Live topology of your API routing layer.</p>
        </div>
        <div className="p-4">
          <ApiTopology />
        </div>
      </div>
    </div>
  );
}

