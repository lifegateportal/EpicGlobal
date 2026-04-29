import { CheckCircle2, Clock, GitBranch, MoreVertical, Search, RotateCcw, TerminalSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export function DeploymentsTab({ deployments }: { deployments: any[] }) {
  const handleSwipeAction = (action: string, id: string) => {
    if (action === 'rollback') toast.error(`Rollback initiated for ${id}. Service will restart.`);
    if (action === 'logs') toast.info(`Fetching deep logs for ${id}...`);
  };

  return (
    <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/20">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search deployments..." className="bg-black border border-zinc-800 rounded-md py-1.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 w-64" />
        </div>
        <p className="text-[10px] text-zinc-500 hidden md:block">Swipe rows left or right for quick actions</p>
      </div>
      <div className="divide-y divide-zinc-800/60 overflow-hidden">
        {deployments.map((deploy) => (
          <div key={deploy.id} className="relative bg-[#0A0A0A]">
            
            {/* Background Actions (Revealed on Swipe) */}
            <div className="absolute inset-0 flex justify-between items-center px-6">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold tracking-wider uppercase"><TerminalSquare size={16} /> Logs</div>
              <div className="flex items-center gap-2 text-red-400 text-xs font-bold tracking-wider uppercase">Rollback <RotateCcw size={16} /></div>
            </div>

            {/* Foreground Draggable Row */}
            <motion.div 
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80) handleSwipeAction('logs', deploy.id);
                if (info.offset.x < -80) handleSwipeAction('rollback', deploy.id);
              }}
              className="p-4 flex items-center justify-between bg-[#0A0A0A] cursor-grab active:cursor-grabbing hover:bg-zinc-900/40 transition-colors relative z-10"
            >
              <div className="flex items-center gap-4 pointer-events-none">
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
              <div className="flex items-center gap-4 text-xs text-zinc-500 pointer-events-none">
                <span>{deploy.duration}</span>
                <MoreVertical size={16} />
              </div>
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
}