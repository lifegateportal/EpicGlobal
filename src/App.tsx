import { useState, useEffect } from 'react';
import { Lock, Terminal } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';
import { CommandTerminal } from './components/CommandTerminal';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardHUD } from './components/KeyboardHUD';
import DeploymentDashboard from './components/DeploymentDashboard';
import BackendManager from './components/BackendManager';
import { useTelemetry } from './hooks/useTelemetry';

const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD?.trim() || 'epicglobal';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('eg_auth') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const { serverConnected, connectionStatusLabel, connectionStatusDetail, performanceData } =
    useTelemetry(isAuthenticated);

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

  // Updated Keyboard Shortcuts to include the new Orchestrator tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') handleTabSwitch('overview');
      if (e.key === '2') handleTabSwitch('deployments');
      if (e.key === '3') handleTabSwitch('edge');
      if (e.key === '4') handleTabSwitch('orchestrator');
      if (e.key === '5') handleTabSwitch('settings');
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
    const handleAuth = (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordInput === AUTH_PASSWORD) {
        sessionStorage.setItem('eg_auth', 'true');
        setIsAuthenticated(true);
        setAuthError('');
      } else {
        setAuthError('Incorrect password.');
        setPasswordInput('');
      }
    };

    return (
      <div className="min-h-screen bg-black flex items-center justify-center font-sans">
        <div className="border border-zinc-800/60 bg-[#0A0A0A] p-8 rounded-xl shadow-2xl w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center rounded-lg font-bold text-2xl tracking-tighter mx-auto mb-6">EG</div>
          <h1 className="text-xl font-medium text-zinc-100 mb-2">EpicGlobal Control</h1>
          <p className="text-sm text-zinc-500 mb-6">Enter your access password to continue.</p>
          <form onSubmit={handleAuth} className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full bg-black border border-zinc-800 rounded-md py-2.5 px-3 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
            />
            {authError && <p className="text-red-400 text-xs">{authError}</p>}
            <button type="submit" className="w-full py-2.5 bg-white text-black rounded-md text-sm font-medium hover:bg-zinc-200">
              <Lock size={14} className="inline mr-2" /> Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Structured Tab Array for cleaner rendering and custom labels
  const navTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'deployments', label: 'Deployments' },
    { id: 'edge', label: 'Edge' },
    { id: 'orchestrator', label: 'Backend Orchestrator' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-purple-500/30 pb-12">
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      <KeyboardHUD />
      <CommandPalette setTab={handleTabSwitch} openTerminal={() => setIsTerminalOpen(true)} />
      <CommandTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

      <Navbar
        serverConnected={serverConnected}
        connectionStatusLabel={connectionStatusLabel}
        connectionStatusDetail={connectionStatusDetail}
        onLogout={() => {
          sessionStorage.removeItem('eg_auth');
          setIsAuthenticated(false);
        }}
      />

      {isOffline && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-xs font-medium py-2 px-6 flex items-center justify-center gap-3">
          Working offline. Changes will sync when connection is restored.
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-6 sm:mb-8 gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-100 tracking-tight mb-1.5">Production Deployment</h1>
            <p className="text-sm text-zinc-500">Your application is live and receiving traffic.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => setIsTerminalOpen(true)}
              className="h-9 w-9 sm:w-auto sm:px-4 flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-md hover:bg-zinc-800 transition-colors"
            >
              <Terminal size={15} />
              <span className="hidden sm:inline whitespace-nowrap">Command & Logs</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="-mx-4 sm:mx-0 px-4 sm:px-0 flex gap-5 sm:gap-6 border-b border-zinc-800/60 mb-6 sm:mb-8 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id)}
              className={`pb-3 text-sm font-medium transition-colors shrink-0 ${
                activeTab === tab.id
                  ? 'text-zinc-100 border-b-2 border-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={`transition-opacity duration-300 ${isNavigating ? 'opacity-0' : 'opacity-100'}`}>
          {activeTab === 'overview' && (
            <OverviewTab
              performanceData={performanceData}
              serverConnected={serverConnected}
              connectionStatusDetail={connectionStatusDetail}
            />
          )}
          {activeTab === 'deployments' && <DeploymentsTab />}
          {activeTab === 'edge' && <DeploymentDashboard />}
          {/* Injecting the new God-Mode Engine Panel */}
          {activeTab === 'orchestrator' && <BackendManager />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}