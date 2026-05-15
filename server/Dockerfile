FROM rust:1.81-slim-bookworm as builder

WORKDIR /usr/src/app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/app/target/release/server /usr/local/bin/server
EXPOSE 8080
CMD ["server"]
