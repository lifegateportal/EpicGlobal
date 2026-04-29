import { useState, useEffect } from 'react';
import { ExternalLink, Lock, Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { io } from 'socket.io-client';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';
import { CommandTerminal } from './components/CommandTerminal';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardHUD } from './components/KeyboardHUD';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // LIVE TELEMETRY STATE
  const [serverConnected, setServerConnected] = useState(false);
  const [performanceData, setPerformanceData] = useState<{time: string, cpu: number, ram: number}[]>([
    { time: '00:00', cpu: 0, ram: 0 }
  ]);

  // Establish WebSocket Connection
  useEffect(() => {
    if (!isAuthenticated) return;

    // REPLACE THIS WITH YOUR DIGITALOCEAN IP
    const socket = io('http://178.128.158.90:4000'); 

    socket.on('connect', () => {
      setServerConnected(true);
      toast.success('Secure link established to nyc-1.');
    });

    socket.on('disconnect', () => {
      setServerConnected(false);
      toast.error('Connection to nyc-1 lost.');
    });

    // Catch the live stream and feed the chart
    socket.on('system_metrics', (data) => {
      setPerformanceData(prev => {
        const newData = [...prev, { time: data.time, cpu: data.cpu, ram: data.ram }];
        // Keep the chart flowing by removing old data points (max 15 visible)
        if (newData.length > 15) newData.shift();
        return newData;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated]);

  // Local-First Cache Simulation & Focus Throttling
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) console.log("Throttling WebSockets & Animations to save battery");
      else console.log("Catching up charts to real-time");
    };
    
    const handleOnline = () => { setIsOffline(false); toast.success('Network connection restored.'); };
    const handleOffline = () => { setIsOffline(true); toast.error('Offline. Serving data from local cache.'); };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') handleTabSwitch('overview');
      if (e.key === '2') handleTabSwitch('deployments');
      if (e.key === '3') handleTabSwitch('settings');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  const handleTabSwitch = (tab: string) => {
    if (activeTab === tab) return;
    setIsNavigating(true);
    setActiveTab(tab);
    setTimeout(() => setIsNavigating(false), 300);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans">
        <div className="border border-zinc-800/60 bg-[#0A0A0A] p-8 rounded-xl shadow-2xl w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center rounded-lg font-bold text-2xl tracking-tighter mx-auto mb-6">EG</div>
          <h1 className="text-xl font-medium text-zinc-100 mb-2">EpicGlobal Security</h1>
          <button onClick={() => setIsAuthenticated(true)} className="w-full py-2.5 bg-white text-black rounded-md text-sm font-medium hover:bg-zinc-200 mt-4"><Lock size={16} className="inline mr-2" /> Secure Login</button>
        </div>
      </div>
    );
  }

  // Inject bundle sizes into mock data
  const deployments = [
    { id: '1', status: 'ready', branch: 'main', time: '2m', commit: 'Update routing logic', hash: 'a1b2c3d', duration: '45s', bundleSize: 2.1 },
    { id: '2', status: 'building', branch: 'feature/auth', time: 'Just now', commit: 'Import massive legacy package', hash: 'e5f6g7h', duration: '--', bundleSize: 5.4 },
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-purple-500/30 pb-12">
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      <KeyboardHUD />
      <CommandPalette setTab={handleTabSwitch} openTerminal={() => setIsTerminalOpen(true)} />
      <CommandTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

      <Navbar serverConnected={serverConnected} />

      {isOffline && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-xs font-medium py-2 px-6 flex items-center justify-center gap-3">
          Working offline. Changes will sync when connection is restored.
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex justify-between items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-100 tracking-tight mb-2">Production Deployment</h1>
            <p className="text-sm text-zinc-500">Your application is live and receiving traffic.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsTerminalOpen(true)} className="h-9 px-4 bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-md hover:bg-zinc-800 transition-colors">Command & Logs</button>
          </div>
        </div>

        <div className="flex gap-6 border-b border-zinc-800/60 mb-8 overflow-x-auto hide-scrollbar">
          {['overview', 'deployments', 'settings'].map((tab, idx) => (
            <button key={tab} onClick={() => handleTabSwitch(tab)} className={`pb-3 text-sm font-medium capitalize transition-colors relative flex items-center gap-2 ${activeTab === tab ? 'text-zinc-100' : 'text-zinc-500'}`}>
              {tab}
              <span className="hidden md:flex items-center justify-center w-4 h-4 rounded text-[9px] border border-zinc-800 bg-zinc-900/50 font-mono text-zinc-500">{idx + 1}</span>
              {activeTab === tab && <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-white rounded-t-full"></span>}
            </button>
          ))}
        </div>

        <div className={`transition-opacity duration-300 ${isNavigating ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {activeTab === 'overview' && <OverviewTab performanceData={performanceData} />}
          {activeTab === 'deployments' && <DeploymentsTab deployments={deployments} />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}