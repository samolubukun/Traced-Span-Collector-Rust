use crate::models::TraceListResponse;
use anyhow::{anyhow, Result};
use serde::Serialize;
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Serialize, Debug)]
pub struct VerificationResult {
    pub expected_traces: usize,
    pub found_on_server: usize,
    pub missing_traces: usize,
    pub span_mismatches: usize,
    pub success: bool,
}

pub struct Verifier {
    target_url: String,
    expected_traces: HashMap<Uuid, usize>,
}

impl Verifier {
    pub fn new(target_url: String, expected_traces: HashMap<Uuid, usize>) -> Self {
        Self {
            target_url,
            expected_traces,
        }
    }

    pub async fn run(&self) -> Result<VerificationResult> {
        tracing::info!(expected = self.expected_traces.len(), "starting verification");

        let client = reqwest::Client::new();
        let mut found_traces: HashMap<Uuid, usize> = HashMap::new();
        let mut before: Option<i64> = None;
        let mut prev_count = 0usize;

        // Paginate through ALL traces using 'before' cursor (server returns DESC order)
        loop {
            let url = match before {
                Some(b) => format!("{}/traces?limit=1000&before={}", self.target_url, b),
                None => format!("{}/traces?limit=1000", self.target_url),
            };

            let resp: TraceListResponse = client
                .get(&url)
                .send()
                .await?
                .json()
                .await?;

            if resp.traces.is_empty() {
                break;
            }

            // Find the oldest start_time for the next page cursor BEFORE inserting
            let oldest = resp.traces.iter().map(|t| t.start_time).min();

            for t in resp.traces {
                found_traces.insert(t.trace_id, t.span_count);
            }

            // Stop if we didn't grow (avoids infinite loops on same-timestamp pages)
            if found_traces.len() == prev_count {
                break;
            }
            prev_count = found_traces.len();

            // Move cursor to before the oldest trace we've seen
            match oldest {
                Some(ts) => before = Some(ts),
                None => break,
            }
        }

        tracing::info!(
            total_on_server = found_traces.len(),
            expected_this_run = self.expected_traces.len(),
            "fetched all traces from server"
        );

        let mut missing = 0usize;
        let mut mismatches = 0usize;

        for (id, expected_count) in &self.expected_traces {
            match found_traces.get(id) {
                Some(found_count) => {
                    if found_count != expected_count {
                        mismatches += 1;
                        tracing::warn!(
                            trace_id = %id,
                            expected = expected_count,
                            found = found_count,
                            "span count mismatch"
                        );
                    }
                }
                None => {
                    missing += 1;
                    if missing <= 10 {
                        tracing::warn!(trace_id = %id, "trace missing from server");
                    }
                }
            }
        }

        let result = VerificationResult {
            expected_traces: self.expected_traces.len(),
            found_on_server: found_traces.len(),
            missing_traces: missing,
            span_mismatches: mismatches,
            success: missing == 0 && mismatches == 0,
        };

        tracing::info!(
            expected = result.expected_traces,
            found = result.found_on_server,
            missing = result.missing_traces,
            span_mismatches = result.span_mismatches,
            "verification complete"
        );

        if result.success {
            tracing::info!("✅ all checks passed");
            Ok(result)
        } else {
            tracing::error!("❌ verification failed");
            Ok(result) // We return Ok(result) but with success=false so main can write it
        }
    }
}
