import { useState } from 'react';
import { ExternalLink, Lock } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';
import { CommandTerminal } from './components/CommandTerminal';
import { CommandPalette } from './components/CommandPalette';

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

  // Master State Data (Ready for API integration)
  const deployments = [
    { id: '1', status: 'ready', branch: 'main', time: '2m', commit: 'Update routing logic', hash: 'a1b2c3d', duration: '45s' },
    { id: '2', status: 'ready', branch: 'main', time: '5h', commit: 'Initial infrastructure', hash: 'i9j0k1l', duration: '1m 12s' },
  ];
  
  const performanceData = [
    { time: '10:00', cpu: 25, ram: 45 }, { time: '10:05', cpu: 38, ram: 48 },
    { time: '10:10', cpu: 85, ram: 52 }, { time: '10:15', cpu: 42, ram: 50 },
    { time: '10:20', cpu: 28, ram: 46 }, { time: '10:25', cpu: 32, ram: 47 },
    { time: '10:30', cpu: 29, ram: 46 },
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-purple-500/30 pb-12">
      {/* SOFT WARNING SYSTEM */}
      <Toaster theme="dark" position="bottom-right" className="font-sans" />
      
      {/* GLOBAL COMMAND PALETTE (Triggered via Cmd+K) */}
      <CommandPalette setTab={setActiveTab} openTerminal={() => setIsTerminalOpen(true)} />

      {/* GLOBAL SLIDE-OUT TERMINAL */}
      <CommandTerminal isOpen={isTerminalOpen}