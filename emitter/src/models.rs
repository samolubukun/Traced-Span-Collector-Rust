use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Span {
    pub trace_id: Uuid,
    pub span_id: Uuid,
    pub parent_span_id: Option<Uuid>,
    pub service: String,
    pub operation: String,
    pub start_time: i64,
    pub end_time: i64,
    pub status: String,
    #[serde(default)]
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct IngestRequest {
    pub spans: Vec<Span>,
}

#[derive(Debug, Deserialize)]
pub struct TraceSummary {
    pub trace_id: Uuid,
    pub root_service: String,
    pub root_operation: String,
    pub span_count: usize,
    pub duration_ms: i64,
    pub start_time: i64,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct TraceListResponse {
    pub total: usize,
    pub traces: Vec<TraceSummary>,
}
