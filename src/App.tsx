import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { DeploymentsTab } from './components/DeploymentsTab';
import { SettingsTab } from './components/SettingsTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');

  // Master State Data (Soon to be fetched from an API)
  const deployments = [
    { id: 'deploy-04a', status: 'ready', branch: 'main', time: '2m', commit: 'Update routing logic', hash: 'a1b2c3d', duration: '45s' },
    { id: 'deploy-03f', status: 'building', branch: 'feature/auth', time: 'Just now', commit: 'Add Stripe webhooks', hash: 'e5f6g7h', duration: '--' },
    { id: 'deploy-02b', status: 'ready', branch: 'main', time: '5h', commit: 'Initial infrastructure setup', hash: 'i9j0k1l', duration: '1m 12s' },
    { id: 'deploy-01a', status: 'error', branch: 'main', time: '1d', commit: 'Test failing build', hash: 'z9y8x7w', duration: '14s' },
  ];

  const performanceData = [
    { time: '10:00', cpu: 25, ram: 45 }, { time: '10:05', cpu: 38, ram: 48 },
    { time: '10:10', cpu: 85, ram: 52 }, { time: '10:15', cpu: 42, ram: 50 },
    { time: '10:20', cpu: 28, ram: 46 }, { time: '10:25', cpu: 32, ram: 47 },
    { time: '10:30', cpu: 29, ram: 46 },
  ];

  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans antialiased selection:bg-blue-500/30 pb-12">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-100 tracking-tight mb-2">Production Deployment</h1>
            <p className="text-sm text-zinc-500">Your application is live and receiving traffic.</p>
          </div>
          <div className="flex gap-3">
            <button className="h-9 px-4 bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-md hover:bg-zinc-800 transition-colors">
              View Logs
            </button>
            <a href="https://epicglobal.app" target="_blank" rel="noreferrer" className="h-9 px-4 bg-white text-black text-sm font-medium rounded-md flex items-center gap-2 hover:bg-zinc-200 transition-colors">
              Visit Site <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div className="flex gap-6 border-b border-zinc-800/60 mb-8 overflow-x-auto hide-scrollbar">
          {['overview', 'deployments', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium capitalize transition-colors relative whitespace-nowrap ${
                activeTab === tab ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-white rounded-t-full"></span>
              )}
            </button>
          ))}
        </div>

        {/* Dynamic Component Rendering */}
        {activeTab === 'overview' && <OverviewTab performanceData={performanceData} />}
        {activeTab === 'deployments' && <DeploymentsTab deployments={deployments} />}
        {activeTab === 'settings' && <SettingsTab />}

      </main>
    </div>
  );
}