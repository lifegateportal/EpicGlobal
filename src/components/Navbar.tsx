import { ChevronDown } from 'lucide-react';

type NavbarProps = {
  serverConnected?: boolean;
  connectionStatusLabel?: string;
  connectionStatusDetail?: string;
};

export function Navbar({
  serverConnected = false,
  connectionStatusLabel = 'Disconnected',
  connectionStatusDetail,
}: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-black/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white text-black flex items-center justify-center rounded-[4px] font-bold text-sm tracking-tighter cursor-pointer">EG</div>
            <span className="text-zinc-100 font-medium tracking-tight ml-1 cursor-pointer">EpicGlobal</span>
            <span className="text-zinc-600 font-light text-xl mb-1 mx-1">/</span>
            
            <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-900/80 rounded-md cursor-pointer transition-colors group">
              <span className="text-zinc-100 font-medium tracking-tight">epicglobal.app</span>
              <ChevronDown size={14} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
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
          
          <button className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Feedback</button>
          <div className="w-8 h-8 rounded-full border border-zinc-800 bg-zinc-900 cursor-pointer hover:border-zinc-600 transition-colors"></div>
        </div>
      </div>
    </nav>
  );
}
