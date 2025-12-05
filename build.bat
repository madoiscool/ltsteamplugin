@echo off
REM Build Script for LuaTools Steam Plugin
REM Creates a ZIP file ready for distribution

setlocal enabledelayedexpansion

REM Parse arguments
set "OUTPUT_NAME=ltsteamplugin.zip"
set "CLEAN=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="-Clean" (
    set "CLEAN=1"
    shift
    goto parse_args
)
if /i "%~1"=="--Clean" (
    set "CLEAN=1"
    shift
    goto parse_args
)
if "%~1"=="" goto args_done
set "OUTPUT_NAME=%~1"
shift
goto parse_args

:args_done

REM Project root directory
set "ROOT_DIR=%~dp0"
set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "OUTPUT_PATH=%ROOT_DIR%\%OUTPUT_NAME%"

echo === LuaTools Build Script ===
echo Root directory: %ROOT_DIR%

REM Clean previous build if requested
if "%CLEAN%"=="1" (
    if exist "%OUTPUT_PATH%" (
        echo Removing previous build...
        del /f /q "%OUTPUT_PATH%"
    )
)

REM Validate project structure
echo.
echo Validating project structure...

set "REQUIRED_FILES=plugin.json backend\main.py public\luatools.js"
set "VALIDATION_FAILED=0"

for %%f in (%REQUIRED_FILES%) do (
    if not exist "%ROOT_DIR%\%%f" (
        echo ERROR: Required file not found: %%f
        set "VALIDATION_FAILED=1"
    )
)

if "%VALIDATION_FAILED%"=="1" (
    exit /b 1
)

echo Structure validated successfully!

REM Read version from plugin.json
set "VERSION=unknown"
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    if exist "%ROOT_DIR%\scripts\get_version.py" (
        for /f "tokens=*" %%v in ('python "%ROOT_DIR%\scripts\get_version.py" "%ROOT_DIR%" 2^>nul') do (
            set "VERSION=%%v"
        )
    )
    if not "!VERSION!"=="unknown" (
        echo Plugin version: !VERSION!
    ) else (
        echo WARNING: Could not read version from plugin.json
    )
) else (
    echo WARNING: Could not read version from plugin.json (Python may not be installed)
)

REM Validate locales (optional)
echo.
echo Validating locale files...
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    pushd "%ROOT_DIR%"
    python scripts\validate_locales.py
    if %ERRORLEVEL% NEQ 0 (
        echo WARNING: Locale validation failed, but continuing...
    ) else (
        echo Locales validated successfully!
    )
    popd
) else (
    echo WARNING: Could not validate locales (Python may not be installed)
)

REM Create ZIP file
echo.
echo Creating ZIP file...

REM Use simplified PowerShell script with Compress-Archive for compatibility
if not exist "%ROOT_DIR%\scripts\build_zip_simple.ps1" (
    echo ERROR: build_zip_simple.ps1 script not found
    exit /b 1
)

if exist "%OUTPUT_PATH%" del /f /q "%OUTPUT_PATH%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\scripts\build_zip_simple.ps1" -RootDir "%ROOT_DIR%" -OutputZip "%OUTPUT_PATH%" -Version "%VERSION%"

if errorlevel 1 (
    echo.
    echo ERROR creating ZIP: PowerShell script failed
    exit /b 1
)

echo.
echo === Build Finished ===

endlocal

