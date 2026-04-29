import { CheckCircle2, Clock, GitBranch, MoreVertical, Search } from 'lucide-react';

export function DeploymentsTab({ deployments }: { deployments: any[] }) {
  return (
    <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/20">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search deployments..." className="bg-black border border-zinc-800 rounded-md py-1.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 w-64" />
        </div>
      </div>
      <div className="divide-y divide-zinc-800/60">
        {deployments.map((deploy) => (
          <div key={deploy.id} className="p-4 flex items-center justify-between hover:bg-zinc-900/40 transition-colors cursor-pointer">
            <div className="flex items-center gap-4">
              {deploy.status === 'ready' ? <CheckCircle2 size={18} className="text-green-400" /> : 
               deploy.status === 'error' ? <div className="w-[18px] h-[18px] rounded-full border-2 border-red-500 text-red-500 flex items-center justify-center text-[10px] font-bold">!</div> :
               <Clock size={18} className="text-blue-400 animate-spin-slow" />}
              <div>
                <p className="text-sm font-medium text-zinc-200 mb-0.5">{deploy.commit}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <span className="font-mono bg-zinc-800/50 px-1 rounded">{deploy.hash}</span>
                  <span className="flex items-center gap-1"><GitBranch size={10} /> {deploy.branch}</span>
                  <span>{deploy.time}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span>{deploy.duration}</span>
              <button className="p-1 hover:text-zinc-300"><MoreVertical size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}