mod models;
mod storage;
mod handlers;

use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use crate::storage::Storage;

#[tokio::main]
async fn main() {
    // Load .env if it exists
    dotenvy::dotenv().ok();

    // Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let window_minutes = std::env::var("WINDOW_MINUTES")
        .unwrap_or_else(|_| "30".to_string())
        .parse::<i64>()
        .unwrap_or(30);

    let storage = Storage::new(window_minutes);

    let app = Router::new()
        .route("/health", get(handlers::health_check))
        .route("/spans", post(handlers::ingest_spans))
        .route("/traces", get(handlers::list_traces))
        .route("/traces/:trace_id", get(handlers::get_trace))
        .layer(CorsLayer::permissive())
        .with_state(storage);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
