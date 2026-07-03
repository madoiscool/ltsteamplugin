<#
.SYNOPSIS
  Deploy this repo's Lua plugin + the latest built Millennium core DLL/EXEs to the live Steam install.

.DESCRIPTION
  Two independent jobs, both safe to run together or separately:

  1. Plugin: copies backend/, public/, plugin.json from this repo to the live plugin folder at
     K:\Steam client\millennium\plugins\luatools. This repo is the source of truth going forward --
     if you hotfixed something directly in the live folder, run sync-from-live.ps1 FIRST or this will
     overwrite your fix.

  2. Millennium core: Millennium's CMake build can write straight into the Steam install when
     MILLENNIUM_BUILD_TO_STEAM_PATH is on (the default for Debug builds), in which case there's nothing
     to do here. For Release builds (or any other out-of-tree build dir), this searches the Millennium
     repo for the newest millennium.dll / millennium.hhx64.dll / millennium.bootstrap64.dll (optional) /
     millennium.crashhandler64.exe / millennium.luavm64.exe by LastWriteTime and promotes them to
     K:\Steam client\millennium\lib\ and \bin\ if newer than what's already deployed there.

  Every file this script overwrites gets backed up first with a timestamp suffix.

.PARAMETER SkipPlugin
  Skip the Lua plugin deploy step.

.PARAMETER SkipDll
  Skip the Millennium core DLL/EXE deploy step.

.PARAMETER MillenniumRepo
  Path to the Millennium C++ source repo, searched for freshly built binaries.
#>

param(
    [switch]$SkipPlugin,
    [switch]$SkipDll,
    [string]$MillenniumRepo = "k:\CRACK STUYFF\one time tools\Millennium"
)

$ErrorActionPreference = "Stop"

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$LiveRoot   = "K:\Steam client\millennium\plugins\luatools"
$SteamLib   = "K:\Steam client\millennium\lib"
$SteamBin   = "K:\Steam client\millennium\bin"
$BackupRoot = "K:\Steam client\millennium\.deploy-backups"

function Backup-IfExists([string]$Path) {
    if (Test-Path $Path) {
        New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $name  = Split-Path -Leaf $Path
        $dest  = Join-Path $BackupRoot "$name.$stamp.bak"
        Copy-Item $Path $dest -Recurse -Force
    }
}

# ── 1. Lua plugin: repo -> live ──────────────────────────────────────────────
if (-not $SkipPlugin) {
    Write-Host "=== Deploying Lua plugin: repo -> live ===" -ForegroundColor Cyan

    foreach ($dir in @("backend", "public")) {
        $src = Join-Path $RepoRoot $dir
        $dst = Join-Path $LiveRoot $dir
        if (-not (Test-Path $src)) {
            Write-Warning "Repo has no '$dir' folder, skipping."
            continue
        }
        Backup-IfExists $dst
        # /MIR so files removed from the repo (like the old bloated backend/*.lua) also disappear live.
        robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
        $rc = $LASTEXITCODE
        if ($rc -ge 8) { Write-Error "robocopy failed deploying $dir (exit code $rc)" }
        Write-Host "  deployed $dir/ (robocopy exit $rc)" -ForegroundColor DarkGray
    }

    Backup-IfExists (Join-Path $LiveRoot "plugin.json")
    Copy-Item (Join-Path $RepoRoot "plugin.json") (Join-Path $LiveRoot "plugin.json") -Force
    Write-Host "  deployed plugin.json" -ForegroundColor DarkGray
    Write-Host ""
}

# ── 2. Millennium core: newest built DLL/EXE -> Steam install ───────────────
if (-not $SkipDll) {
    Write-Host "=== Deploying Millennium core: newest build -> Steam ===" -ForegroundColor Cyan

    if (-not (Test-Path $MillenniumRepo)) {
        Write-Warning "Millennium repo not found at $MillenniumRepo, skipping DLL deploy."
    } else {
        # Search the whole repo (it's the only place these filenames can legitimately appear) but skip
        # heavy vendor trees for speed.
        $excludeDirs = @(".git", "thirdparty", "packages")
        $targets = @(
            @{ Name = "millennium.dll";              Dest = $SteamLib },
            @{ Name = "millennium.hhx64.dll";         Dest = $SteamLib },
            @{ Name = "millennium.bootstrap64.dll";   Dest = $SteamLib; Optional = $true },
            @{ Name = "millennium.crashhandler64.exe"; Dest = $SteamBin },
            @{ Name = "millennium.luavm64.exe";       Dest = $SteamBin }
        )

        $allFiles = Get-ChildItem -Path $MillenniumRepo -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object {
                $full = $_.FullName
                -not ($excludeDirs | Where-Object { $full -like "*\$_\*" })
            }

        foreach ($t in $targets) {
            $candidates = $allFiles | Where-Object { $_.Name -ieq $t.Name } | Sort-Object LastWriteTime -Descending
            if (-not $candidates) {
                if (-not $t.Optional) { Write-Warning "No '$($t.Name)' found anywhere under $MillenniumRepo." }
                continue
            }
            $newest = $candidates | Select-Object -First 1
            $destPath = Join-Path $t.Dest $t.Name

            if ($newest.FullName -ieq $destPath) {
                Write-Host "  $($t.Name): newest build IS the deployed copy (Debug build-to-Steam-path), nothing to do." -ForegroundColor DarkGray
                continue
            }

            $needsCopy = $true
            if (Test-Path $destPath) {
                $deployed = Get-Item $destPath
                if ($deployed.LastWriteTime -ge $newest.LastWriteTime) {
                    Write-Host "  $($t.Name): deployed copy is already up to date, skipping." -ForegroundColor DarkGray
                    $needsCopy = $false
                }
            }

            if ($needsCopy) {
                New-Item -ItemType Directory -Force -Path $t.Dest | Out-Null
                Backup-IfExists $destPath
                Copy-Item $newest.FullName $destPath -Force
                Write-Host "  $($t.Name): deployed from $($newest.FullName) ($(Get-Date $newest.LastWriteTime -Format 'yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Green
            }
        }
    }
}

Write-Host ""
Write-Host "Deploy complete." -ForegroundColor Green
Write-Host "Restart the plugin (or restart Steam) for changes to take effect." -ForegroundColor Yellow
