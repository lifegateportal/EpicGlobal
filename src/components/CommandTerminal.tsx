import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal, Sparkles, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';

export function CommandTerminal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [zenMode, setZenMode] = useState(false); // ZEN MODE STATE

  useEffect(() => {
    if (isOpen) {
      setLogs(['[system] Initializing connection to nyc-1...', '[system] Authenticated.', '[deploy] Listening for events...']);
    }
  }, [isOpen]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    setLogs(prev => [...prev, `> ${command}`, `[agent] Processing instruction via isolated subsystem...`]);
    setCommand('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
          
          <motion.div 
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            // ZEN MODE WIDTH TOGGLE
            className={`fixed top-0 right-0 h-full bg-[#0A0A0A] border-l border-zinc-800/60 z-[70] flex flex-col shadow-2xl transition-all duration-300 ${zenMode ? 'w-full' : 'w-full md:w-[450px]'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800/60 bg-zinc-900/40">
              <div className="flex items-center gap-2 text-zinc-100 font-medium"><Terminal size={16} /><span>{zenMode ? 'Zen Mode: Deep Debugging' : 'Command & Logs'}</span></div>
              <div className="flex items-center gap-2">
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setZenMode(!zenMode)} className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors">
                  {zenMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setZenMode(false); onClose(); }} className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors">
                  <X size={16} />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-zinc-400 space-y-2">
              {logs.map((log, i) => <div key={i} className={log.startsWith('>') ? 'text-zinc-100' : log.includes('[agent]') ? 'text-purple-400' : ''}>{log}</div>)}
            </div>

            <div className="p-4 border-t border-zinc-800/60 bg-zinc-900/20">
              <form onSubmit={handleCommand} className="relative">
                <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500" />
                <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Ask the agent to manage the server..." className="w-full bg-black border border-zinc-800 rounded-md py-2.5 pl-9 pr-4 text-sm text-zinc-300 focus:outline-none focus:border-purple-500/50" />
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
