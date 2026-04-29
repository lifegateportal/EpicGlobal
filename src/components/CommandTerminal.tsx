import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal, Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export function CommandTerminal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');

  // Simulate streaming logs when opened
  useEffect(() => {
    if (isOpen) {
      setLogs(['[system] Initializing connection to nyc-1...', '[system] Authenticated.']);
      const timer1 = setTimeout(() => setLogs(prev => [...prev, '[deploy] Fetching latest commit hash a1b2c3d...']), 1000);
      const timer2 = setTimeout(() => setLogs(prev => [...prev, '[build] Compiling assets with Vite...']), 2000);
      return () => { clearTimeout(timer1); clearTimeout(timer2); };
    }
  }, [isOpen]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    
    // Simulate Agent action
    toast.success(`Agent executing: ${command}`);
    setLogs(prev => [...prev, `> ${command}`, `[agent] Processing instruction via isolated subsystem...`]);
    
    // Demonstrate the Soft Warning override
    if (command.toLowerCase().includes('scale')) {
      setTimeout(() => {
        toast.warning('Soft Limit Reached: Scaling beyond 4GB RAM requires confirmation. Active work not blocked.', {
          icon: <AlertTriangle className="text-yellow-500" size={16} />
        });
      }, 1500);
    }
    
    setCommand('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
          
          {/* Slide-out Panel */}
          <motion.div 
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 w-full md:w-[450px] h-full bg-[#0A0A0A] border-l border-zinc-800/60 z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800/60 bg-zinc-900/40">
              <div className="flex items-center gap-2 text-zinc-100 font-medium">
                <Terminal size={16} />
                <span>Command & Logs</span>
              </div>
              <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Log Stream Area */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-zinc-400 space-y-2">
              {logs.map((log, i) => (
                <div key={i} className={log.startsWith('>') ? 'text-zinc-100' : log.includes('[agent]') ? 'text-purple-400' : ''}>
                  {log}
                </div>
              ))}
            </div>

            {/* Agentic Input */}
            <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/20">
              <form onSubmit={handleCommand} className="relative">
                <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500" />
                <input 
                  type="text" 
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Ask the agent to manage the server (e.g., 'Scale RAM')" 
                  className="w-full bg-black border border-zinc-800 rounded-md py-2.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-purple-500/50 transition-colors"
                />
              </form>
              <p className="text-[10px] text-zinc-600 mt-2 text-center">Core chat APIs and routing isolated.</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
