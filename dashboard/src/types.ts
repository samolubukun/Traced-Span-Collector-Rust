export interface Span {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  service: string;
  operation: string;
  start_time: number;
  end_time: number;
  status: 'ok' | 'error';
  tags?: Record<string, string>;
}

export interface TraceSummary {
  trace_id: string;
  root_service: string;
  root_operation: string;
  span_count: number;
  duration_ms: number;
  start_time: number;
  status: 'ok' | 'error';
}

export interface TraceListResponse {
  total: number;
  traces: TraceSummary[];
}

export interface TraceDetailResponse {
  trace_id: string;
  spans: Span[];
}
