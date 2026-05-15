import { useEffect, useRef, useState, useMemo } from 'react';
import type { TraceSummary } from '../types';

interface ScatterChartProps {
  traces: TraceSummary[];
  filter: 'all' | 'ok' | 'error';
  onSelect: (traceId: string) => void;
}

const PAD = { l: 60, r: 20, t: 20, b: 40 };
const R_MIN = 3;
const R_MAX = 8;

const SERVICE_COLORS: Record<string, string> = {
  checkout: '#3b82f6',
  inventory: '#10b981',
  payment: '#f59e0b',
  shipping: '#8b5cf6',
  notification: '#ec4899',
};

const getServiceColor = (service: string) => SERVICE_COLORS[service] || '#94a3b8';

export const ScatterChart: React.FC<ScatterChartProps> = ({ traces, filter, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewRange, setViewRange] = useState<{ minT: number; maxT: number } | null>(null);
  const [hoveredTrace, setHoveredTrace] = useState<TraceSummary | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const filteredTraces = useMemo(() => {
    if (filter === 'all') return traces;
    return traces.filter(t => (filter === 'ok' ? t.status === 'ok' : t.status === 'error'));
  }, [traces, filter]);

  const dataRange = useMemo(() => {
    if (filteredTraces.length === 0) return null;
    let minT = Infinity;
    let maxT = -Infinity;
    let maxD = 0;
    let maxS = 0;

    filteredTraces.forEach(t => {
      if (t.start_time < minT) minT = t.start_time;
      if (t.start_time > maxT) maxT = t.start_time;
      if (t.duration_ms > maxD) maxD = t.duration_ms;
      if (t.span_count > maxS) maxS = t.span_count;
    });

    const span = Math.max(maxT - minT, 2e9); // Min 2s
    const pad = span * 0.05;

    return {
      minT: minT - pad,
      maxT: maxT + pad,
      maxD: Math.max(maxD, 100),
      maxS: Math.max(maxS, 1),
    };
  }, [filteredTraces]);

  const currentRange = viewRange || (dataRange ? { minT: dataRange.minT, maxT: dataRange.maxT } : null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentRange || !dataRange) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, w, h);

      const cW = w - PAD.l - PAD.r;
      const cH = h - PAD.t - PAD.b;

      const xOf = (t: number) => PAD.l + ((t - currentRange.minT) / (currentRange.maxT - currentRange.minT)) * cW;
      const yOf = (ms: number) => h - PAD.b - (ms / dataRange.maxD) * cH;
      const rOf = (s: number) => R_MIN + Math.sqrt(s / dataRange.maxS) * (R_MAX - R_MIN);

      // Draw grid
      ctx.strokeStyle = 'rgba(75, 85, 99, 0.2)';
      ctx.lineWidth = 1;
      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'right';

      [0, 0.25, 0.5, 0.75, 1].forEach(f => {
        const y = h - PAD.b - f * cH;
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(w - PAD.r, y);
        ctx.stroke();
        ctx.fillText(`${Math.round(dataRange.maxD * f)}ms`, PAD.l - 10, y + 4);
      });

      // Draw dots
      filteredTraces.forEach(t => {
        const x = xOf(t.start_time);
        if (x < PAD.l || x > w - PAD.r) return;
        const y = yOf(t.duration_ms);
        const r = rOf(t.span_count);
        const color = t.status === 'error' ? '#ef4444' : getServiceColor(t.root_service);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color + '80';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (t === hoveredTrace) {
          ctx.beginPath();
          ctx.arc(x, y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Draw time labels
      ctx.textAlign = 'left';
      const fmtTime = (ns: number) => {
        const d = new Date(ns / 1e6);
        return d.toLocaleTimeString();
      };
      ctx.fillText(fmtTime(currentRange.minT), PAD.l, h - 10);
      ctx.textAlign = 'right';
      ctx.fillText(fmtTime(currentRange.maxT), w - PAD.r, h - 10);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [filteredTraces, currentRange, dataRange, hoveredTrace]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !currentRange || !dataRange) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const cW = canvas.clientWidth - PAD.l - PAD.r;
    const cH = canvas.clientHeight - PAD.t - PAD.b;
    const xOf = (t: number) => PAD.l + ((t - currentRange.minT) / (currentRange.maxT - currentRange.minT)) * cW;
    const yOf = (ms: number) => canvas.clientHeight - PAD.b - (ms / dataRange.maxD) * cH;
    const rOf = (s: number) => R_MIN + Math.sqrt(s / dataRange.maxS) * (R_MAX - R_MIN);

    let found: TraceSummary | null = null;
    for (const t of filteredTraces) {
      const dx = mx - xOf(t.start_time);
      const dy = my - yOf(t.duration_ms);
      const r = rOf(t.span_count);
      if (dx * dx + dy * dy <= (r + 4) * (r + 4)) {
        found = t;
        break;
      }
    }

    setHoveredTrace(found);
    if (found) {
      setTooltipPos({ x: e.clientX - rect.left + 15, y: e.clientY - rect.top + 15 });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!currentRange) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const cL = PAD.l;
    const cW = canvas.clientWidth - PAD.l - PAD.r;
    
    const fx = Math.max(0, Math.min(1, (mx - cL) / cW));
    const pivot = currentRange.minT + fx * (currentRange.maxT - currentRange.minT);
    const factor = e.deltaY > 0 ? 1.1 : 0.9;

    setViewRange({
      minT: pivot - (pivot - currentRange.minT) * factor,
      maxT: pivot + (currentRange.maxT - pivot) * factor,
    });
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0 bg-gray-900/20 rounded-xl border border-gray-800/50 overflow-hidden mt-4">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredTrace(null)}
        onWheel={handleWheel}
        onClick={() => hoveredTrace && onSelect(hoveredTrace.trace_id)}
      />
      {hoveredTrace && (
        <div
          className="absolute bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-lg p-3 shadow-2xl pointer-events-none z-50 transition-all duration-75"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredTrace.status === 'error' ? '#ef4444' : getServiceColor(hoveredTrace.root_service) }} />
            <span className="font-bold text-gray-100">{hoveredTrace.root_service}</span>
          </div>
          <div className="text-xs text-gray-400 mb-2">{hoveredTrace.root_operation}</div>
          <div className="flex gap-4 text-[10px] uppercase tracking-wider text-gray-500">
            <span>{hoveredTrace.duration_ms}ms</span>
            <span>{hoveredTrace.span_count} spans</span>
          </div>
        </div>
      )}
      {viewRange && (
        <button
          onClick={() => setViewRange(null)}
          className="absolute top-4 right-4 bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] px-2 py-1 rounded border border-gray-700 transition-colors"
        >
          Reset Zoom
        </button>
      )}
    </div>
  );
};
