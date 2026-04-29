import { GitBranch, Globe, Server, CheckCircle2, Clock, Terminal, ExternalLink } from 'lucide-react';

export default function App() {
  const deployments = [
    { id: 'deploy-04a', status: 'ready', branch: 'main', time: '2m', commit: 'Update routing logic', hash: 'a1b2c3d' },
    { id: 'deploy-03f', status: 'building', branch: 'feature/auth', time: 'Just now', commit: 'Add Stripe webhooks', hash: 'e5f6g7h' },
    { id: 'deploy-02b', status: 'ready', branch: 'main', time: '5h', commit: 'Initial infrastructure setup', hash: 'i9j0k1l' },
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-blue-500/30">
      
      {/* Sleek Top Navigation */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-black/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-white text-black flex items-center justify-center rounded-[4px] font-bold text-sm tracking-tighter">
                EG
              </div>
              <span className="text-zinc-100 font-medium tracking-tight">EpicGlobal</span>
              <span className="text-zinc-600 font-light text-xl mb-1">/</span>
              <span className="text-zinc-100 font-medium tracking-tight">Production</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Feedback</button>
            <div className="w-8 h-8 rounded-full border border-zinc-800 bg-zinc-900"></div>
          </div>
        </div>
      </nav>

      {/* Main Content Workspace */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-100 tracking-tight mb-2">Production Deployment</h1>
            <p className="text-sm text-zinc-500">Your application is live and receiving traffic.</p>
          </div>
          <a href="https://epicglobal.app" target="_blank" className="h-9 px-4 bg-white text-black text-sm font-medium rounded-md flex items-center gap-2 hover:bg-zinc-200 transition-colors">
            Visit Site <ExternalLink size={14} />
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Status Card */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
            <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
              
              {/* Card Header */}
              <div className="p-6 border-b border-zinc-800/60 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-medium text-zinc-100">epicglobal.app</h2>
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[11px] font-medium tracking-wide flex items-center gap-1.5 uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse"></span>
                      Healthy
                    </span>
                  </div>
                  <a href="https://epicglobal.app" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">https://epicglobal.app</a>
                </div>
              </div>

              {/* Card Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-zinc-800/60 bg-zinc-900/20">
                <div className="p-5">
                  <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Environment</p>
                  <p className="text-sm text-zinc-200 font-medium flex items-center gap-2"><Server size={14} className="text-zinc-400" /> nyc-1 (Droplet)</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Branch</p>
                  <p className="text-sm text-zinc-200 font-medium flex items-center gap-2"><GitBranch size={14} className="text-zinc-400" /> main</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Status</p>
                  <p className="text-sm text-zinc-200 font-medium flex items-center gap-2"><CheckCircle2 size={14} className="text-green-400" /> Ready</p>
                </div>
                <div className="p-5">
                  <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wider font-semibold">Runtime</p>
                  <p className="text-sm text-zinc-200 font-medium flex items-center gap-2"><Terminal size={14} className="text-zinc-400" /> Node / Vite</p>
                </div>
              </div>
            </div>
          </div>

          {/* Deployment Feed */}
          <div className="col-span-1">
            <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800/60">
                <h3 className="text-sm font-medium text-zinc-100">Deployment History</h3>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {deployments.map((deploy) => (
                  <div key={deploy.id} className="p-4 hover:bg-zinc-900/40 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">{deploy.commit}</span>
                      {deploy.status === 'building' ? (
                        <Clock size={14} className="text-blue-400 animate-spin-slow" />
                      ) : (
                        <CheckCircle2 size={14} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-zinc-800/50 px-1.5 py-0.5 rounded text-zinc-400">{deploy.hash}</span>
                        <span className="flex items-center gap-1"><GitBranch size={10} /> {deploy.branch}</span>
                      </div>
                      <span>{deploy.time}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-zinc-800/60 bg-zinc-900/20 text-center">
                <button className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">View All Deployments</button>
              </div>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}