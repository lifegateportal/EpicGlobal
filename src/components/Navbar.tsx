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
      <div className="max-w-6xl mx-auto px-4 md:px-6 min-h-16 py-3 md:py-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
        <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-white text-black flex items-center justify-center rounded-[4px] font-bold text-sm tracking-tighter cursor-pointer shrink-0">EG</div>
            <span className="text-zinc-100 font-medium tracking-tight ml-1 cursor-pointer">EpicGlobal</span>
            <span className="text-zinc-600 font-light text-xl mb-1 mx-1 hidden sm:inline">/</span>
            <div className="hidden sm:flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-900/80 rounded-md cursor-pointer transition-colors group">
              <span className="text-zinc-100 font-medium tracking-tight">epicglobal.app</span>
              <ChevronDown size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </div>
          </div>

          <div className="flex md:hidden items-center gap-2 text-[11px] font-medium text-zinc-500" title={connectionStatusDetail}>
            <span className="relative flex h-2 w-2">
              {serverConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${serverConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            {connectionStatusLabel}
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4 w-full md:w-auto">
          <div
            className="hidden md:flex items-center gap-2 text-xs font-medium text-zinc-500 mr-2"
            title={connectionStatusDetail}
          >
            <span className="relative flex h-2 w-2">
              {serverConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${serverConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            {connectionStatusLabel}
          </div>

          <button className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors h-9 px-2 rounded-md hover:bg-zinc-900">Feedback</button>
          {onLogout && (
            <button onClick={onLogout} title="Lock & Log out" className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-red-400 transition-colors h-9 px-2 rounded-md hover:bg-zinc-900">
              <LogOut size={15} />
            </button>
          )}
          <div className="w-8 h-8 rounded-full border border-zinc-800 bg-zinc-900 cursor-pointer hover:border-zinc-600 transition-colors"></div>
        </div>
      </div>
    </nav>
  );
}
