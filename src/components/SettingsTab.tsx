import { useState } from 'react';
import { ApiTopology } from './ApiTopology';
import { Copy, Eye, EyeOff, Check, Link2 } from 'lucide-react';
import { API, ORCHESTRATOR_API_KEY } from '../api/client';

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
  const apiUrl = API;
  const maskedKey = ORCHESTRATOR_API_KEY
    ? ORCHESTRATOR_API_KEY.slice(0, 6) + '••••••••••••••••••••••••••' + ORCHESTRATOR_API_KEY.slice(-4)
    : '(not set — add VITE_ORCHESTRATOR_API_KEY to your build env)';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

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

          {/* API URL */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Orchestrator API URL</label>
            <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-md px-3 py-2.5">
              <code className="text-sm text-indigo-300 flex-1 select-all">{apiUrl}</code>
              <CopyButton text={apiUrl} />
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">API Key</label>
            <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-md px-3 py-2.5">
              <code className="text-sm text-emerald-300 flex-1 font-mono break-all">
                {ORCHESTRATOR_API_KEY
                  ? (showKey ? ORCHESTRATOR_API_KEY : maskedKey)
                  : <span className="text-zinc-600 italic">not configured</span>}
              </code>
              {ORCHESTRATOR_API_KEY && (
                <>
                  <button onClick={() => setShowKey(v => !v)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors">
                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <CopyButton text={ORCHESTRATOR_API_KEY} />
                </>
              )}
            </div>
            {!ORCHESTRATOR_API_KEY && (
              <p className="text-xs text-amber-500/80">Set <code className="bg-zinc-900 px-1 rounded">VITE_ORCHESTRATOR_API_KEY</code> in your build env and rebuild to enable this.</p>
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
                <CopyButton text={`POST ${apiUrl}/api/orchestrator/deploy\nHeaders:\n  x-api-key: ${ORCHESTRATOR_API_KEY}\n  Content-Type: application/json\n\nBody:\n{\n  "projectName": "my-app",\n  "repoUrl": "https://github.com/you/repo.git",\n  "domain": "my-app.epicglobal.app"\n}`} />
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

