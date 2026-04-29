import { useState } from 'react';
import { Plus, Lock, Trash2, GripVertical } from 'lucide-react';
import { Reorder, motion } from 'framer-motion';
import { toast } from 'sonner';
import { ApiTopology } from './ApiTopology';

export function SettingsTab() {
  const [envVars, setEnvVars] = useState([
    { id: '1', key: 'VITE_API_URL', value: '••••••••••••••••' },
    { id: '2', key: 'STRIPE_SECRET_KEY', value: '••••••••••••••••' },
    { id: '3', key: 'OPENAI_API_KEY', value: '••••••••••••••••' }
  ]);
  const [newKey, setNewKey] = useState('');

  const handleAddEnv = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey) return;
    const formatted = newKey.toUpperCase().replace(/\s+/g, '_');
    setEnvVars(prev => [{ id: Date.now().toString(), key: formatted, value: '••••••••••••••••' }, ...prev]);
    setNewKey('');
    toast.success(`${formatted} securely stored.`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="col-span-1 space-y-2">
        <button className="w-full text-left px-3 py-2 text-sm font-medium bg-zinc-900 text-zinc-100 rounded-md transition-colors">Environment Variables</button>
        <button className="w-full text-left px-3 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-md transition-colors">Architecture Map</button>
      </div>
      
      <div className="col-span-1 md:col-span-3 space-y-8">
        {/* DRAG AND DROP ENV VARS */}
        <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl shadow-2xl p-6">
          <h2 className="text-xl font-medium text-zinc-100 mb-2">Environment Variables</h2>
          <p className="text-sm text-zinc-500 mb-6">Drag and drop to reorder priority. Variables are encrypted at rest.</p>
          
          <form onSubmit={handleAddEnv} className="flex gap-4 mb-6">
            <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="NEW_VARIABLE_KEY" className="flex-1 bg-black border border-zinc-800 rounded-md py-2 px-3 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 uppercase" />
            <motion.button whileTap={{ scale: 0.95 }} type="submit" className="px-4 flex items-center justify-center bg-white text-black rounded-md hover:bg-zinc-200 transition-colors"><Plus size={18} /></motion.button>
          </form>

          <Reorder.Group axis="y" values={envVars} onReorder={setEnvVars} className="border border-zinc-800/60 rounded-lg overflow-hidden divide-y divide-zinc-800/60">
            {envVars.map((env) => (
              <Reorder.Item key={env.id} value={env} className="flex items-center gap-4 p-3 bg-[#0A0A0A] hover:bg-zinc-900/40 transition-colors group cursor-grab active:cursor-grabbing">
                <GripVertical size={14} className="text-zinc-600" />
                <div className="w-1/3 text-sm font-mono text-zinc-300 truncate">{env.key}</div>
                <div className="flex-1 flex items-center gap-2 text-sm text-zinc-500 font-mono"><Lock size={12} /> {env.value}</div>
                <button onClick={() => setEnvVars(p => p.filter(e => e.id !== env.id))} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        {/* API TOPOLOGY MAP */}
        <ApiTopology />
      </div>
    </div>
  );
}