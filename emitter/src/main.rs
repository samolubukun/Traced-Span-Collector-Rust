mod models;
mod generator;
mod verifier;

use clap::Parser;
use generator::Generator;
use models::IngestRequest;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use verifier::Verifier;

#[derive(Parser, Debug)]
#[command(author, version, about = "Rust span emitter and verifier")]
struct Args {
    #[arg(long, env = "TARGET_URL", default_value = "http://localhost:8080")]
    target: String,

    #[arg(long, env = "WORKERS", default_value_t = 20)]
    workers: usize,

    #[arg(long, env = "DURATION", default_value = "60s")]
    duration: String,

    #[arg(long, env = "WINDOW_MINUTES", default_value_t = 30)]
    window: i64,

    #[arg(long, env = "OUT_OF_ORDER_PROB", default_value_t = 0.3)]
    disorder: f64,

    #[arg(long, env = "BATCH_SIZE", default_value_t = 10)]
    batch: usize,

    #[arg(long, env = "RATE_PER_WORKER", default_value_t = 5.0)]
    rate: f64,

    #[arg(long, env = "VERIFY", default_value_t = true)]
    verify: bool,

    #[arg(long)]
    json_output: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let args = Args::parse();
    let duration: Duration = duration_str::parse(&args.duration)
        .map_err(|e| anyhow::anyhow!("invalid duration '{}': {}", args.duration, e))?;

    tracing::info!(
        target = %args.target,
        workers = args.workers,
        duration = ?duration,
        batch = args.batch,
        rate = args.rate,
        "starting emitter"
    );

    let generator = Arc::new(Generator::new(args.disorder));
    let sent_traces: Arc<Mutex<HashMap<Uuid, usize>>> = Arc::new(Mutex::new(HashMap::new()));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;
    let target_url = Arc::new(args.target.clone());
    let token = CancellationToken::new();

    let mut handles = Vec::new();

    for _ in 0..args.workers {
        let generator = generator.clone();
        let sent_traces = sent_traces.clone();
        let client = client.clone();
        let target_url = target_url.clone();
        let batch_size = args.batch;
        let rate = args.rate;
        let token = token.clone();

        handles.push(tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs_f64(1.0 / rate));

            loop {
                tokio::select! {
                    _ = token.cancelled() => break,
                    _ = interval.tick() => {
                        let mut spans = Vec::new();
                        let mut trace_updates = Vec::new();

                        for _ in 0..batch_size {
                            let trace_spans = generator.generate_trace();
                            let trace_id = trace_spans[0].trace_id;
                            let count = trace_spans.len();
                            trace_updates.push((trace_id, count));
                            spans.extend(trace_spans);
                        }

                        let req = IngestRequest { spans };
                        match client
                            .post(&format!("{}/spans", target_url))
                            .json(&req)
                            .send()
                            .await
                        {
                            Ok(resp) if resp.status().is_success() => {
                                let mut sent = sent_traces.lock().await;
                                for (id, count) in trace_updates {
                                    *sent.entry(id).or_insert(0) += count;
                                }
                            }
                            Ok(resp) => tracing::warn!("ingest rejected: {}", resp.status()),
                            Err(e) => tracing::error!("request error: {}", e),
                        }
                    }
                }
            }
        }));
    }

    tracing::info!("workers running for {:?}...", duration);
    tokio::time::sleep(duration).await;

    tracing::info!("duration elapsed, stopping workers");
    token.cancel();

    for handle in handles {
        let _ = handle.await;
    }

    // Brief grace period for in-flight requests to land on server
    tokio::time::sleep(Duration::from_secs(2)).await;

    if args.verify {
        let final_sent = sent_traces.lock().await.clone();
        tracing::info!("verifying {} traces...", final_sent.len());
        let verifier = Verifier::new(args.target.clone(), final_sent);
        let result = verifier.run().await?;
        
        if let Some(path) = args.json_output {
            let json = serde_json::to_string_pretty(&result)?;
            std::fs::write(&path, json)?;
            tracing::info!("Test results written to {}", path);
        }

        if !result.success {
            anyhow::bail!("Verification failed");
        }
    }

    Ok(())
}
