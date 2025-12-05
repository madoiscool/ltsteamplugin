# Script auxiliar simplificado para criar arquivo ZIP do build
# Usa Compress-Archive do PowerShell 5.0+ para máxima compatibilidade

param(
    [string]$RootDir,
    [string]$OutputZip,
    [string]$Version = "unknown"
)

$ErrorActionPreference = "Stop"

$IncludePaths = @(
    "backend",
    "public",
    "vendor",
    "plugin.json",
    "requirements.txt",
    "readme"
)

$ExcludePatterns = @(
    "__pycache__",
    "*.pyc",
    "*.pyo",
    ".git",
    ".gitignore",
    "*.zip",
    "temp_dl",
    "data",
    "update_pending.zip",
    "update_pending.json",
    "api.json",
    "loadedappids.txt",
    "appidlogs.txt"
)

try {
    # Create temporary directory
    $tempDir = Join-Path $env:TEMP "luatools_build_$(Get-Date -Format 'yyyyMMddHHmmss')"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    try {
        # Copy files to temp directory, excluding unwanted patterns
        foreach ($includePath in $IncludePaths) {
            $fullPath = Join-Path $RootDir $includePath
            
            if (-not (Test-Path $fullPath)) {
                Write-Host "WARNING: Path not found: $includePath" -ForegroundColor Yellow
                continue
            }
            
            $item = Get-Item $fullPath
            
            if ($item.PSIsContainer) {
                # Copy directory recursively, excluding patterns
                $files = Get-ChildItem -Path $fullPath -Recurse -File
                foreach ($file in $files) {
                    $relativePath = $file.FullName.Substring($RootDir.Length + 1)
                    
                    # Check if should be excluded
                    $shouldExclude = $false
                    foreach ($pattern in $ExcludePatterns) {
                        if ($relativePath -like "*$pattern*") {
                            $shouldExclude = $true
                            break
                        }
                    }
                    
                    if (-not $shouldExclude) {
                        $destPath = Join-Path $tempDir $relativePath
                        $destDir = Split-Path $destPath -Parent
                        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                        Copy-Item $file.FullName -Destination $destPath -Force
                        Write-Host "  + $relativePath" -ForegroundColor Gray
                    }
                }
            } else {
                # Copy file
                $relativePath = $item.FullName.Substring($RootDir.Length + 1)
                $destPath = Join-Path $tempDir $relativePath
                $destDir = Split-Path $destPath -Parent
                if ($destDir) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item $item.FullName -Destination $destPath -Force
                Write-Host "  + $relativePath" -ForegroundColor Gray
            }
        }
        
        # Remove existing ZIP if it exists
        if (Test-Path $OutputZip) {
            Remove-Item $OutputZip -Force
        }
        
        # Create ZIP using Compress-Archive
        Compress-Archive -Path "$tempDir\*" -DestinationPath $OutputZip -Force
        
        $zipSize = (Get-Item $OutputZip).Length / 1MB
        Write-Host ""
        Write-Host "[Build completed successfully!]" -ForegroundColor Green
        Write-Host "  File: $OutputZip" -ForegroundColor Cyan
        Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Cyan
        Write-Host "  Version: $Version" -ForegroundColor Cyan
        
    } finally {
        # Cleanup temp directory
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    
} catch {
    Write-Host "ERROR creating ZIP: $_" -ForegroundColor Red
    exit 1
}

