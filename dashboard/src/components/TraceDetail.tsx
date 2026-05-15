
import type { Span } from '../types';
import { X, AlertCircle } from 'lucide-react';

interface TraceDetailProps {
  traceId: string;
  spans: Span[];
  onClose: () => void;
}

const SERVICE_COLORS: Record<string, string> = {
  checkout: '#3b82f6',
  inventory: '#10b981',
  payment: '#f59e0b',
  shipping: '#8b5cf6',
  notification: '#ec4899',
};

const getServiceColor = (service: string) => SERVICE_COLORS[service] || '#94a3b8';

export const TraceDetail: React.FC<TraceDetailProps> = ({ traceId, spans, onClose }) => {
  const root = spans.find(s => !s.parent_span_id);
  const startTime = root?.start_time || 0;
  const totalDuration = root ? (root.end_time - root.start_time) : 1;

  const renderSpan = (span: Span, depth: number = 0) => {
    const children = spans.filter(s => s.parent_span_id === span.span_id);
    const left = ((span.start_time - startTime) / totalDuration) * 100;
    const width = Math.max(((span.end_time - span.start_time) / totalDuration) * 100, 0.5);
    const color = getServiceColor(span.service);

    return (
      <div key={span.span_id} className="mb-2">
        <div className="flex items-center group">
          <div className="flex-1 flex items-center min-w-0">
            <div style={{ marginLeft: depth * 20 }} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
              <div className="truncate">
                <span className="text-xs font-bold text-gray-200 mr-2">{span.service}</span>
                <span className="text-[10px] text-gray-500">{span.operation}</span>
              </div>
              {span.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
            </div>
          </div>
          <div className="w-64 h-6 relative bg-gray-900/50 rounded overflow-hidden">
            <div
              className="absolute h-full rounded-sm transition-all duration-500"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: span.status === 'error' ? '#ef4444' : color,
                opacity: 0.8,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[8px] text-gray-400">
                {((span.end_time - span.start_time) / 1e6).toFixed(2)}ms
              </span>
            </div>
          </div>
        </div>
        {children.map(child => renderSpan(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Trace Details</span>
          <span className="text-xs text-gray-400 font-mono">{traceId}</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {root ? renderSpan(root) : <div className="text-gray-500 text-center py-10">Root span not found</div>}
      </div>
    </div>
  );
};
