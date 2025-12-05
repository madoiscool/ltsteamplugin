# Build Script for LuaTools Steam Plugin
# Creates a ZIP file ready for distribution

param(
    [string]$OutputName = "ltsteamplugin.zip",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# Project root directory
$RootDir = $PSScriptRoot
$OutputPath = Join-Path $RootDir $OutputName

Write-Host "=== LuaTools Build Script ===" -ForegroundColor Cyan
Write-Host "Root directory: $RootDir" -ForegroundColor Gray

# Clean previous build if requested
if ($Clean -and (Test-Path $OutputPath)) {
    Write-Host "Removing previous build..." -ForegroundColor Yellow
    Remove-Item $OutputPath -Force
}

# Validate project structure
Write-Host "`nValidating project structure..." -ForegroundColor Cyan

$RequiredFiles = @(
    "plugin.json",
    "backend\main.py",
    "public\luatools.js"
)

foreach ($file in $RequiredFiles) {
    $fullPath = Join-Path $RootDir $file
    if (-not (Test-Path $fullPath)) {
        Write-Host "ERROR: Required file not found: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Structure validated successfully!" -ForegroundColor Green

# Read version from plugin.json
try {
    $pluginJson = Get-Content (Join-Path $RootDir "plugin.json") | ConvertFrom-Json
    $version = $pluginJson.version
    Write-Host "Plugin version: $version" -ForegroundColor Cyan
} catch {
    Write-Host "WARNING: Could not read version from plugin.json" -ForegroundColor Yellow
    $version = "unknown"
}

# Validate locales (optional)
Write-Host "`nValidating locale files..." -ForegroundColor Cyan
try {
    Push-Location $RootDir
    python scripts\validate_locales.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Locale validation failed, but continuing..." -ForegroundColor Yellow
    } else {
        Write-Host "Locales validated successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "WARNING: Could not validate locales (Python may not be installed)" -ForegroundColor Yellow
} finally {
    Pop-Location
}

# Create ZIP file
Write-Host "`nCreating ZIP file..." -ForegroundColor Cyan

# Files and directories to include
$IncludePaths = @(
    "backend",
    "public",
    "vendor",
    "plugin.json",
    "requirements.txt",
    "readme"
)

# Files and directories to exclude
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

# Create temporary ZIP file
$TempZip = Join-Path $env:TEMP "luatools_build_$(Get-Date -Format 'yyyyMMddHHmmss').zip"
if (Test-Path $TempZip) {
    Remove-Item $TempZip -Force
}

# Use .NET to create ZIP (more reliable on Windows)
Add-Type -AssemblyName System.IO.Compression.FileSystem

try {
    $zip = [System.IO.Compression.ZipFile]::Open($TempZip, [System.IO.Compression.ZipArchiveMode]::Create)
    
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
    
    # Move temporary ZIP to final location
    if (Test-Path $OutputPath) {
        Remove-Item $OutputPath -Force
    }
    Move-Item $TempZip $OutputPath
    
    $zipSize = (Get-Item $OutputPath).Length / 1MB
    Write-Host "`n✓ Build completed successfully!" -ForegroundColor Green
    Write-Host "  File: $OutputPath" -ForegroundColor Cyan
    Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Cyan
    Write-Host "  Version: $version" -ForegroundColor Cyan
    
} catch {
    Write-Host "`nERROR creating ZIP: $_" -ForegroundColor Red
    if (Test-Path $TempZip) {
        Remove-Item $TempZip -Force
    }
    exit 1
}

Write-Host "`n=== Build Finished ===" -ForegroundColor Cyan
