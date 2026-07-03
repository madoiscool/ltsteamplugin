<#
.SYNOPSIS
  Pull the live, running copy of the LuaTools Millennium plugin back into this repo.

.DESCRIPTION
  The live plugin at K:\Steam client\millennium\plugins\luatools has, more than once, drifted ahead of
  this repo because it's easy to hotfix a bug directly in the live folder while testing in Steam and
  forget to carry the fix back. This script is the safety net: it copies backend/, public/, and
  plugin.json from the live folder into this repo's working tree, so `git status`/`git diff` shows you
  exactly what changed live that isn't committed yet.

  Run this BEFORE deploy.ps1 whenever you're not sure the repo is still ahead of live, and always after
  debugging directly against the live copy.
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$LiveRoot = "K:\Steam client\millennium\plugins\luatools"

if (-not (Test-Path $LiveRoot)) {
    Write-Error "Live plugin folder not found at $LiveRoot -- is Millennium/the plugin installed?"
}

Write-Host "Pulling live plugin state into repo..." -ForegroundColor Cyan
Write-Host "  live: $LiveRoot"
Write-Host "  repo: $RepoRoot"
Write-Host ""

foreach ($dir in @("backend", "public")) {
    $src = Join-Path $LiveRoot $dir
    $dst = Join-Path $RepoRoot $dir
    if (-not (Test-Path $src)) {
        Write-Warning "Live has no '$dir' folder, skipping."
        continue
    }
    # /MIR mirrors src into dst (adds new, updates changed, removes files gone from live).
    # Excluding .git is unnecessary since dst subfolders never contain it, but keep the copy scoped
    # to backend/public explicitly rather than mirroring the whole repo root.
    robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) {
        Write-Error "robocopy failed copying $dir (exit code $rc)"
    }
    Write-Host "  synced $dir/ (robocopy exit $rc)" -ForegroundColor DarkGray
}

Copy-Item (Join-Path $LiveRoot "plugin.json") (Join-Path $RepoRoot "plugin.json") -Force
Write-Host "  synced plugin.json" -ForegroundColor DarkGray

Write-Host ""
Write-Host "Done. Run 'git status' / 'git diff' in this repo to review what live had that wasn't committed." -ForegroundColor Green
