<#
.SYNOPSIS
    Cross-platform build script for local-sso on Windows PowerShell.

.DESCRIPTION
    Compiles the TypeScript + Tailwind frontend into web/dist and builds
    standalone, static Go binaries with embedded web assets for local and
    cross-compilation targets. Uses dynamically resolved script root paths
    and automatically falls back to WSL Go if native Windows Go is not in PATH.

.PARAMETER Target
    Build target: 'local' (host binary only), 'all' (default, host + all targets in bin/),
    'windows', 'linux', 'darwin', 'freebsd', or a specific target (e.g. 'windows/amd64').

.PARAMETER NoFrontend
    Skips building the frontend and reuses an existing web/dist.

.EXAMPLE
    .\build.ps1
    .\build.ps1 local
    .\build.ps1 -Target windows
    .\build.ps1 -NoFrontend local
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Target = "all",

    [switch]$NoFrontend
)

$ErrorActionPreference = "Stop"

# Dynamically resolve root directory relative to this script location
$RootDir = $PSScriptRoot
if (-not $RootDir) {
    $RootDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
}
if (-not $RootDir) {
    $RootDir = (Get-Item .).FullName
}

Push-Location $RootDir
try {
    $hasNativeGo = [bool](Get-Command "go" -ErrorAction SilentlyContinue)
    $hasWsl = [bool](Get-Command "wsl" -ErrorAction SilentlyContinue)

    # If native Windows Go is missing, check if WSL has Go and delegate
    if (-not $hasNativeGo) {
        $wslHasGo = $false
        if ($hasWsl) {
            $wslCheck = (& wsl bash -c "command -v go" 2>$null)
            if ($wslCheck) { $wslHasGo = $true }
        }

        if ($wslHasGo) {
            Write-Host "Notice: Native Windows Go not found in PATH. Delegating build to WSL Go..." -ForegroundColor Yellow
            $wslArgs = @("bash", "./build.sh")
            if ($NoFrontend) { $wslArgs += "--no-frontend" }
            $wslArgs += $Target
            & wsl $wslArgs
            if ($LASTEXITCODE -ne 0) {
                throw "WSL build failed with exit code $LASTEXITCODE"
            }
            return
        }
        else {
            Write-Error "Go toolchain ('go') was not found in PATH or WSL. Please install Go (1.22+) to build local-sso."
            exit 1
        }
    }

    $allTargets = @(
        "linux/amd64", "linux/arm64", "linux/arm", "linux/386", "linux/riscv64",
        "darwin/amd64", "darwin/arm64",
        "windows/amd64", "windows/arm64",
        "freebsd/amd64"
    )

    # ---------------------------------------------------------------- frontend
    if (-not $NoFrontend) {
        Write-Host "==> 1/3 Frontend (TypeScript + Tailwind CSS)" -ForegroundColor Cyan
        $webDir = Join-Path $RootDir "web"
        $nodeModules = Join-Path $webDir "node_modules"

        Push-Location $webDir
        try {
            if (-not (Test-Path $nodeModules)) {
                Write-Host "    npm install (web/node_modules missing)..." -ForegroundColor Gray
                npm install
            }
            npm run build
        }
        finally {
            Pop-Location
        }
    }

    $distIndex = Join-Path $RootDir "web\dist\index.html"
    if (-not (Test-Path $distIndex)) {
        Write-Error "web/dist/index.html is missing. Run without -NoFrontend first."
        exit 1
    }

    # ---------------------------------------------------------------- go build
    Write-Host "==> 2/3 Go Build (CGO_ENABLED=0, static, embedded web/dist)" -ForegroundColor Cyan

    $binDir = Join-Path $RootDir "bin"
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    }

    $ldflags = "-s -w"
    $hostOs = (& go env GOOS).Trim()
    $hostArch = (& go env GOARCH).Trim()

    function Invoke-GoBuild {
        param(
            [string]$Os,
            [string]$Arch,
            [string]$OutFile
        )
        Write-Host "    $Os/$Arch -> $OutFile" -ForegroundColor Gray
        $env:CGO_ENABLED = "0"
        $env:GOOS = $Os
        $env:GOARCH = $Arch
        $env:GOARM = "7"
        $env:GO386 = "softfloat"
        & go build -trimpath -ldflags $ldflags -o $OutFile .
        if ($LASTEXITCODE -ne 0) {
            throw "Go build failed for target $Os/$Arch"
        }
    }

    $hostBinary = "local-sso"
    if ($hostOs -eq "windows") { $hostBinary += ".exe" }
    $hostBinaryPath = Join-Path $RootDir $hostBinary

    switch ($Target.ToLowerInvariant()) {
        "local" {
            Invoke-GoBuild -Os $hostOs -Arch $hostArch -OutFile $hostBinaryPath
        }

        "all" {
            Invoke-GoBuild -Os $hostOs -Arch $hostArch -OutFile $hostBinaryPath
            foreach ($t in $allTargets) {
                $os, $arch = $t.Split("/")
                $name = "local-sso-$os-$arch"
                if ($os -eq "windows") { $name += ".exe" }
                $targetOut = Join-Path $binDir $name
                Invoke-GoBuild -Os $os -Arch $arch -OutFile $targetOut
            }
        }

        { $_ -in @("windows", "linux", "darwin", "freebsd") } {
            foreach ($t in $allTargets) {
                $os, $arch = $t.Split("/")
                if ($os -eq $Target) {
                    $name = "local-sso-$os-$arch"
                    if ($os -eq "windows") { $name += ".exe" }
                    $targetOut = Join-Path $binDir $name
                    Invoke-GoBuild -Os $os -Arch $arch -OutFile $targetOut
                }
            }
        }

        default {
            if ($Target.Contains("/")) {
                $os, $arch = $Target.Split("/")
                $name = "local-sso-$os-$arch"
                if ($os -eq "windows") { $name += ".exe" }
                $targetOut = Join-Path $binDir $name
                Invoke-GoBuild -Os $os -Arch $arch -OutFile $targetOut
            }
            else {
                Write-Error "Unknown target: $Target (valid: local, all, windows, linux, darwin, freebsd, or os/arch)"
                exit 1
            }
        }
    }

    # ---------------------------------------------------------------- report
    Write-Host "==> 3/3 Artifacts" -ForegroundColor Cyan
    if ($Target -eq "local") {
        Get-Item $hostBinaryPath | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
    }
    else {
        Get-ChildItem -Path $binDir -Filter "local-sso-*" | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
    }

    Write-Host "Build completed successfully!" -ForegroundColor Green
}
finally {
    Remove-Item Env:GOOS, Env:GOARCH, Env:GOARM, Env:GO386, Env:CGO_ENABLED -ErrorAction SilentlyContinue
    Pop-Location
}
