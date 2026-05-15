FROM rust:1.81-slim-bookworm as builder

WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/app/target/release/emitter /usr/local/bin/emitter
CMD ["emitter"]
