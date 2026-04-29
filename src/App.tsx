import { useState, useEffect } from 'react';
import { ExternalLink, Lock, Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';
import { CommandTerminal } from './components/CommandTerminal';
import { CommandPalette } from './components/CommandPalette';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false); // Upgrade 2: Skeleton State

  // Upgrade 1: Keyboard Tab Routing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') handleTabSwitch('overview');
      if (e.key === '2') handleTabSwitch('deployments');
      if (e.key === '3') handleTabSwitch('settings');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTabSwitch = (tab: string) => {
    if (activeTab === tab) return;
    setIsNavigating(true);
    setActiveTab(tab);
    setTimeout(() => setIsNavigating(false), 300); // Simulate network jank prevention
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans">
        <div className="border border-zinc-800/60 bg-[#0A0A0A] p-8 rounded-xl shadow-2xl w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center rounded-lg font-bold text-2xl tracking-tighter mx-auto mb-6">EG</div>
          <h1 className="text-xl font-medium text-zinc-100 mb-2">EpicGlobal Security</h1>
          <p className="text-sm text-zinc-500 mb-6">Authenticate to access the production perimeter.</p>
          <button onClick={() => { setIsAuthenticated(true); toast.success('Authentication successful.'); }} className="w-full py-2.5 bg-white text-black rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
            <Lock size={16} /> Secure Login
          </button>
        </div>
      </div>
    );
  }

  const deployments = [
    { id: '1', status: 'ready', branch: 'main', time: '2m', commit: 'Update routing logic', hash: 'a1b2c3d', duration: '45s' },
    { id: '2', status: 'building', branch: 'feature/auth', time: 'Just now', commit: 'Add Stripe webhooks', hash: 'e5f6g7h', duration: '--' },
  ];
  
  const performanceData = [
    { time: '10:00', cpu: 25, ram: 45 }, { time: '10:05', cpu: 38, ram: 48 },
    { time: '10:10', cpu: 85, ram: 52 }, { time: '10:15', cpu: 42, ram: 50 },
    { time: '10:20', cpu: 28, ram: 46 }
  ];

  // Check for active builds
  const isBuilding = deployments.some(d => d.status === 'building');

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-purple-500/30 pb-12">
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      <CommandPalette setTab={handleTabSwitch} openTerminal={() => setIsTerminalOpen(true)} />
      <CommandTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

      <Navbar />

      {/* Upgrade 3: Active Build Banner */}
      {isBuilding && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 text-blue-400 text-xs font-medium py-2 px-6 flex items-center justify-center gap-3 animate-in slide-in-from-top-2">
          <Loader2 size={14} className="animate-spin" />
          Production deployment is currently running...
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-100 tracking-tight mb-2">Production Deployment</h1>
            <p className="text-sm text-zinc-500">Your application is live and receiving traffic.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsTerminalOpen(true)} className="h-9 px-4 bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-md hover:bg-zinc-800 transition-colors">Command & Logs</button>
            <a href="https://epicglobal.app" target="_blank" rel="noreferrer" className="h-9 px-4 bg-white text-black text-sm font-medium rounded-md flex items-center gap-2 hover:bg-zinc-200 transition-colors">Visit Site <ExternalLink size={14} /></a>
          </div>
        </div>

        <div className="flex gap-6 border-b border-zinc-800/60 mb-8 overflow-x-auto hide-scrollbar">
          {['overview', 'deployments', 'settings'].map((tab, idx) => (
            <button key={tab} onClick={() => handleTabSwitch(tab)} className={`pb-3 text-sm font-medium capitalize transition-colors relative whitespace-nowrap flex items-center gap-2 ${activeTab === tab ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {tab}
              <span className="hidden md:flex items-center justify-center w-4 h-4 rounded text-[9px] border border-zinc-800 bg-zinc-900/50 font-mono text-zinc-500">{idx + 1}</span>
              {activeTab === tab && <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-white rounded-t-full transition-all"></span>}
            </button>
          ))}
        </div>

        {/* Upgrade 2: Transition State Rendering */}
        <div className={`transition-opacity duration-300 ${isNavigating ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {activeTab === 'overview' && <OverviewTab performanceData={performanceData} />}
          {activeTab === 'deployments' && <DeploymentsTab deployments={deployments} />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
