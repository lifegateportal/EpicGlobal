import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Command } from 'lucide-react';

export function KeyboardHUD() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show HUD when '?' is held down, but ignore if typing in an input
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        setShow(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === '?') setShow(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md"
        >
          <div className="bg-[#0A0A0A] border border-zinc-800 rounded-2xl p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-xl font-medium text-zinc-100 mb-6 flex items-center gap-2">
              <Command className="text-purple-400" /> Command Center HUD
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Global Command Menu</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">Cmd + K</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Navigate to Overview</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">1</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Navigate to Deployments</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">2</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Navigate to Edge</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">3</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Navigate to Orchestrator</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">4</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Navigate to Settings</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">5</kbd>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                <span className="text-zinc-400 text-sm">Show this overlay</span>
                <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300">Hold ?</kbd>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
