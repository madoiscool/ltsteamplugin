# Build Guide - LuaTools Steam Plugin

## Overview

This project **does not need to be compiled** - it's an interpreted Python plugin for the Millennium Steam framework. The "build" process consists of packaging all files into a ZIP for distribution.

## Prerequisites

- **Python 3.x** (for locale validation, optional)
- **PowerShell** (Windows) or **Bash** (Linux/Mac)
- **Millennium Steam** installed (to test the plugin)

## Build Process

### Method 1: Automated Script (Recommended)

#### Windows (PowerShell)

```powershell
# Basic build
.\build.ps1

# Build with cleanup of previous build
.\build.ps1 -Clean

# Build with custom name
.\build.ps1 -OutputName "luatools-v6.3.zip"
```

#### Linux/Mac (Bash)

```bash
# Make executable (first time)
chmod +x build.sh

# Execute
./build.sh

# With cleanup
./build.sh ltsteamplugin.zip true
```

### Method 2: Manual

1. **Validate locales** (optional):
   ```powershell
   python scripts\validate_locales.py
   ```

2. **Create ZIP manually**:
   - Include all files and directories:
     - `backend/` (entire directory)
     - `public/` (entire directory)
     - `plugin.json`
     - `requirements.txt`
     - `readme`
   
   - **Exclude**:
     - `__pycache__/`
     - `*.pyc`, `*.pyo`
     - `.git/`
     - Temporary files (`temp_dl/`, `data/`, etc.)
     - Previous builds (`*.zip`)

3. **File name**: `ltsteamplugin.zip` (default used by auto-update system)

## ZIP Structure

The ZIP file should contain:

```
ltsteamplugin.zip
├── backend/
│   ├── *.py (all Python files)
│   ├── locales/
│   │   └── *.json (translation files)
│   ├── settings/
│   │   └── *.py
│   └── restart_steam.cmd
├── public/
│   ├── luatools.js
│   ├── luatools-icon.png
│   └── steamdb-webkit.css
├── plugin.json
├── requirements.txt
└── readme
```

## Local Installation (Development)

To test locally without creating ZIP:

1. **Copy to Millennium plugins directory**:
   ```
   Steam/plugins/luatools/
   ```

2. **Install Python dependencies** (if needed):
   ```powershell
   pip install -r requirements.txt
   ```

3. **Restart Steam** to load the plugin

## Distribution

### GitHub Releases

The auto-update system expects a GitHub release with:

- **Tag**: Version (e.g., `6.3`)
- **Asset**: `ltsteamplugin.zip`

### Configuration

The `backend/update.json` file contains the configuration:

```json
{
  "github": {
    "owner": "madoiscool",
    "repo": "ltsteamplugin",
    "asset_name": "ltsteamplugin.zip"
  }
}
```

## Pre-Build Checklist

Before creating the build, verify:

- [ ] Version updated in `plugin.json`
- [ ] All locale files synchronized (`scripts/validate_locales.py`)
- [ ] JavaScript minified (if applicable)
- [ ] Local tests passing
- [ ] `requirements.txt` updated

## Troubleshooting

### Error: "Required file not found"
- Verify you're running the script from the project root
- Confirm that `plugin.json` exists

### Error: "Locale validation failed"
- Run manually: `python scripts\validate_locales.py`
- Verify all `.json` files in `backend/locales/` are valid

### ZIP too large
- Verify you're not including `__pycache__/` or temporary files
- Use `-Clean` to remove previous builds

## Important Notes

1. **Don't compile Python**: Python code is interpreted directly by Millennium
2. **Maintain structure**: Directory structure must be preserved in the ZIP
3. **Version**: Always update the version in `plugin.json` before building
4. **Test locally**: Always test the plugin locally before distributing
