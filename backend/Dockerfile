# Build
FROM golang:1.24-bookworm AS build
WORKDIR /src
ENV GOTOOLCHAIN=auto
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

# Run
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/server /app/server
COPY docs /app/docs
ENV APP_PORT=8080
ENV GIN_MODE=release
# Keep Go GC under typical Render free memory caps.
ENV GOMEMLIMIT=400MiB
EXPOSE 8080
CMD ["/app/server"]
