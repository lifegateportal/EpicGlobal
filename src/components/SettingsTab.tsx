import { useEffect, useState } from 'react';
import { ApiTopology } from './ApiTopology';
import { Copy, Eye, EyeOff, Check, Link2, Save } from 'lucide-react';
import { API, apiFetch, getOrchestratorApiKey, setOrchestratorApiKey } from '../api/client';

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
  const [keyStatus, setKeyStatus] = useState('');
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [deepSeekInput, setDeepSeekInput] = useState('');
  const [deepSeekConfigured, setDeepSeekConfigured] = useState(false);
  const [deepSeekMasked, setDeepSeekMasked] = useState('');
  const [deepSeekSource, setDeepSeekSource] = useState<string | null>(null);
  const [deepSeekStatus, setDeepSeekStatus] = useState('');
  const [deepSeekBusy, setDeepSeekBusy] = useState(false);
  const [showDeepSeekInput, setShowDeepSeekInput] = useState(false);
  const apiUrl = API;
  const activeKey = getOrchestratorApiKey();
  const maskedKey = activeKey
    ? activeKey.slice(0, 6) + '••••••••••••••••••••••••••' + activeKey.slice(-4)
    : '';

  useEffect(() => {
    let active = true;
    apiFetch(`${API}/api/orchestrator/settings/deepseek`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!active) return;
        if (!response.ok || !data.success) {
          setDeepSeekStatus(data.error || `Could not load DeepSeek settings (HTTP ${response.status}).`);
          return;
        }
        setDeepSeekConfigured(Boolean(data.configured));
        setDeepSeekMasked(data.maskedKey || '');
        setDeepSeekSource(data.source || null);
      })
      .catch(error => {
        if (active) setDeepSeekStatus(error instanceof Error ? error.message : 'Could not reach the API server.');
      });
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    const candidateKey = keyInput.trim();
    if (!candidateKey) {
      setKeyStatus('Enter the server API key first.');
      return;
    }

    setVerifyingKey(true);
    setSaved(false);
    setKeyStatus('Checking the key against the API server…');
    try {
      const response = await fetch(`${apiUrl}/api/orchestrator/status`, {
        headers: { 'x-api-key': candidateKey },
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setKeyStatus(response.status === 401
          ? 'The server rejected this key. Copy the value after ORCHESTRATOR_API_KEY= from the API server’s .env file.'
          : data.error || `API check failed (HTTP ${response.status}).`);
        return;
      }

      setOrchestratorApiKey(candidateKey);
      setKeyInput(candidateKey);
      setSaved(true);
      setKeyStatus(`Key verified. ${Object.keys(data.projects || {}).length} projects are available.`);
    } catch (error) {
      setKeyStatus(error instanceof Error ? `Could not reach the API server: ${error.message}` : 'Could not reach the API server.');
    } finally {
      setVerifyingKey(false);
    }
  };

  const saveDeepSeekKey = async () => {
    const candidateKey = deepSeekInput.trim();
    if (!candidateKey) {
      setDeepSeekStatus('Enter your DeepSeek API key.');
      return;
    }

    setDeepSeekBusy(true);
    setDeepSeekStatus('');
    try {
      const response = await apiFetch(`${API}/api/orchestrator/settings/deepseek`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: candidateKey }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setDeepSeekStatus(data.error || `Could not save the key (HTTP ${response.status}).`);
        return;
      }
      setDeepSeekInput('');
      setDeepSeekConfigured(true);
      setDeepSeekMasked(data.maskedKey || '');
      setDeepSeekSource('settings');
      setDeepSeekStatus('DeepSeek key saved securely on the API server. No restart is required.');
    } catch (error) {
      setDeepSeekStatus(error instanceof Error ? error.message : 'Could not reach the API server.');
    } finally {
      setDeepSeekBusy(false);
    }
  };

  const clearDeepSeekKey = async () => {
    if (!window.confirm('Remove the DeepSeek key saved in EpicGlobal?')) return;
    setDeepSeekBusy(true);
    setDeepSeekStatus('');
    try {
      const response = await apiFetch(`${API}/api/orchestrator/settings/deepseek`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setDeepSeekStatus(data.error || `Could not remove the key (HTTP ${response.status}).`);
        return;
      }
      setDeepSeekConfigured(Boolean(data.configured));
      setDeepSeekMasked('');
      setDeepSeekSource(data.source || null);
      setDeepSeekStatus(data.configured
        ? 'Saved key removed. A DEEPSEEK_API_KEY remains configured in the server environment.'
        : 'DeepSeek key removed.');
    } catch (error) {
      setDeepSeekStatus(error instanceof Error ? error.message : 'Could not reach the API server.');
    } finally {
      setDeepSeekBusy(false);
    }
  };

  return (
    <div className="space-y-6">

      <div className="border border-sky-900/50 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-sky-900/40 bg-sky-950/20">
          <h2 className="text-sm font-semibold text-zinc-100">DeepSeek site assistant</h2>
          <p className="text-xs text-zinc-500 mt-1">The key is stored encrypted on your API server and is never sent to client browsers.</p>
        </div>
        <div className="p-5 space-y-3">
          <label htmlFor="deepseek-api-key" className="block text-xs text-zinc-500 uppercase tracking-widest font-semibold">DeepSeek API key</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="deepseek-api-key"
              type={showDeepSeekInput ? 'text' : 'password'}
              autoComplete="new-password"
              value={deepSeekInput}
              onChange={event => setDeepSeekInput(event.target.value)}
              placeholder={deepSeekConfigured ? 'Enter a new key to replace the saved key' : 'Paste your DeepSeek API key'}
              className="min-w-60 flex-1 bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-200 font-mono focus:outline-none focus:border-zinc-600"
            />
            <button type="button" onClick={() => setShowDeepSeekInput(value => !value)} className="p-2 text-zinc-500 hover:text-zinc-200" aria-label={showDeepSeekInput ? 'Hide DeepSeek key' : 'Show DeepSeek key'}>
              {showDeepSeekInput ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              onClick={() => void saveDeepSeekKey()}
              disabled={deepSeekBusy || !deepSeekInput.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              <Save size={13} /> {deepSeekBusy ? 'Saving…' : 'Save key'}
            </button>
            {deepSeekConfigured && (
              <button
                type="button"
                onClick={() => void clearDeepSeekKey()}
                disabled={deepSeekBusy}
                className="px-3 py-2 rounded border border-zinc-700 text-zinc-400 hover:text-red-300 text-xs disabled:opacity-50"
              >Remove saved key</button>
            )}
          </div>
          {deepSeekConfigured && (
            <p className="text-xs text-green-400">
              DeepSeek is configured{deepSeekMasked ? ` (${deepSeekMasked})` : ''}{deepSeekSource === 'environment' ? ' from the server environment' : ' in server settings'}.
            </p>
          )}
          {deepSeekStatus && <p className={`text-xs ${deepSeekStatus.includes('saved securely') || deepSeekStatus === 'DeepSeek key removed.' ? 'text-green-400' : 'text-amber-400'}`}>{deepSeekStatus}</p>}
        </div>
      </div>

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
                disabled={verifyingKey}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {verifyingKey ? <Save size={12} /> : saved ? <Check size={12} className="text-green-300" /> : <Save size={12} />}
                {verifyingKey ? 'Checking…' : saved ? 'Verified' : 'Verify & Save'}
              </button>
            </div>
            {keyStatus && <p className={`text-xs ${saved ? 'text-green-400' : 'text-amber-400'}`}>{keyStatus}</p>}
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

