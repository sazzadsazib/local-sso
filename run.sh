#!/usr/bin/env bash
# Development runner: UI + API + OIDC on ONE public port.
#
#   ./run.sh                       # everything on http://127.0.0.1:8080
#   PORT=3000 ./run.sh             # same single port on 3000
#   GO_PORT=9091 ./run.sh          # move the internal (proxied) Go port
#
#   Configuration: copy .env.example -> .env and edit (loaded automatically).
#   Shell env wins over .env.
#
# Vite is the front door: it serves the UI with HMR and proxies every API/OIDC
# route to the Go IdP, so the browser only ever talks to one origin.
# Ctrl+C stops both processes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Capture shell overrides, then load .env (shell env wins over the file).
_ENV_PORT="${PORT-}"; _ENV_GO_PORT="${GO_PORT-}"; _ENV_BACKEND="${SSO_BACKEND-}"; _ENV_TENANT="${TENANT-}"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  echo "==> loaded .env"
fi
[ -n "${_ENV_PORT}" ] && PORT="${_ENV_PORT}"
[ -n "${_ENV_GO_PORT}" ] && GO_PORT="${_ENV_GO_PORT}"
[ -n "${_ENV_BACKEND}" ] && SSO_BACKEND="${_ENV_BACKEND}"
[ -n "${_ENV_TENANT}" ] && TENANT="${_ENV_TENANT}"

PORT="${PORT:-8080}"     # public port (UI + API + OIDC, what you open)
TENANT="${TENANT:-common}"  # default tenant alias/GUID passed to -tenant

# true (exit 0) when nothing is listening on 127.0.0.1:$1
port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if [ -n "${GO_PORT:-}" ]; then
  if ! port_free "$GO_PORT"; then
    echo "error: GO_PORT ${GO_PORT} is already in use (unset it to auto-pick a free port)" >&2
    exit 1
  fi
else
  GO_PORT=""
  for p in $(seq 8081 8100); do
    if port_free "$p"; then GO_PORT="$p"; break; fi
  done
  if [ -z "$GO_PORT" ]; then
    echo "error: no free port in 8081-8100 for the internal Go server (set GO_PORT=)" >&2
    exit 1
  fi
fi

if ! port_free "$PORT"; then
  echo "error: public port ${PORT} is already in use (stop the other process or set PORT=)" >&2
  exit 1
fi

PUBLIC="127.0.0.1:${PORT}"
GO_ADDR="127.0.0.1:${GO_PORT}"
BACKEND="${SSO_BACKEND:-http://${GO_ADDR}}"   # Vite proxy target

command -v go >/dev/null 2>&1 || { echo "error: go toolchain not found in PATH" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "error: npm not found in PATH" >&2; exit 1; }
if [ ! -d web/node_modules ]; then
  echo "==> npm install (web/node_modules missing)"
  (cd web && npm install)
fi

GO_PID=""
VITE_PID=""

stop() {
  local pid alive
  for pid in "$VITE_PID" "$GO_PID"; do
    [ -n "$pid" ] || continue
    pkill -TERM -P "$pid" 2>/dev/null || true   # npm -> vite, go run -> binary
    kill -TERM "$pid" 2>/dev/null || true
  done
  for _ in 1 2 3 4 5 6; do
    alive=0
    for pid in "$VITE_PID" "$GO_PID"; do
      [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && alive=1
    done
    [ "$alive" = 0 ] && break
    sleep 0.4
  done
  for pid in "$VITE_PID" "$GO_PID"; do
    [ -n "$pid" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      pkill -KILL -P "$pid" 2>/dev/null || true
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
}
trap 'stop; exit 0' INT TERM
trap 'stop' EXIT

echo "==> go build -> .dev/sso-local-dev"
mkdir -p .dev
go build -o .dev/sso-local-dev .

echo "==> Go IdP (internal) http://${GO_ADDR}  tenant=${TENANT}"
./.dev/sso-local-dev -port "$GO_PORT" -tenant "$TENANT" -no-browser &
GO_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://${GO_ADDR}/api/version" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$GO_PID" 2>/dev/null; then echo "error: Go server exited early" >&2; exit 1; fi
  sleep 0.5
done

echo "==> Vite (public, single port) http://${PUBLIC}  -> proxies /api + /{tenant}/* to ${BACKEND#http://}"
SSO_BACKEND="$BACKEND" npm run dev --prefix web -- --port "$PORT" --strictPort --host 127.0.0.1 &
VITE_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://${PUBLIC}/api/version" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "error: Vite failed to start on port ${PORT} (port already in use?)" >&2
    exit 1
  fi
  sleep 0.5
done

cat <<EOF

  ---------------------------------------------------------------
   dev mode — ONE port for everything
   open:       http://${PUBLIC}/#config
     UI (HMR): http://${PUBLIC}/            -> Vite
     API:      http://${PUBLIC}/api/*       -> proxied to ${GO_ADDR}
     OIDC:     http://${PUBLIC}/{tenant}/oauth2/* , /{tenant}/v2.0/* , /{tenant}/discovery/*
   internal:   Go IdP on ${GO_ADDR} (browser never talks to it directly)
   press Ctrl+C to stop both
  ---------------------------------------------------------------
EOF

while :; do
  kill -0 "$GO_PID" 2>/dev/null || { echo "Go server stopped" >&2; break; }
  kill -0 "$VITE_PID" 2>/dev/null || { echo "Vite dev server stopped" >&2; break; }
  sleep 1
done
