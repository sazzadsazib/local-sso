# ==============================================================================
# Multi-stage Dockerfile for local-sso (Mock Microsoft Entra ID & SSO Playground)
# Works out-of-the-box on Render, Railway, Fly.io, or any Docker container host.
# ==============================================================================

# Stage 1: Build Frontend (Vite + TypeScript)
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web

COPY web/package*.json ./
RUN npm install

COPY web/ ./
RUN npm run build

# Stage 2: Build Go Static Binary with embedded web/dist
FROM golang:1.24-alpine AS backend-builder
WORKDIR /app

COPY go.mod ./
COPY internal/ ./internal/
COPY main.go ./
COPY --from=frontend-builder /app/web/dist ./web/dist

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/local-sso .

# Stage 3: Minimal Alpine Runtime (~15MB total image size)
FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

COPY --from=backend-builder /app/local-sso /usr/local/bin/local-sso

# Default Render port is 10000 (Render automatically sets $PORT env var)
ENV PORT=10000
ENV HOST=0.0.0.0

EXPOSE 10000

ENTRYPOINT ["local-sso"]
CMD ["-no-browser"]
