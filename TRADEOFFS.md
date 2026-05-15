# Trade-offs and Design Decisions

## Storage Design

I chose an in-memory storage using `DashMap` (a concurrent hash map for Rust) to store spans. Spans are grouped by `trace_id`.

**Why:**
- **Performance**: In-memory storage provides extremely low latency for both ingestion and querying, which is critical for a high-throughput span collector.
- **Simplicity**: For the scope of this task, a full database (like ClickHouse or Cassandra) would add significant complexity. `DashMap` allows for safe concurrent access without the overhead of a global `Mutex`.

**Trade-offs:**
- **Volatiltiy**: Data is lost if the server restarts. In a production system, this would be backed by persistent storage or a WAL (Write Ahead Log).
- **Memory Usage**: As the number of traces grows, memory consumption increases. The rolling window eviction is essential to keep this in check.

## Eviction

Rolling window eviction is implemented in two layers:
1.  **Ingest-time discard**: Any span arriving with a `start_time` older than the window is immediately discarded.
2.  **Background eviction**: A background task runs every 10 seconds. It iterates through all traces and removes those whose root span's `start_time` has aged out. If a trace doesn't have a root span yet (due to out-of-order arrival), it is kept as long as at least one of its spans is still within the window.

**Why:**
- Background eviction ensures that memory is freed even if no new requests are coming in, satisfying the requirement to evict data without waiting for the next request.

## Concurrency

Concurrency is handled using Rust's async runtime (`Tokio`) and `DashMap`.

**Trade-offs:**
- `DashMap` uses fine-grained locking, which performs better than a single `Mutex` under high contention (many workers POSTing spans).
- However, listing all traces for the dashboard requires iterating over the entire map. While this is fast for thousands of traces, it could become a bottleneck if the window is very large or the ingestion rate is extremely high.

## What Breaks First

Under 10x default load:
1.  **Iteration overhead**: The `GET /traces` endpoint iterates through the map to filter and sort. At 10x load, this iteration could take longer than the polling interval, causing dashboard lag or high CPU usage.
2.  **Memory pressure**: If the ingestion rate exceeds the eviction rate, the server could run out of memory.
3.  **Network bandwidth**: The JSON overhead of large batches and many traces could saturate the network interface.

## What I'd Do Differently

With more time, I would:
1.  **Time-indexed storage**: Instead of a flat map, I'd use a time-bucketed index to make "recent traces" queries significantly faster without full map iteration.
2.  **Protobufs**: Use Protocol Buffers instead of JSON for the ingest path to reduce serialization overhead and bandwidth.
3.  **Persistent Storage**: Implement a persistent backend (like Sled or an external DB) for durability.
4.  **Streaming Eviction**: Use a priority queue or a similar structure to evict traces exactly when they age out, rather than in 10-second batches.
