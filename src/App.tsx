import { useState, useEffect } from 'react';
import { Lock, Terminal, LayoutDashboard, Rocket, Clock, KeyRound, FolderOpen, Globe, Plus, Layers, Network, Settings, ChevronDown, ChevronRight, Server, Search, ShieldCheck, HardDrive, Activity } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';
import { SetupTab } from './components/SetupTab';
import { CommandTerminal } from './components/CommandTerminal';
import { CommandPalette } from './components/CommandPalette';
import { KeyboardHUD } from './components/KeyboardHUD';
import DeploymentDashboard from './components/DeploymentDashboard';
import BackendManager from './components/BackendManager';
import { DomainsTab } from './components/DomainsTab';
import { useTelemetry } from './hooks/useTelemetry';

const AUTH_PASSWORD = import.meta.env.VITE_AUTH_PASSWORD?.trim() || 'epicglobal';
const ACTIVE_TAB_KEY = 'eg_active_tab';
const VALID_TABS = new Set([
  'overview',
  'deployments/history', 'deployments/env', 'deployments/files',
  'edge', 'setup', 'settings',
  'orchestrator/projects', 'orchestrator/queue', 'orchestrator/secrets', 'orchestrator/backups', 'orchestrator/monitoring', 'orchestrator/history',
  'domains/search', 'domains/mydomains', 'domains/dns',
]);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('eg_auth') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem(ACTIVE_TAB_KEY) || '';
    return VALID_TABS.has(savedTab) ? savedTab : 'setup';
  });
  const [deploymentsOpen, setDeploymentsOpen] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY) || '';
    return saved.startsWith('deployments/');
  });
  const [orchestratorOpen, setOrchestratorOpen] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY) || '';
    return saved.startsWith('orchestrator/');
  });
  const [domainsOpen, setDomainsOpen] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY) || '';
    return saved.startsWith('domains/');
  });
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

  // Persist tab selection so refresh/login returns users to their last page.
  useEffect(() => {
    if (VALID_TABS.has(activeTab)) {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
    }
  }, [activeTab]);

  // Updated Keyboard Shortcuts to include the new Orchestrator tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') handleTabSwitch('overview');
      if (e.key === '2') handleTabSwitch('deployments/history');
      if (e.key === '3') handleTabSwitch('edge');
      if (e.key === '4') handleTabSwitch('orchestrator/projects');
      if (e.key === '5') handleTabSwitch('settings');
      if (e.key === '6') handleTabSwitch('setup');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  const handleTabSwitch = (tab: string) => {
    if (activeTab === tab) return;
    setIsNavigating(true);
    if (tab.startsWith('deployments/'))  setDeploymentsOpen(true);
    if (tab.startsWith('orchestrator/')) setOrchestratorOpen(true);
    if (tab.startsWith('domains/'))      setDomainsOpen(true);
    setActiveTab(tab);
    setTimeout(() => setIsNavigating(false), 300);
  };

  const toggleDeployments = () => {
    if (!deploymentsOpen) { setDeploymentsOpen(true); if (!activeTab.startsWith('deployments/')) handleTabSwitch('deployments/history'); }
    else setDeploymentsOpen(false);
  };
  const toggleOrchestrator = () => {
    if (!orchestratorOpen) { setOrchestratorOpen(true); if (!activeTab.startsWith('orchestrator/')) handleTabSwitch('orchestrator/projects'); }
    else setOrchestratorOpen(false);
  };
  const toggleDomains = () => {
    if (!domainsOpen) { setDomainsOpen(true); if (!activeTab.startsWith('domains/')) handleTabSwitch('domains/search'); }
    else setDomainsOpen(false);
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

  // ── Sub-item definitions ──────────────────────────────────────────────────
  const deploymentsSubItems = [
    { id: 'deployments/history', label: 'History',        icon: Clock },
    { id: 'deployments/env',     label: 'Env. Variables', icon: KeyRound },
    { id: 'deployments/files',   label: 'File Manager',   icon: FolderOpen },
  ];
  const orchestratorSubItems = [
    { id: 'orchestrator/projects',   label: 'Projects',   icon: Server },
    { id: 'orchestrator/queue',      label: 'Queue',      icon: Activity },
    { id: 'orchestrator/secrets',    label: 'Secrets',    icon: ShieldCheck },
    { id: 'orchestrator/backups',    label: 'Backups',    icon: HardDrive },
    { id: 'orchestrator/monitoring', label: 'Monitoring', icon: Activity },
    { id: 'orchestrator/history',    label: 'History',    icon: Clock },
  ];
  const domainsSubItems = [
    { id: 'domains/search',    label: 'Buy Custom Domain', icon: Search },
    { id: 'domains/mydomains', label: 'My Domains',        icon: Globe },
    { id: 'domains/dns',       label: 'DNS Manager',       icon: Server },
  ];

  // ── Page titles ────────────────────────────────────────────────────────────
  const pageTitles: Record<string, { title: string; sub: string }> = {
    'overview':                   { title: 'Overview',            sub: 'Your application is live and receiving traffic.' },
    'deployments/history':        { title: 'Deployment History',  sub: 'View and manage all deployment runs.' },
    'deployments/env':            { title: 'Env. Variables',      sub: 'Manage encrypted per-project secrets.' },
    'deployments/files':          { title: 'File Manager',        sub: 'Browse and edit static project files.' },
    'edge':                       { title: 'Edge',                sub: 'CDN and edge configuration.' },
    'setup':                      { title: 'New Deploy',          sub: 'Set up and trigger a new deployment.' },
    'orchestrator/projects':      { title: 'Live Projects',       sub: 'Control all running backend projects.' },
    'orchestrator/queue':         { title: 'Deploy Queue',        sub: 'Monitor the active deployment pipeline.' },
    'orchestrator/secrets':       { title: 'Secrets Vault',       sub: 'Manage encrypted environment secrets.' },
    'orchestrator/backups':       { title: 'Backups & Restore',   sub: 'Create and restore full system backups.' },
    'orchestrator/monitoring':    { title: 'Monitoring',          sub: 'Auto-heal watchdog and alert notifications.' },
    'orchestrator/history':       { title: 'Deploy History',      sub: 'Full history across all projects.' },
    'domains/search':             { title: 'Buy Custom Domain',  sub: 'Check availability and register domains.' },
    'domains/mydomains':          { title: 'My Domains',          sub: 'View and manage your registered domains.' },
    'domains/dns':                { title: 'DNS Manager',         sub: 'Configure DNS records for your domains.' },
    'settings':                   { title: 'Settings',            sub: 'API keys and connection settings.' },
  };

  const currentPage = pageTitles[activeTab] ?? { title: 'EpicGlobal', sub: '' };

  // ── Reusable sidebar components ────────────────────────────────────────────
  const SectionLabel = ({ label }: { label: string }) => (
    <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 pt-4 pb-1 select-none">{label}</p>
  );

  const NavItem = ({ id, label, icon: Icon }: { id: string; label: string; icon: React.ElementType }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => handleTabSwitch(id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive ? 'bg-zinc-800/80 text-white' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60'
        }`}
      >
        <Icon size={15} className={`shrink-0 ${isActive ? 'text-white' : 'text-zinc-600'}`} />
        <span>{label}</span>
      </button>
    );
  };

  const ExpandableGroup = ({
    id, label, icon: Icon, isOpen, onToggle, subItems,
  }: {
    id: string; label: string; icon: React.ElementType;
    isOpen: boolean; onToggle: () => void;
    subItems: { id: string; label: string; icon: React.ElementType }[];
  }) => {
    const isGroupActive = activeTab.startsWith(id + '/');
    return (
      <div>
        <button
          onClick={onToggle}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isGroupActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          <span className="flex items-center gap-3">
            <Icon size={15} className={`shrink-0 ${isGroupActive ? 'text-white' : 'text-zinc-600'}`} />
            {label}
          </span>
          {isOpen
            ? <ChevronDown size={12} className="text-zinc-600 shrink-0" />
            : <ChevronRight size={12} className="text-zinc-600 shrink-0" />}
        </button>
        {isOpen && (
          <div className="ml-5 mt-0.5 space-y-0.5 border-l border-zinc-800/60 pl-3">
            {subItems.map(({ id: subId, label: subLabel, icon: SubIcon }) => {
              const isActive = activeTab === subId;
              return (
                <button
                  key={subId}
                  onClick={() => handleTabSwitch(subId)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    isActive ? 'bg-zinc-800/80 text-white font-medium' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60'
                  }`}
                >
                  <SubIcon size={13} className={`shrink-0 ${isActive ? 'text-white' : 'text-zinc-600'}`} />
                  {subLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Domains sub-tab derived value ─────────────────────────────────────────
  const domainsSubTab = (activeTab.startsWith('domains/') ? activeTab.replace('domains/', '') : 'search') as 'search' | 'mydomains' | 'dns';
  const orchestratorSubTab = (activeTab.startsWith('orchestrator/') ? activeTab.replace('orchestrator/', '') : 'projects') as 'projects' | 'queue' | 'secrets' | 'backups' | 'monitoring' | 'history';

  return (
    <div className="h-screen flex flex-col bg-black text-zinc-300 font-sans antialiased selection:bg-purple-500/30 overflow-hidden">
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      <KeyboardHUD />
      <CommandPalette setTab={handleTabSwitch} openTerminal={() => setIsTerminalOpen(true)} />
      <CommandTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />

      <Navbar
        serverConnected={serverConnected}
        connectionStatusLabel={connectionStatusLabel}
        connectionStatusDetail={connectionStatusDetail}
        onLogout={() => { sessionStorage.removeItem('eg_auth'); setIsAuthenticated(false); }}
      />

      {isOffline && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-500 text-xs font-medium py-2 px-6 flex items-center justify-center gap-2 shrink-0">
          Working offline. Changes will sync when connection is restored.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="w-52 shrink-0 flex flex-col border-r border-zinc-800/60 bg-[#0A0A0A] overflow-y-auto">
          <nav className="flex-1 px-3 pt-3 pb-4">

            <SectionLabel label="Navigate" />
            <div className="space-y-0.5">
              <NavItem id="overview" label="Overview" icon={LayoutDashboard} />
              <ExpandableGroup
                id="deployments" label="Deployments" icon={Rocket}
                isOpen={deploymentsOpen} onToggle={toggleDeployments}
                subItems={deploymentsSubItems}
              />
              <NavItem id="edge"  label="Edge"       icon={Globe} />
              <NavItem id="setup" label="New Deploy" icon={Plus} />
            </div>

            <SectionLabel label="Manage" />
            <div className="space-y-0.5">
              <ExpandableGroup
                id="orchestrator" label="Projects" icon={Layers}
                isOpen={orchestratorOpen} onToggle={toggleOrchestrator}
                subItems={orchestratorSubItems}
              />
              <ExpandableGroup
                id="domains" label="Domains & DNS" icon={Network}
                isOpen={domainsOpen} onToggle={toggleDomains}
                subItems={domainsSubItems}
              />
              <NavItem id="settings" label="Settings" icon={Settings} />
            </div>

          </nav>

          {/* Sidebar footer */}
          <div className="px-3 py-3 border-t border-zinc-800/60">
            <button
              onClick={() => setIsTerminalOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors"
            >
              <Terminal size={15} className="text-zinc-600 shrink-0" />
              <span>Terminal</span>
            </button>
          </div>
        </aside>

        {/* ── Content Area ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60">
            <h1 className="text-lg font-semibold text-white tracking-tight">{currentPage.title}</h1>
            {currentPage.sub && <p className="text-sm text-zinc-500 mt-0.5">{currentPage.sub}</p>}
          </div>

          <div className={`flex-1 min-h-0 p-6 overflow-y-auto transition-opacity duration-200 ${isNavigating ? 'opacity-0' : 'opacity-100'}`}>
            {activeTab === 'overview' && (
              <OverviewTab performanceData={performanceData} serverConnected={serverConnected} connectionStatusDetail={connectionStatusDetail} />
            )}
            {activeTab === 'deployments/history' && <DeploymentsTab subTab="history" />}
            {activeTab === 'deployments/env'     && <DeploymentsTab subTab="env" />}
            {activeTab === 'deployments/files'   && <DeploymentsTab subTab="files" />}
            {activeTab === 'edge'    && <DeploymentDashboard />}
            {activeTab === 'setup'   && <SetupTab />}
            {activeTab === 'settings'&& <SettingsTab />}
            {activeTab.startsWith('orchestrator/') && (
              <BackendManager subTab={orchestratorSubTab} />
            )}
            {activeTab.startsWith('domains/') && (
              <DomainsTab
                subTab={domainsSubTab}
                onNavigateDns={() => handleTabSwitch('domains/dns')}
                onNavigate={(tab) => handleTabSwitch(`domains/${tab}`)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}