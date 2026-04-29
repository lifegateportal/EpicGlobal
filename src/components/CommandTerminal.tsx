import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Terminal, Sparkles, Maximize2, Minimize2, ArrowDown } from 'lucide-react';

export function CommandTerminal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [zenMode, setZenMode] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLogs(['[system] Initializing connection to nyc-1...', '[auth] Verified key.', 'Error: /src/app.js failed to bundle.', '[agent] Standing by.']);
    }
  }, [isOpen]);

  // Smart Auto-Scroll Logic
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, isOpen]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    setAutoScroll(isAtBottom);
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    setLogs(prev => [...prev, `> ${command}`, `[agent] Processing instruction...`]);
    setCommand('');
    setAutoScroll(true);
  };

  // Syntax Highlighter
  const formatLog = (log: string) => {
    if (log.startsWith('>')) return <span className="text-zinc-100 font-bold">{log}</span>;
    if (log.toLowerCase().includes('error')) return <span className="text-red-400">{log}</span>;
    if (log.includes('[agent]')) return <span className="text-purple-400">{log}</span>;
    if (log.includes('/src/')) {
      const parts = log.split('(/src/[^\\s]+)g');
      return <span>{log.replace(/(\/src\/[\w./-]+)/g, (match) => `<span class="text-blue-400 underline cursor-pointer">${match}</span>`)}</span>;
    }
    return <span>{log}</span>;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
          
          <motion.div 
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed top-0 right-0 h-full bg-[#0A0A0A] border-l border-zinc-800/60 z-[70] flex flex-col shadow-2xl transition-all duration-300 ${zenMode ? 'w-full' : 'w-full md:w-[450px]'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800/60 bg-zinc-900/40">
              <div className="flex items-center gap-2 text-zinc-100 font-medium"><Terminal size={16} /><span>{zenMode ? 'Zen Mode: Deep Debugging' : 'Command & Logs'}</span></div>
              <div className="flex items-center gap-2">
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setZenMode(!zenMode)} className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors">{zenMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</motion.button>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setZenMode(false); onClose(); }} className="p-1.5 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"><X size={16} /></motion.button>
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden">
              <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 p-4 overflow-y-auto font-mono text-xs text-zinc-400 space-y-2 pb-10">
                {logs.map((log, i) => <div key={i} dangerouslySetInnerHTML={{ __html: formatLog(log)?.props?.children || log }} />)}
              </div>
              
              {!autoScroll && (
                <button onClick={() => setAutoScroll(true)} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-black px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg animate-bounce">
                  <ArrowDown size={12} /> Resume Scroll
                </button>
              )}
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