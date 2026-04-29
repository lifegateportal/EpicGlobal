import { Activity, GitBranch, Globe, Server, CheckCircle2, Clock } from 'lucide-react';

export default function App() {
  const deployments = [
    { id: 'deploy-04a', status: 'ready', branch: 'main', time: '2m ago', commit: 'Update routing logic' },
    { id: 'deploy-03f', status: 'building', branch: 'feature/auth', time: 'Just now', commit: 'Add Stripe webhooks' },
    { id: 'deploy-02b', status: 'ready', branch: 'main', time: '5h ago', commit: 'Initial infrastructure setup' },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="flex items-center justify-between pb-8 mb-8 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white text-black flex items-center justify-center rounded-md font-bold text-xl">
            E
          </div>
          <h1 className="text-xl font-semibold tracking-tight">EpicGlobal</h1>
        </div>
        <nav className="flex gap-4">
          <button className="text-sm text-zinc-400 hover:text-white transition-colors">Overview</button>
          <button className="text-sm text-zinc-400 hover:text-white transition-colors">Deployments</button>
          <button className="text-sm text-zinc-400 hover:text-white transition-colors">Settings</button>
        </nav>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Project Card */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="border border-white/10 bg-zinc-900/50 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">Production Environment</h2>
                <a href="https://epicglobal.app" className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                  <Globe size={14} /> epicglobal.app
                </a>
              </div>
              <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-xs font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                Healthy
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-white/5">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Status</p>
                <p className="text-sm font-medium flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-400" /> Ready</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Branch</p>
                <p className="text-sm font-medium flex items-center gap-1.5"><GitBranch size={14} /> main</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Server</p>
                <p className="text-sm font-medium flex items-center gap-1.5"><Server size={14} /> nyc-1</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Last Update</p>
                <p className="text-sm font-medium flex items-center gap-1.5"><Activity size={14} /> 2m ago</p>
              </div>
            </div>
          </div>
        </div>

        {/* Deployment History Sidebar */}
        <div className="col-span-1">
          <h3 className="text-sm font-medium text-zinc-400 mb-4 px-1">Recent Deployments</h3>
          <div className="space-y-3">
            {deployments.map((deploy) => (
              <div key={deploy.id} className="p-4 border border-white/10 bg-zinc-900/30 rounded-lg hover:bg-zinc-900/50 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-zinc-200 group-hover:text-white">{deploy.commit}</span>
                  {deploy.status === 'building' ? (
                    <Clock size={14} className="text-yellow-400 animate-spin-slow" />
                  ) : (
                    <CheckCircle2 size={14} className="text-green-400" />
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><GitBranch size={12} /> {deploy.branch}</span>
                  <span>{deploy.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}