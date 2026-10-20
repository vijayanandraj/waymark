#requires -version 5.1
<#
.SYNOPSIS
    Builds and runs Waymark locally on Windows, no Docker needed.

.DESCRIPTION
    Checks for Go and Node.js, offers to install whichever is missing via
    winget, builds the React frontend, embeds it into the Go binary, and
    starts the server. Data (users, roadmaps, screenshots) is stored as
    plain files under .\data, next to this script's project folder.

.PARAMETER Port
    Port to listen on. Default 8080.

.PARAMETER DataDir
    Where to store data. Default .\data next to the project.

.PARAMETER SkipBuild
    Skip the npm/go build steps and just run the existing binary.

.EXAMPLE
    .\run-local.ps1
    .\run-local.ps1 -Port 9000
#>
[CmdletBinding()]
param(
    [int]$Port = 8080,
    [string]$DataDir = "",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# Resolve paths relative to this script, so it works from anywhere.
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $RepoRoot "server"
$WebDir = Join-Path $RepoRoot "web"
if (-not $DataDir) { $DataDir = Join-Path $RepoRoot "data" }

if (-not (Test-Path (Join-Path $ServerDir "go.mod"))) {
    Write-Host "Could not find server\go.mod next to this script." -ForegroundColor Red
    Write-Host "Put run-local.ps1 in the root of the openroadmap project (next to the 'server' and 'web' folders), or edit `$RepoRoot at the top of the script." -ForegroundColor Red
    exit 1
}

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Ensure-Tool {
    param(
        [string]$Name,
        [string]$CommandName,
        [string[]]$VersionArgs,
        [string]$WingetId,
        [string]$ManualUrl
    )
    if (Test-Command $CommandName) {
        $v = & $CommandName @VersionArgs 2>$null | Select-Object -First 1
        Write-Ok "$Name found: $v"
        return $true
    }

    Write-Warn2 "$Name was not found on PATH."
    if (-not (Test-Command "winget")) {
        Write-Host "    winget is not available either, so I can't install $Name for you." -ForegroundColor Red
        Write-Host "    Install it manually from $ManualUrl, then re-run this script." -ForegroundColor Red
        return $false
    }

    $answer = Read-Host "    Install $Name now via winget ($WingetId)? [Y/n]"
    if ($answer -match '^[nN]') {
        Write-Host "    Skipping. Install $Name manually from $ManualUrl and re-run." -ForegroundColor Red
        return $false
    }

    Write-Step "Installing $Name via winget..."
    winget install --id $WingetId -e --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    winget install failed. Install $Name manually from $ManualUrl." -ForegroundColor Red
        return $false
    }

    Write-Warn2 "$Name was just installed. Its PATH entry usually needs a new shell session."
    Write-Warn2 "Close this window, reopen PowerShell, and run this script again."
    exit 0
}

if (-not $SkipBuild) {
    Write-Step "Checking prerequisites"
    $goOk = Ensure-Tool -Name "Go" -CommandName "go" -VersionArgs @("version") -WingetId "GoLang.Go" -ManualUrl "https://go.dev/dl/"
    $nodeOk = Ensure-Tool -Name "Node.js" -CommandName "node" -VersionArgs @("--version") -WingetId "OpenJS.NodeJS.LTS" -ManualUrl "https://nodejs.org/"
    if (-not ($goOk -and $nodeOk)) { exit 1 }

    Write-Step "Building the web app (npm install + build)"
    Push-Location $WebDir
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
        Pop-Location
    }
    Write-Ok "Web app built into server\webdist\dist"

    Write-Step "Building the server (embeds the web app into one .exe)"
    Push-Location $ServerDir
    try {
        if (-not (Test-Path "bin")) { New-Item -ItemType Directory -Path "bin" | Out-Null }
        go build -o "bin\server.exe" ".\cmd\server"
        if ($LASTEXITCODE -ne 0) { throw "go build failed" }
    } finally {
        Pop-Location
    }
    Write-Ok "Built server\bin\server.exe"
} else {
    Write-Step "Skipping build (-SkipBuild). Using existing server\bin\server.exe"
    if (-not (Test-Path (Join-Path $ServerDir "bin\server.exe"))) {
        Write-Host "server\bin\server.exe does not exist. Run without -SkipBuild first." -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir | Out-Null
}

Write-Step "Starting Waymark on http://localhost:$Port"
Write-Ok "Data is stored in: $DataDir"
Write-Ok "The first account you create becomes the administrator."
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

Start-Sleep -Milliseconds 400
try {
    Start-Process "http://localhost:$Port" | Out-Null
} catch { }

& (Join-Path $ServerDir "bin\server.exe") -addr "127.0.0.1:$Port" -data $DataDir
