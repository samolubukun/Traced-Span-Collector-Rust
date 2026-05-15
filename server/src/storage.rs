use crate::models::{Span, TraceSummary};
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::interval;

pub struct Storage {
    // trace_id -> list of spans
    traces: DashMap<Uuid, Vec<Span>>,
    window_minutes: i64,
}

impl Storage {
    pub fn new(window_minutes: i64) -> Arc<Self> {
        let storage = Arc::new(Self {
            traces: DashMap::new(),
            window_minutes,
        });

        let storage_clone = storage.clone();
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(10)); // Evict every 10s
            loop {
                interval.tick().await;
                storage_clone.evict_stale_data();
            }
        });

        storage
    }

    fn get_now_ns(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards")
            .as_nanos() as i64
    }

    pub fn ingest_spans(&self, spans: Vec<Span>) {
        let now_ns = self.get_now_ns();
        let window_ns = self.window_minutes * 60 * 1_000_000_000;
        let cutoff = now_ns - window_ns;

        for span in spans {
            if span.start_time < cutoff {
                continue; // Silently discard
            }

            self.traces
                .entry(span.trace_id)
                .or_insert_with(Vec::new)
                .push(span);
        }
    }

    pub fn get_traces(
        &self,
        limit: usize,
        after: Option<i64>,
        before: Option<i64>,
    ) -> (usize, Vec<TraceSummary>) {
        let mut summaries = Vec::new();

        for entry in self.traces.iter() {
            let spans = entry.value();
            if spans.is_empty() {
                continue;
            }

            // Use the root span if present, otherwise the earliest span
            let anchor = spans
                .iter()
                .find(|s| s.parent_span_id.is_none())
                .or_else(|| spans.iter().min_by_key(|s| s.start_time));

            let anchor = match anchor {
                Some(a) => a,
                None => continue,
            };

            // Apply time filters on the anchor span
            if let Some(after_val) = after {
                if anchor.start_time <= after_val {
                    continue;
                }
            }
            if let Some(before_val) = before {
                if anchor.start_time >= before_val {
                    continue;
                }
            }

            let has_error = spans.iter().any(|s| s.status == "error");

            summaries.push(TraceSummary {
                trace_id: *entry.key(),
                root_service: anchor.service.clone(),
                root_operation: anchor.operation.clone(),
                span_count: spans.len(),
                duration_ms: (anchor.end_time - anchor.start_time) / 1_000_000,
                start_time: anchor.start_time,
                status: if has_error { "error".to_string() } else { "ok".to_string() },
            });
        }

        // Sort by start_time descending (newest first)
        summaries.sort_by(|a, b| b.start_time.cmp(&a.start_time));

        // Total is all matching traces (before limit applied)
        let total = summaries.len();
        let traces = summaries.into_iter().take(limit).collect();

        (total, traces)
    }

    pub fn get_trace_details(&self, trace_id: Uuid) -> Option<Vec<Span>> {
        self.traces.get(&trace_id).map(|entry| {
            let mut spans = entry.value().clone();
            spans.sort_by_key(|s| s.start_time);
            spans
        })
    }

    fn evict_stale_data(&self) {
        let now_ns = self.get_now_ns();
        let window_ns = self.window_minutes * 60 * 1_000_000_000;
        let cutoff = now_ns - window_ns;

        // Keep traces where at least one span is within the window
        // Or specifically the root span? The README says "Spans outside the rolling window are discarded"
        // and "Data that ages out must be evicted".
        // Let's evict traces whose root is too old, or if no root, whose spans are all too old.
        self.traces.retain(|_, spans| {
            if let Some(root) = spans.iter().find(|s| s.parent_span_id.is_none()) {
                root.start_time >= cutoff
            } else {
                // If no root yet, keep if any span is within window
                spans.iter().any(|s| s.start_time >= cutoff)
            }
        });
    }
}
