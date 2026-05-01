import React, { useState } from 'react';

export default function ProjectOrchestrator() {
    const [projectData, setProjectData] = useState({
        projectName: '',
        repoUrl: '',
        domain: ''
    });
    const [status, setStatus] = useState({ loading: false, logs: '', error: '' });

    const handleDeploy = async (e) => {
        e.preventDefault();
        setStatus({ loading: true, logs: '🚀 Initiating remote orchestration...', error: '' });

        try {
            const response = await fetch('http://178.128.158.90:4000/api/orchestrator/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });

            const data = await response.json();

            if (data.success) {
                setStatus({ 
                    loading: false, 
                    logs: `✅ Success! Project live on port: ${data.port}\n\nTerminal Output:\n${data.log}`,
                    error: '' 
                });
            } else {
                setStatus({ loading: false, logs: '', error: data.error });
            }
        } catch (err) {
            setStatus({ loading: false, logs: '', error: 'Network Error: Check if Port 4000 is open.' });
        }
    };

    return (
        <div className="p-8 bg-zinc-950 min-h-screen text-zinc-100 font-sans">
            <div className="max-w-2xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tighter">Project Launcher</h1>
                    <p className="text-zinc-500">Deploy any repository with a custom domain instantly.</p>
                </div>

                <form onSubmit={handleDeploy} className="space-y-4 bg-zinc-900 p-6 rounded-2xl border border-zinc-800 shadow-2xl">
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Project Name</label>
                        <input 
                            type="text" 
                            placeholder="e.g. branding-site"
                            className="w-full bg-black border border-zinc-800 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={projectData.projectName}
                            onChange={(e) => setProjectData({...projectData, projectName: e.target.value})}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold">GitHub Repo URL</label>
                        <input 
                            type="url" 
                            placeholder="https://github.com/user/repo"
                            className="w-full bg-black border border-zinc-800 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={projectData.repoUrl}
                            onChange={(e) => setProjectData({...projectData, repoUrl: e.target.value})}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Custom Domain (Optional)</label>
                        <input 
                            type="text" 
                            placeholder="whisperedinsilk.com"
                            className="w-full bg-black border border-zinc-800 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            value={projectData.domain}
                            onChange={(e) => setProjectData({...projectData, domain: e.target.value})}
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={status.loading}
                        className={`w-full py-4 rounded-xl font-bold tracking-tight transition-all ${
                            status.loading ? 'bg-zinc-800 text-zinc-500' : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20'
                        }`}
                    >
                        {status.loading ? 'Orchestrating...' : 'Launch Project'}
                    </button>
                </form>

                {/* Live Console Output */}
                <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">System Console</h3>
                    <div className="bg-black border border-zinc-800 rounded-xl p-4 h-64 overflow-y-auto font-mono text-sm">
                        {status.error && <p className="text-red-500">Error: {status.error}</p>}
                        {status.logs && <pre className="text-emerald-400 whitespace-pre-wrap">{status.logs}</pre>}
                        {!status.logs && !status.error && <p className="text-zinc-700">Waiting for trigger...</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}