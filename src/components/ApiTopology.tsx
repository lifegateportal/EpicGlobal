import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function ApiTopology() {
  const nodes = [
    { id: '1', position: { x: 50, y: 50 }, data: { label: 'epicglobal.app (Frontend)' }, style: { background: '#0A0A0A', color: '#fff', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' } },
    { id: '2', position: { x: 50, y: 150 }, data: { label: 'API Gateway (nyc-1)' }, style: { background: '#18181b', color: '#a1a1aa', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '12px' } },
    { id: '3', position: { x: -50, y: 250 }, data: { label: 'Agent Routing' }, style: { background: '#18181b', color: '#c084fc', border: '1px solid #a855f7', borderRadius: '8px', fontSize: '12px' } },
    { id: '4', position: { x: 150, y: 250 }, data: { label: 'PostgreSQL DB' }, style: { background: '#18181b', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: '8px', fontSize: '12px' } },
  ];
  const edges = [
    { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#52525b' } },
    { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#a855f7' } },
    { id: 'e2-4', source: '2', target: '4', style: { stroke: '#3b82f6' } },
  ];

  return (
    <div className="h-[300px] w-full border border-zinc-800/60 rounded-xl overflow-hidden bg-black relative">
      <ReactFlow nodes={nodes} edges={edges} fitView colorMode="dark">
        <Background gap={12} size={1} color="#27272a" />
        <Controls showInteractive={false} className="bg-zinc-900 border-zinc-800 fill-white" />
      </ReactFlow>
      <div className="absolute top-4 left-4 z-10 text-xs font-medium text-zinc-100 bg-black/80 px-2 py-1 rounded border border-zinc-800">
        System Architecture
      </div>
    </div>
  );
}
