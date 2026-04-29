import { Plus, Lock, MoreVertical } from 'lucide-react';

export function SettingsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="col-span-1 space-y-2">
        <button className="w-full text-left px-3 py-2 text-sm font-medium bg-zinc-900 text-zinc-100 rounded-md">Environment Variables</button>
        <button className="w-full text-left px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-md transition-colors">Domains</button>
        <button className="w-full text-left px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-md transition-colors">Build & Development</button>
      </div>
      
      <div className="col-span-1 md:col-span-3 border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl p-6">
        <div className="mb-6">
          <h2 className="text-xl font-medium text-zinc-100 mb-2">Environment Variables</h2>
          <p className="text-sm text-zinc-500">Manage environment variables for your application. These are encrypted and securely stored.</p>
        </div>
        
        <div className="grid grid-cols-12 gap-4 mb-4">
          <div className="col-span-4"><input type="text" placeholder="Key (e.g. DATABASE_URL)" className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600" /></div>
          <div className="col-span-7"><input type="password" placeholder="Value" className="w-full bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600" /></div>
          <div className="col-span-1 flex items-center justify-end"><button className="w-full h-full flex items-center justify-center bg-white text-black rounded-md hover:bg-zinc-200 transition-colors"><Plus size={18} /></button></div>
        </div>

        <div className="border border-zinc-800/60 rounded-lg overflow-hidden mt-8">
          <div className="grid grid-cols-12 gap-4 p-3 bg-zinc-900/30 border-b border-zinc-800/60 text-xs font-medium text-zinc-500 uppercase tracking-wider">
            <div className="col-span-4">Key</div>
            <div className="col-span-8">Value</div>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {['VITE_API_URL', 'STRIPE_SECRET_KEY'].map((key) => (
              <div key={key} className="grid grid-cols-12 gap-4 p-3 items-center hover:bg-zinc-900/20">
                <div className="col-span-4 text-sm font-mono text-zinc-300">{key}</div>
                <div className="col-span-7 flex items-center gap-2 text-sm text-zinc-500 font-mono"><Lock size={12} /> ••••••••••••••••</div>
                <div className="col-span-1 flex justify-end"><button className="text-zinc-500 hover:text-red-400"><MoreVertical size={16} /></button></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}