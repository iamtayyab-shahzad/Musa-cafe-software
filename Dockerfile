# Used when Render Root Directory is the repo root.
# Prefer setting Root Directory to "backend" instead when possible.
FROM golang:1.24-bookworm AS build
WORKDIR /src
ENV GOTOOLCHAIN=auto
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/server /app/server
COPY backend/docs /app/docs
ENV APP_PORT=8080
ENV GIN_MODE=release
ENV GOMEMLIMIT=400MiB
EXPOSE 8080
CMD ["/app/server"]
