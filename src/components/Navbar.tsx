import { ChevronDown, LogOut } from 'lucide-react';

type NavbarProps = {
  serverConnected?: boolean;
  connectionStatusLabel?: string;
  connectionStatusDetail?: string;
  onLogout?: () => void;
};

export function Navbar({
  serverConnected = false,
  connectionStatusLabel = 'Disconnected',
  connectionStatusDetail,
  onLogout,
}: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-black/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 bg-white text-black flex items-center justify-center rounded-[4px] font-bold text-sm tracking-tighter cursor-pointer">EG</div>
            <span className="text-zinc-100 font-medium tracking-tight cursor-pointer">EpicGlobal</span>
          </div>

          <span className="hidden sm:inline text-zinc-600 font-light text-xl mb-1 mx-0.5">/</span>

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 hover:bg-zinc-900/80 rounded-md cursor-pointer transition-colors group min-w-0">
            <span className="text-zinc-100 font-medium tracking-tight truncate">epicglobal.app</span>
            <ChevronDown size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Status dot — visible on all sizes, label only md+ */}
          <div
            className="flex items-center gap-2 text-xs font-medium text-zinc-500"
            title={connectionStatusDetail}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {serverConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${serverConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="hidden md:inline">{connectionStatusLabel}</span>
          </div>
          
          <button className="hidden sm:block text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Feedback</button>
          {onLogout && (
            <button onClick={onLogout} title="Lock & Log out" className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-red-400 transition-colors">
              <LogOut size={15} />
            </button>
          )}
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-zinc-800 bg-zinc-900 cursor-pointer hover:border-zinc-600 transition-colors"></div>
        </div>
      </div>
    </nav>
  );
}
