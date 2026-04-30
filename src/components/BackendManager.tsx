import React, { useState } from 'react';

export default function BackendManager() {
  const [activeView, setActiveView] = useState<'deploy' | 'env' | 'logs'>('deploy');
  
  // Shared States
  const [projectName, setProjectName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Deploy States
  const [githubRepo, setGithubRepo] = useState('');
  const [targetPort, setTargetPort] = useState('');

  // Env States
  const [envKey, setEnvKey] = useState('');
  const [envValue, setEnvValue] = useState('');

  // Logs States
  const [logs, setLogs] = useState('');

  const baseUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

  const handleDeployBackend = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`${baseUrl}/api/deploy-backend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          githubUser: 'lifegateportal',
          githubRepo,
          targetPort
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`Backend provisioned and running on port ${data.port}.`);
      setStatus('success');
    } catch (error: any) {
      setMessage(error.message);
      setStatus('error');
    }
  };

  const handleInjectEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`${baseUrl}/api/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          envVars: { [envKey]: envValue }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage('Secrets injected. Process securely rebooted.');
      setStatus('success');
      setEnvKey('');
      setEnvValue('');
    } catch (error: any) {
      setMessage(error.message);
      setStatus('error');
    }
  };

  const handleFetchLogs = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch(`${baseUrl}/api/logs/${projectName}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogs(data.logs);
      setStatus('success');
      setMessage('Live server logs retrieved.');
    } catch (error: any) {
      setMessage(error.message);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-[#0E1117] text-white rounded-xl shadow-2xl border border-gray-800 font-sans mt-8">
      <div className="flex border-b border-gray-800 mb-6 pb-2 gap-6">
        <button onClick={() => { setActiveView('deploy'); setStatus('idle'); }} className={`pb-2 font-medium ${activeView === 'deploy' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>Deploy App</button>
        <button onClick={() => { setActiveView('env'); setStatus('idle'); }} className={`pb-2 font-medium ${activeView === 'env' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>Secrets Manager</button>
        <button onClick={() => { setActiveView('logs'); setStatus('idle'); }} className={`pb-2 font-medium ${activeView === 'logs' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}>Terminal Logs</button>
      </div>

      {activeView === 'deploy' && (
        <form onSubmit={handleDeployBackend} className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">Pull a heavy Node.js backend from GitHub and assign it a PM2 port.</p>
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Project Name (e.g. epiclips-api)" value={projectName} onChange={e => setProjectName(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
            <input type="text" placeholder="GitHub Repo (e.g. EpiClips)" value={githubRepo} onChange={e => setGithubRepo(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
            <input type="number" placeholder="Internal Port (e.g. 5001)" value={targetPort} onChange={e => setTargetPort(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white col-span-2" />
          </div>
          <button type="submit" className="w-full py-3 mt-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium">Provision Backend</button>
        </form>
      )}

      {activeView === 'env' && (
        <form onSubmit={handleInjectEnv} className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">Securely inject environment variables without logging into the server.</p>
          <input type="text" placeholder="Target Project Name (e.g. epiclips-api)" value={projectName} onChange={e => setProjectName(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Key (e.g. STRIPE_SECRET)" value={envKey} onChange={e => setEnvKey(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
            <input type="password" placeholder="Value (e.g. sk_live_...)" value={envValue} onChange={e => setEnvValue(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
          </div>
          <button type="submit" className="w-full py-3 mt-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium">Inject & Restart Target</button>
        </form>
      )}

      {activeView === 'logs' && (
        <form onSubmit={handleFetchLogs} className="space-y-4">
          <p className="text-sm text-gray-400 mb-4">Pull the last 100 lines of PM2 terminal output for debugging.</p>
          <div className="flex gap-4">
            <input type="text" placeholder="Project Name (e.g. epiclips-api)" value={projectName} onChange={e => setProjectName(e.target.value)} required className="w-full bg-[#1A1D24] border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
            <button type="submit" className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">Fetch</button>
          </div>
          {logs && (
            <div className="mt-4 p-4 bg-black border border-gray-800 rounded-lg overflow-x-auto h-64 overflow-y-auto">
              <pre className="text-xs text-green-400 font-mono">{logs}</pre>
            </div>
          )}
        </form>
      )}

      {status === 'success' && <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-sm">{message}</div>}
      {status === 'error' && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm">{message}</div>}
    </div>
  );
}