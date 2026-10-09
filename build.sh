#!/usr/bin/env bash
set -euo pipefail

# local-sso cross-platform build
#
#   ./build.sh                 # frontend + host binary ./local-sso + every target -> bin/
#   ./build.sh local           # frontend + host binary only (what ./run.sh & docs use)
#   ./build.sh linux           # linux/amd64 + linux/arm64
#   ./build.sh linux/amd64     # one target
#   ./build.sh all             # every target (same as default)
#   ./build.sh --no-frontend local   # reuse an existing web/dist
#
# Targets: linux/{amd64,arm64,arm,386,riscv64} darwin/{amd64,arm64} windows/{amd64,arm64} freebsd/amd64
# Every binary is CGO_ENABLED=0 + stripped -> static, no libc needed (glibc or musl).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ALL_TARGETS=(linux/amd64 linux/arm64 linux/arm linux/386 linux/riscv64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64 freebsd/amd64)

BUILD_FRONTEND=1
MODE="all"
for arg in "$@"; do
  case "$arg" in
    --no-frontend) BUILD_FRONTEND=0 ;;
    --help|-h) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    local|all) MODE="$arg" ;;
    */*) MODE="$arg" ;;
    linux|darwin|windows|freebsd) MODE="$arg" ;;
    *) echo "unknown target: $arg (try --help)" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------- frontend
if [ "$BUILD_FRONTEND" = 1 ]; then
  echo "==> 1/3 frontend (TypeScript + Tailwind)"
  if [ ! -d web/node_modules ]; then
    echo "    npm install (web/node_modules missing)"
    (cd web && npm install)
  fi
  (cd web && npm run build)
fi

if [ ! -f web/dist/index.html ]; then
  echo "error: web/dist/index.html missing — run './build.sh' (frontend) first" >&2
  exit 1
fi

command -v go >/dev/null 2>&1 || { echo "error: go toolchain not found in PATH" >&2; exit 1; }

LDFLAGS="-s -w"
HOST_OS="$(go env GOOS)"
HOST_ARCH="$(go env GOARCH)"

build_one() {
  local os="$1" arch="$2" out="$3"
  echo "    ${os}/${arch} -> ${out}"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" GOARM=7 GO386=softfloat \
    go build -trimpath -ldflags "$LDFLAGS" -o "$out" .
  if [ "$os" != "windows" ]; then chmod +x "$out"; fi
}

# ---------------------------------------------------------------- go build
echo "==> 2/3 go build (CGO_ENABLED=0, static, embedded web/dist)"

case "$MODE" in
  local)
    build_one "$HOST_OS" "$HOST_ARCH" "local-sso"
    ;;

  all)
    build_one "$HOST_OS" "$HOST_ARCH" "local-sso"
    mkdir -p bin
    for t in "${ALL_TARGETS[@]}"; do
      os="${t%/*}"; arch="${t#*/}"
      name="local-sso-${os}-${arch}"
      [ "$os" = "windows" ] && name="${name}.exe"
      build_one "$os" "$arch" "bin/${name}"
    done
    ;;

  linux|darwin|windows|freebsd)
    mkdir -p bin
    for t in "${ALL_TARGETS[@]}"; do
      [ "${t%/*}" = "$MODE" ] || continue
      arch="${t#*/}"
      name="local-sso-${MODE}-${arch}"
      [ "$MODE" = "windows" ] && name="${name}.exe"
      build_one "$MODE" "$arch" "bin/${name}"
    done
    ;;

  *)
    os="${MODE%/*}"; arch="${MODE#*/}"
    mkdir -p bin
    name="local-sso-${os}-${arch}"
    [ "$os" = "windows" ] && name="${name}.exe"
    build_one "$os" "$arch" "bin/${name}"
    ;;
esac

# ---------------------------------------------------------------- report
echo "==> 3/3 artifacts"
if [ "$MODE" = "local" ]; then
  file local-sso 2>/dev/null || true
  ls -lh local-sso
else
  (file local-sso bin/* 2>/dev/null || true)
  echo
  ls -lh local-sso bin/* 2>/dev/null || true
  echo
  (cd bin && shasum -a 256 * 2>/dev/null || sha256sum * 2>/dev/null || true)
  echo
  echo "Copy to Linux:   scp bin/local-sso-linux-amd64 host:/usr/local/bin/local-sso && ssh host chmod +x /usr/local/bin/local-sso"
fi

echo
echo "Done."
