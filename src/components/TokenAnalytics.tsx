import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Sparkles } from 'lucide-react';

export function TokenAnalytics() {
  const data = [
    { name: 'GPT-4o (Routing)', value: 1.2, color: '#3b82f6' },
    { name: 'Claude 3.5 (Logic)', value: 2.8, color: '#a855f7' },
    { name: 'DeepSeek (Code)', value: 0.8, color: '#10b981' },
  ];

  return (
    <div className="border border-zinc-800/60 bg-[#0A0A0A] rounded-xl overflow-hidden shadow-2xl h-full flex flex-col">
      <div className="p-4 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-900/20">
        <h3 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" /> Agent Token Burn (M)
        </h3>
        <span className="text-xs font-mono text-zinc-500">Last 24h</span>
      </div>
      <div className="flex-1 p-4 flex items-center justify-center min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
              itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="p-4 bg-zinc-900/20 border-t border-zinc-800/60 grid grid-cols-3 gap-2">
        {data.map(model => (
          <div key={model.name} className="text-center">
            <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ backgroundColor: model.color }}></div>
            <p className="text-[10px] text-zinc-500 truncate">{model.name}</p>
            <p className="text-xs font-mono text-zinc-300">{model.value}M</p>
          </div>
        ))}
      </div>
    </div>
  );
}
