use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use crate::models::{IngestRequest, StatusResponse, TraceListResponse, TraceDetailResponse, ErrorResponse};
use crate::storage::Storage;
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct TracesQuery {
    pub limit: Option<usize>,
    pub after: Option<i64>,
    pub before: Option<i64>,
}

pub async fn health_check() -> impl IntoResponse {
    Json(StatusResponse {
        status: "ok".to_string(),
    })
}

pub async fn ingest_spans(
    State(storage): State<Arc<Storage>>,
    Json(payload): Json<IngestRequest>,
) -> impl IntoResponse {
    let span_count = payload.spans.len();
    storage.ingest_spans(payload.spans);
    tracing::debug!("ingested {} spans", span_count);
    (StatusCode::ACCEPTED, Json(StatusResponse {
        status: "ok".to_string(),
    }))
}

pub async fn list_traces(
    State(storage): State<Arc<Storage>>,
    Query(params): Query<TracesQuery>,
) -> impl IntoResponse {
    let limit = params.limit.unwrap_or(20).min(1000);
    
    // Basic validation of after/before
    if let (Some(after), Some(before)) = (params.after, params.before) {
        if after >= before {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::to_value(ErrorResponse {
                    error: "after must be less than before".to_string(),
                }).unwrap()),
            ).into_response();
        }
    }

    let (total, traces) = storage.get_traces(limit, params.after, params.before);
    Json(TraceListResponse { total, traces }).into_response()
}

pub async fn get_trace(
    State(storage): State<Arc<Storage>>,
    Path(trace_id): Path<Uuid>,
) -> impl IntoResponse {
    match storage.get_trace_details(trace_id) {
        Some(spans) => Json(serde_json::to_value(TraceDetailResponse { trace_id, spans }).unwrap()).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::to_value(ErrorResponse {
                error: format!("Trace {} not found", trace_id),
            }).unwrap()),
        ).into_response(),
    }
}
