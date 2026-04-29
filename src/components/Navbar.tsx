export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-black/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="w-7 h-7 bg-white text-black flex items-center justify-center rounded-[4px] font-bold text-sm tracking-tighter">
              EG
            </div>
            <span className="text-zinc-100 font-medium tracking-tight">EpicGlobal</span>
            <span className="text-zinc-600 font-light text-xl mb-1">/</span>
            <span className="text-zinc-100 font-medium tracking-tight">epicglobal.app</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors">Feedback</button>
          <div className="w-8 h-8 rounded-full border border-zinc-800 bg-zinc-900 cursor-pointer"></div>
        </div>
      </div>
    </nav>
  );
}