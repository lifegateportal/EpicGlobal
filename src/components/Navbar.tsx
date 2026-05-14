import { LogOut } from 'lucide-react';

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
    <nav className="shrink-0 z-50 border-b border-zinc-800/60 bg-[#0A0A0A] h-12 flex items-center px-4 justify-between gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-white text-black flex items-center justify-center rounded-[4px] font-bold text-xs tracking-tighter">EG</div>
        <span className="text-zinc-100 font-medium tracking-tight text-sm">EpicGlobal</span>
        <span className="text-zinc-700 font-light text-lg leading-none">/</span>
        <span className="text-zinc-400 text-sm">epicglobal.app</span>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-2 text-xs font-medium text-zinc-500"
          title={connectionStatusDetail}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {serverConnected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${serverConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          </span>
          <span className="hidden sm:inline">{connectionStatusLabel}</span>
        </div>

        {onLogout && (
          <button onClick={onLogout} title="Lock & Log out" className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors">
            <LogOut size={14} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        )}
      </div>
    </nav>
  );
}
