Write-Host "1. Building frontend (TypeScript + Tailwind CSS)..." -ForegroundColor Cyan
Set-Location web
npm install
npm run build
Set-Location ..

Write-Host "2. Building static binaries with embedded web..." -ForegroundColor Cyan
$env:CGO_ENABLED = "0"
$targets = @("linux/amd64","linux/arm64","linux/arm","linux/386","linux/riscv64","darwin/amd64","darwin/arm64","windows/amd64","windows/arm64","freebsd/amd64")
New-Item -ItemType Directory -Force bin | Out-Null
foreach ($t in $targets) {
  $os, $arch = $t.Split("/")
  $env:GOOS = $os; $env:GOARCH = $arch; $env:GOARM = "7"; $env:GO386 = "softfloat"
  $name = "bin/sso-local-$os-$arch"
  if ($os -eq "windows") { $name += ".exe" }
  Write-Host "   $t -> $name"
  go build -trimpath -ldflags "-s -w" -o $name .
}
Remove-Item Env:GOOS, Env:GOARCH, Env:GOARM, Env:GO386

Write-Host "Done! Binaries in ./bin" -ForegroundColor Green
