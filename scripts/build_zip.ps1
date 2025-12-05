# Script auxiliar para criar arquivo ZIP do build
# Usa o mesmo método do build.ps1 original para garantir compatibilidade

param(
    [string]$RootDir,
    [string]$OutputZip,
    [string]$Version = "unknown"
)

$ErrorActionPreference = "Stop"

# Use .NET to create ZIP (more reliable on Windows)
# Load required assemblies
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
    Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
} catch {
    # Fallback: Load from GAC
    [System.Reflection.Assembly]::LoadWithPartialName("System.IO.Compression.FileSystem") | Out-Null
    [System.Reflection.Assembly]::LoadWithPartialName("System.IO.Compression") | Out-Null
}

$IncludePaths = @(
    "backend",
    "public",
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
    # Create ZIP file - use the same approach as build.ps1
    # The enum should be available after loading the assembly
    $zip = [System.IO.Compression.ZipFile]::Open($OutputZip, [System.IO.Compression.ZipArchiveMode]::Create)
    
    foreach ($includePath in $IncludePaths) {
        $fullPath = Join-Path $RootDir $includePath
        
        if (-not (Test-Path $fullPath)) {
            Write-Host "WARNING: Path not found: $includePath" -ForegroundColor Yellow
            continue
        }
        
        $item = Get-Item $fullPath
        
        if ($item.PSIsContainer) {
            # Add directory recursively
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
                    $entry = $zip.CreateEntry($relativePath.Replace('\', '/'))
                    $entryStream = $entry.Open()
                    $fileStream = [System.IO.File]::OpenRead($file.FullName)
                    $fileStream.CopyTo($entryStream)
                    $fileStream.Close()
                    $entryStream.Close()
                    Write-Host "  + $relativePath" -ForegroundColor Gray
                }
            }
        } else {
            # Add file
            $relativePath = $item.FullName.Substring($RootDir.Length + 1)
            $entry = $zip.CreateEntry($relativePath.Replace('\', '/'))
            $entryStream = $entry.Open()
            $fileStream = [System.IO.File]::OpenRead($item.FullName)
            $fileStream.CopyTo($entryStream)
            $fileStream.Close()
            $entryStream.Close()
            Write-Host "  + $relativePath" -ForegroundColor Gray
        }
    }
    
    $zip.Dispose()
    
    $zipSize = (Get-Item $OutputZip).Length / 1MB
    Write-Host ""
    Write-Host "[Build completed successfully!]" -ForegroundColor Green
    Write-Host "  File: $OutputZip" -ForegroundColor Cyan
    Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Cyan
    Write-Host "  Version: $Version" -ForegroundColor Cyan
} catch {
    Write-Host "ERROR creating ZIP: $_" -ForegroundColor Red
    exit 1
}

