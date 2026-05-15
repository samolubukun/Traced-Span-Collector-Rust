import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Activity, Globe, Wifi, WifiOff, LayoutDashboard, AlertCircle, Clock, Zap } from 'lucide-react';
import type { TraceSummary, TraceListResponse, TraceDetailResponse, Span } from './types';
import { ScatterChart } from './components/ScatterChart';
import { TraceDetail } from './components/TraceDetail';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'traced-target-url';
const DEFAULT_URL = window.location.origin + '/api';

export default function App() {
  const [targetUrl, setTargetUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_URL);
  const [connected, setConnected] = useState(false);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'ok' | 'error'>('all');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedTraceSpans, setSelectedTraceSpans] = useState<Span[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const fetchTraces = useCallback(async () => {
    try {
      const response = await axios.get<TraceListResponse>(`${targetUrl}/traces`, { params: { limit: 1000 } });
      setTraces(response.data.traces);
      setTotal(response.data.total);
      setConnected(true);
    } catch (error) {
      console.error('Failed to fetch traces', error);
      setConnected(false);
    }
  }, [targetUrl]);

  useEffect(() => {
    let interval: number;
    if (connected) {
      interval = setInterval(fetchTraces, 3000);
    } else {
      fetchTraces(); // Try initial connect
    }
    return () => clearInterval(interval);
  }, [connected, fetchTraces]);

  const handleConnect = () => {
    localStorage.setItem(STORAGE_KEY, targetUrl);
    fetchTraces();
  };

  const handleSelectTrace = async (traceId: string) => {
    setSelectedTraceId(traceId);
    setIsLoadingDetails(true);
    try {
      const response = await axios.get<TraceDetailResponse>(`${targetUrl}/traces/${traceId}`);
      setSelectedTraceSpans(response.data.spans);
    } catch (error) {
      console.error('Failed to fetch trace details', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const stats = {
    errors: traces.filter(t => t.status === 'error').length,
    avgDuration: traces.length > 0 ? traces.reduce((acc, t) => acc + t.duration_ms, 0) / traces.length : 0,
    p95Duration: traces.length > 0 ? traces.map(t => t.duration_ms).sort((a, b) => a - b)[Math.floor(traces.length * 0.95)] : 0,
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-950 text-gray-100 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="flex flex-col h-full p-6 relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                TRACED <span className="text-blue-500 text-[10px] bg-blue-500/10 px-2 py-0.5 rounded-full">BETA</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Distributed Observability</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-gray-900/50 p-1.5 rounded-2xl border border-gray-800/50">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-950 rounded-xl border border-gray-800/50">
              <Globe className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="bg-transparent border-none outline-none text-xs text-gray-300 w-48 font-mono"
                placeholder="Target API URL"
              />
            </div>
            <button
              onClick={handleConnect}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                connected ? 'bg-green-500/10 text-green-500' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500'
              }`}
            >
              {connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {connected ? 'CONNECTED' : 'CONNECT'}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 flex gap-6 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Traces', value: total, icon: LayoutDashboard, color: 'text-blue-400' },
                { label: 'Error Rate', value: `${((stats.errors / (total || 1)) * 100).toFixed(1)}%`, icon: AlertCircle, color: 'text-red-400' },
                { label: 'Avg Latency', value: `${stats.avgDuration.toFixed(1)}ms`, icon: Clock, color: 'text-amber-400' },
                { label: 'P95 Latency', value: `${stats.p95Duration.toFixed(1)}ms`, icon: Zap, color: 'text-purple-400' },
              ].map((stat, i) => (
                <div key={i} className="glass-panel p-4 rounded-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg bg-gray-800/50 ${stat.color}`}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{stat.label}</span>
                  </div>
                  <div className="text-xl font-mono font-bold text-gray-100">{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 mb-4">
              {(['all', 'ok', 'error'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                    filter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'
                  } border border-transparent`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Chart */}
            <ScatterChart traces={traces} filter={filter} onSelect={handleSelectTrace} />
          </div>

          {/* Side Panel */}
          <AnimatePresence>
            {selectedTraceId && (
              <motion.div
                initial={{ x: 600, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 600, opacity: 0 }}
                className="w-[600px] flex flex-col min-h-0"
              >
                {isLoadingDetails ? (
                  <div className="flex-1 glass-panel rounded-xl flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : (
                  <TraceDetail
                    traceId={selectedTraceId}
                    spans={selectedTraceSpans}
                    onClose={() => setSelectedTraceId(null)}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
