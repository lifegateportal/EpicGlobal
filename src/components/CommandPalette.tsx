import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { Search, Terminal, Settings, Rocket, Activity } from 'lucide-react';
import { toast } from 'sonner';

export function CommandPalette({ setTab, openTerminal }: { setTab: (t: string) => void, openTerminal: () => void }) {
  const [open, setOpen] = useState(false);

  // Listen for Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#0A0A0A] border border-zinc-800/60 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <Command label="Global Command Menu" className="w-full">
          <div className="flex items-center border-b border-zinc-800/60 px-4">
            <Search size={18} className="text-zinc-500 mr-2" />
            <Command.Input 
              autoFocus 
              placeholder="Type a command or search..." 
              className="flex-1 bg-transparent border-none py-4 text-zinc-100 text-sm focus:outline-none focus:ring-0 placeholder:text-zinc-600"
            />
            <div className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-[10px] text-zinc-400 font-mono">esc</span>
            </div>
          </div>

          <Command.List className="max-h-[300px] overflow-y-auto p-2 text-sm text-zinc-400 hide-scrollbar">
            <Command.Empty className="p-4 text-center text-zinc-500">No commands found.</Command.Empty>
            
            <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-medium text-zinc-500">
              <Command.Item onSelect={() => { setTab('overview'); setOpen(false); }} className="flex items-center gap-2 px-2 py-2.5 rounded-md hover:bg-zinc-900/50 hover:text-zinc-100 cursor-pointer transition-colors aria-selected:bg-zinc-900/50 aria-selected:text-zinc-100"><Activity size={14} /> Go to Overview</Command.Item>
              <Command.Item onSelect={() => { setTab('settings'); setOpen(false); }} className="flex items-center gap-2 px-2 py-2.5 rounded-md hover:bg-zinc-900/50 hover:text-zinc-100 cursor-pointer transition-colors aria-selected:bg-zinc-900/50 aria-selected:text-zinc-100"><Settings size={14} /> Go to Settings</Command.Item>
            </Command.Group>

            <Command.Group heading="Actions" className="px-2 pt-4 pb-1.5 text-xs font-medium text-zinc-500">
              <Command.Item onSelect={() => { openTerminal(); setOpen(false); }} className="flex items-center gap-2 px-2 py-2.5 rounded-md hover:bg-zinc-900/50 hover:text-zinc-100 cursor-pointer transition-colors aria-selected:bg-zinc-900/50 aria-selected:text-zinc-100"><Terminal size={14} /> Open Agentic Terminal</Command.Item>
              <Command.Item onSelect={() => { toast.success('Deployment triggered manually.'); setOpen(false); }} className="flex items-center gap-2 px-2 py-2.5 rounded-md hover:bg-zinc-900/50 hover:text-zinc-100 cursor-pointer transition-colors aria-selected:bg-zinc-900/50 aria-selected:text-zinc-100"><Rocket size={14} /> Trigger New Build</Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}