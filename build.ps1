# Build script for Windows PowerShell
Write-Host "1. Building frontend (TypeScript + Tailwind CSS)..." -ForegroundColor Cyan
Set-Location web
npm install
npm run build
Set-Location ..

Write-Host "2. Building single standalone Go binary with embedded web..." -ForegroundColor Cyan
wsl -e bash -c "cd /mnt/d/wsl/code/sso-local && go build -o sso-local ."

Write-Host "Done! Standalone binary: ./sso-local" -ForegroundColor Green
