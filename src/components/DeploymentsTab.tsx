import { useState } from 'react';
import { CheckCircle2, Clock, GitBranch, MoreVertical, Search, RotateCcw, TerminalSquare, Check, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export function DeploymentsTab({ deployments }: { deployments: any[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Commit hash copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/20">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search deployments..." className="bg-black border border-zinc-800 rounded-md py-1.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 w-64" />
        </div>
      </div>
      <div className="divide-y divide-zinc-800/60 overflow-hidden">
        {deployments.map((deploy) => {
          const isLargeBundle = deploy.bundleSize > 4; // Mock logic: > 4MB triggers warning
          
          return (
            <motion.div key={deploy.id} className="p-4 flex items-center justify-between bg-[#0A0A0A] hover:bg-zinc-900/40 transition-colors">
              <div className="flex items-center gap-4">
                {deploy.status === 'ready' ? <CheckCircle2 size={18} className="text-green-400" /> : 
                 deploy.status === 'error' ? <div className="w-[18px] h-[18px] rounded-full border-2 border-red-500 text-red-500 flex items-center justify-center text-[10px] font-bold">!</div> :
                 <Clock size={18} className="text-blue-400 animate-spin-slow" />}
                <div>
                  <p className="text-sm font-medium text-zinc-200 mb-0.5">{deploy.commit}</p>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span onClick={(e) => handleCopy(e, deploy.hash, deploy.id)} className="font-mono bg-zinc-800/50 hover:bg-zinc-700/80 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors group">
                      {copiedId === deploy.id ? <><Check size={10} className="text-green-400" /> <span className="text-green-400">Copied</span></> : <><Copy size={10} className="opacity-0 group-hover:opacity-100 absolute -ml-3" /> {deploy.hash}</>}
                    </span>
                    <span className="flex items-center gap-1"><GitBranch size={10} /> {deploy.branch}</span>
                    <span>{deploy.time}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                {/* Bundle Size Visualizer */}
                <div className="hidden md:flex flex-col items-end gap-1" title={`Bundle Size: ${deploy.bundleSize}MB`}>
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full ${isLargeBundle ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${(deploy.bundleSize / 6) * 100}%` }}></div>
                  </div>
                  <span className={`text-[10px] font-mono ${isLargeBundle ? 'text-yellow-500' : 'text-zinc-500'}`}>{deploy.bundleSize} MB</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <span className="tabular-nums font-mono">{deploy.duration}</span>
                  <MoreVertical size={16} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}