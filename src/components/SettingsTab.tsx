import { ApiTopology } from './ApiTopology';

export function SettingsTab() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-800/60 bg-zinc-900/20">
          <h2 className="text-sm font-semibold text-zinc-100">Architecture Map</h2>
          <p className="text-xs text-zinc-500 mt-1">Live topology of your API routing layer.</p>
        </div>
        <div className="p-4">
          <ApiTopology />
        </div>
      </div>
    </div>
  );
}
