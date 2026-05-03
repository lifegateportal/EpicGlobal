import { GitBranch, Server, CheckCircle2, Terminal, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type OverviewTabProps = {
  performanceData: any[];
  serverConnected?: boolean;
  connectionStatusDetail?: string;
};

export function OverviewTab({
  performanceData,
  serverConnected = false,
  connectionStatusDetail,
}: OverviewTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-zinc-800/60">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
            <h2 className="text-base sm:text-lg font-medium text-zinc-100">epicglobal.app</h2>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium tracking-wide flex items-center gap-1.5 uppercase ${serverConnected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${serverConnected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse' : 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.6)]'}`}></span>
              {serverConnected ? 'Healthy' : 'Telemetry offline'}
            </span>
          </div>
          <a href="https://epicglobal.app" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">https://epicglobal.app</a>
          {connectionStatusDetail && (
            <p className="mt-2 text-xs text-zinc-500">{connectionStatusDetail}</p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/60 bg-zinc-900/20">
          <div className="p-3 sm:p-5"><p className="text-[10px] sm:text-xs text-zinc-500 mb-1 sm:mb-1.5 uppercase tracking-wider font-semibold">Environment</p><p className="text-xs sm:text-sm text-zinc-200 font-medium flex items-center gap-1.5"><Server size={13} className="text-zinc-400 shrink-0" /> nyc-1 (Droplet)</p></div>
          <div className="p-3 sm:p-5"><p className="text-[10px] sm:text-xs text-zinc-500 mb-1 sm:mb-1.5 uppercase tracking-wider font-semibold">Branch</p><p className="text-xs sm:text-sm text-zinc-200 font-medium flex items-center gap-1.5"><GitBranch size={13} className="text-zinc-400 shrink-0" /> main</p></div>
          <div className="p-3 sm:p-5"><p className="text-[10px] sm:text-xs text-zinc-500 mb-1 sm:mb-1.5 uppercase tracking-wider font-semibold">Status</p><p className="text-xs sm:text-sm text-zinc-200 font-medium flex items-center gap-1.5"><CheckCircle2 size={13} className="text-green-400 shrink-0" /> Ready</p></div>
          <div className="p-3 sm:p-5"><p className="text-[10px] sm:text-xs text-zinc-500 mb-1 sm:mb-1.5 uppercase tracking-wider font-semibold">Runtime</p><p className="text-xs sm:text-sm text-zinc-200 font-medium flex items-center gap-1.5"><Terminal size={13} className="text-zinc-400 shrink-0" /> Node / Vite</p></div>
        </div>
      </div>

      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-6 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/20">
          <h3 className="text-base sm:text-lg font-medium text-zinc-100 flex items-center gap-2"><Activity size={16} className="text-zinc-400 sm:hidden" /><Activity size={18} className="text-zinc-400 hidden sm:inline" /> System Metrics</h3>
        </div>
        <div className="p-3 sm:p-6 h-[220px] sm:h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={performanceData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} dx={-10} />
              <Tooltip contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }} itemStyle={{ color: '#e4e4e7' }} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
              <Area type="monotone" dataKey="ram" stroke="#a855f7" strokeWidth={2} fillOpacity={1} fill="url(#colorRam)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}