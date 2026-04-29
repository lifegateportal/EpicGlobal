import { useState } from 'react';
import { ExternalLink, Lock } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';
import { CommandTerminal } from './components/CommandTerminal';

export default function App() {
  // Global State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // --- SECURITY PERIMETER ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans">
        <div className="border border-zinc-800/60 bg-[#0A0A0A] p-8 rounded-xl shadow-2xl w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center rounded-lg font-bold text-2xl tracking-tighter mx-auto mb-6">EG</div>
          <h1 className="text-xl font-medium text-zinc-100 mb-2">EpicGlobal Security</h1>
          <p className="text-sm text-zinc-500 mb-6">Authenticate to access the production perimeter.</p>
          <button 
            onClick={() => {
              setIsAuthenticated(true);
              toast.success('Authentication successful. Welcome back.');
            }}
            className="w-full py-2.5 bg-white text-black rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
          >
            <Lock size={16} /> Secure Login
          </button>
        </div>
      </div>
    );
  }

  // Placeholder Data
  const deployments = [
    { id: '1', status: 'ready', branch: 'main', time: '2m', commit: 'Update routing logic', hash: 'a1b2c3d', duration: '45s' },
    { id: '2', status: 'ready', branch: 'main', time: '5h', commit: 'Initial infrastructure', hash: 'i9j0k1l', duration: '1m 12s' },
  ];
  const performanceData = [
    { time: '10:00', cpu: 25, ram: 45 }, { time: '10:10', cpu: 85, ram: 52 }, { time: '10:20', cpu: 28, ram: 46 }
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-purple-500/30 pb-12">
      {/* SOFT WARNING SYSTEM */}
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      
      {/* GLOBAL SLIDE-OUT TERMINAL */}
      <CommandTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-100 tracking-tight mb-2">Production Deployment</h1>
            <p className="text-sm text-zinc-500">Your application is live and receiving traffic.</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setIsTerminalOpen(true)}
              className="h-9 px-4 bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-md hover:bg-zinc-800 transition-colors"
            >
              Command & Logs
            </button>
            <a href="https://epicglobal.app" target="_blank" rel="noreferrer" className="h-9 px-4 bg-white text-black text-sm font-medium rounded-md flex items-center gap-2 hover:bg-zinc-200 transition-colors">
              Visit Site <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="flex gap-6 border-b border-zinc-800/60 mb-8 overflow-x-auto hide-scrollbar">
          {['overview', 'deployments', 'settings'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-sm font-medium capitalize transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {tab}
              {activeTab === tab && <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-white rounded-t-full"></span>}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && <OverviewTab performanceData={performanceData} />}
        {activeTab === 'deployments' && <DeploymentsTab deployments={deployments} />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}