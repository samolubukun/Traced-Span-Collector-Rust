use crate::models::Span;
use rand::seq::SliceRandom;
use rand::Rng;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const SERVICES: &[&str] = &["checkout", "inventory", "payment", "shipping", "notification"];
const OPERATIONS: &[&str] = &["process", "validate", "save", "notify", "call_external"];

pub struct Generator {
    disorder_prob: f64,
}

impl Generator {
    pub fn new(disorder_prob: f64) -> Self {
        Self { disorder_prob }
    }

    pub fn generate_trace(&self) -> Vec<Span> {
        let mut rng = rand::thread_rng();
        let trace_id = Uuid::new_v4();
        let num_spans = rng.gen_range(1..=5);
        let mut spans = Vec::with_capacity(num_spans);

        let now_ns = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as i64;

        // Root span
        let root_id = Uuid::new_v4();
        let root_start = now_ns;
        let root_duration = rng.gen_range(50..500) * 1_000_000;
        let root_end = root_start + root_duration;

        spans.push(Span {
            trace_id,
            span_id: root_id,
            parent_span_id: None,
            service: (*SERVICES.choose(&mut rng).unwrap()).to_string(),
            operation: (*OPERATIONS.choose(&mut rng).unwrap()).to_string(),
            start_time: root_start,
            end_time: root_end,
            status: if rng.gen_bool(0.05) { "error".to_string() } else { "ok".to_string() },
            tags: HashMap::new(),
        });

        // Child spans
        for _ in 0..num_spans - 1 {
            let child_id = Uuid::new_v4();
            let max_child_dur = root_duration.min(100 * 1_000_000);
            let child_duration = rng.gen_range(10 * 1_000_000..=max_child_dur);
            
            // Ensure root_end - child_duration > root_start
            let latest_start = root_end - child_duration;
            let child_start = if latest_start > root_start {
                rng.gen_range(root_start..latest_start)
            } else {
                root_start
            };
            let child_end = child_start + child_duration;

            spans.push(Span {
                trace_id,
                span_id: child_id,
                parent_span_id: Some(root_id),
                service: (*SERVICES.choose(&mut rng).unwrap()).to_string(),
                operation: (*OPERATIONS.choose(&mut rng).unwrap()).to_string(),
                start_time: child_start,
                end_time: child_end,
                status: if rng.gen_bool(0.05) { "error".to_string() } else { "ok".to_string() },
                tags: HashMap::new(),
            });
        }

        // Apply disorder
        if rng.gen_bool(self.disorder_prob) {
            spans.shuffle(&mut rng);
        }

        spans
    }
}
