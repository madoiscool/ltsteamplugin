"""Handling of LuaTools add/download flows and related utilities."""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
from typing import Dict

import Millennium  # type: ignore

from api_manifest import load_api_manifest
from config import (
    APPID_LOG_FILE,
    LOADED_APPS_FILE,
    USER_AGENT,
    WEBKIT_DIR_NAME,
    WEB_UI_ICON_FILE,
    WEB_UI_JS_FILE,
)
from http_client import ensure_http_client
from logger import logger
from paths import backend_path, public_path
from steam_utils import detect_steam_install_path, has_lua_for_app
from utils import count_apis, ensure_temp_download_dir, normalize_manifest_text, read_text, write_text

DOWNLOAD_STATE: Dict[int, Dict[str, any]] = {}
DOWNLOAD_LOCK = threading.Lock()

# Cache for app names to avoid repeated API calls
APP_NAME_CACHE: Dict[int, str] = {}
APP_NAME_CACHE_LOCK = threading.Lock()

# Rate limiting for Steam API calls
LAST_API_CALL_TIME = 0
API_CALL_MIN_INTERVAL = 0.3  # 300ms between calls to avoid 429 errors


def _set_download_state(appid: int, update: dict) -> None:
    with DOWNLOAD_LOCK:
        state = DOWNLOAD_STATE.get(appid) or {}
        state.update(update)
        DOWNLOAD_STATE[appid] = state


def _get_download_state(appid: int) -> dict:
    with DOWNLOAD_LOCK:
        return DOWNLOAD_STATE.get(appid, {}).copy()


def _loaded_apps_path() -> str:
    return backend_path(LOADED_APPS_FILE)


def _appid_log_path() -> str:
    return backend_path(APPID_LOG_FILE)


def _fetch_app_name(appid: int) -> str:
    """Fetch app name from Steam API with rate limiting and caching."""
    global LAST_API_CALL_TIME

    # Check cache first
    with APP_NAME_CACHE_LOCK:
        if appid in APP_NAME_CACHE:
            return APP_NAME_CACHE[appid]

    # Rate limiting: wait if needed
    with APP_NAME_CACHE_LOCK:
        time_since_last_call = time.time() - LAST_API_CALL_TIME
        if time_since_last_call < API_CALL_MIN_INTERVAL:
            time.sleep(API_CALL_MIN_INTERVAL - time_since_last_call)
        LAST_API_CALL_TIME = time.time()

    client = ensure_http_client("LuaTools: _fetch_app_name")
    try:
        url = f"https://store.steampowered.com/api/appdetails?appids={appid}"
        resp = client.get(url, follow_redirects=True, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        entry = data.get(str(appid)) or data.get(int(appid)) or {}
        if isinstance(entry, dict):
            inner = entry.get("data") or {}
            name = inner.get("name")
            if isinstance(name, str) and name.strip():
                name = name.strip()
                # Cache the result
                with APP_NAME_CACHE_LOCK:
                    APP_NAME_CACHE[appid] = name
                return name
    except Exception as exc:
        logger.warn(f"LuaTools: _fetch_app_name failed for {appid}: {exc}")

    # Cache empty result to avoid repeated failed attempts
    with APP_NAME_CACHE_LOCK:
        APP_NAME_CACHE[appid] = ""
    return ""


def _append_loaded_app(appid: int, name: str) -> None:
    try:
        path = _loaded_apps_path()
        lines = []
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                lines = handle.read().splitlines()
        prefix = f"{appid}:"
        lines = [line for line in lines if not line.startswith(prefix)]
        lines.append(f"{appid}:{name}")
        with open(path, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    except Exception as exc:
        logger.warn(f"LuaTools: _append_loaded_app failed for {appid}: {exc}")


def _remove_loaded_app(appid: int) -> None:
    try:
        path = _loaded_apps_path()
        if not os.path.exists(path):
            return
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.read().splitlines()
        prefix = f"{appid}:"
        new_lines = [line for line in lines if not line.startswith(prefix)]
        if len(new_lines) != len(lines):
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("\n".join(new_lines) + ("\n" if new_lines else ""))
    except Exception as exc:
        logger.warn(f"LuaTools: _remove_loaded_app failed for {appid}: {exc}")


def _log_appid_event(action: str, appid: int, name: str) -> None:
    try:
        stamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        line = f"[{action}] {appid} - {name} - {stamp}\n"
        with open(_appid_log_path(), "a", encoding="utf-8") as handle:
            handle.write(line)
    except Exception as exc:
        logger.warn(f"LuaTools: _log_appid_event failed: {exc}")


def _preload_app_names_cache() -> None:
    """Pre-load all app names from loaded_apps and appidlogs files into memory cache."""
    # First, load from appidlogs.txt (historical records)
    try:
        log_path = _appid_log_path()
        if os.path.exists(log_path):
            with open(log_path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    # Format: [ACTION - API_NAME] appid - name - timestamp
                    # Example: [ADDED - Sadie] 945360 - Among Us - 2024-01-15 14:05:04
                    # Or: [REMOVED] appid - name - timestamp
                    if "]" in line and " - " in line:
                        try:
                            # Extract content after the first ']'
                            parts = line.split("]", 1)
                            if len(parts) < 2:
                                continue

                            content = parts[1].strip()
                            # Split by " - " to get: appid, name, timestamp (max 3 parts)
                            content_parts = content.split(" - ", 2)

                            if len(content_parts) >= 2:
                                appid_str = content_parts[0].strip()
                                name = content_parts[1].strip()

                                # Try to parse appid
                                appid = int(appid_str)

                                # Skip "Unknown Game" or "UNKNOWN" entries
                                if name and not name.startswith("Unknown") and not name.startswith("UNKNOWN"):
                                    with APP_NAME_CACHE_LOCK:
                                        APP_NAME_CACHE[appid] = name
                        except (ValueError, IndexError):
                            continue
    except Exception as exc:
        logger.warn(f"LuaTools: _preload_app_names_cache from logs failed: {exc}")

    # Then, load from loaded_apps.txt (current state - overrides log if present)
    try:
        path = _loaded_apps_path()
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    if ":" in line:
                        parts = line.split(":", 1)
                        try:
                            appid = int(parts[0].strip())
                            name = parts[1].strip()
                            if name:
                                with APP_NAME_CACHE_LOCK:
                                    APP_NAME_CACHE[appid] = name
                        except (ValueError, IndexError):
                            continue
    except Exception as exc:
        logger.warn(f"LuaTools: _preload_app_names_cache from loaded_apps failed: {exc}")


def _get_loaded_app_name(appid: int) -> str:
    try:
        path = _loaded_apps_path()
        if not os.path.exists(path):
            return ""
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle.read().splitlines():
                if line.startswith(f"{appid}:"):
                    return line.split(":", 1)[1].strip()
    except Exception:
        return ""
    return ""


def fetch_app_name(appid: int) -> str:
    return _fetch_app_name(appid)


def _process_and_install_lua(appid: int, zip_path: str) -> None:
    """Process downloaded zip and install lua file into stplug-in directory."""
    import zipfile

    if _is_download_cancelled(appid):
        raise RuntimeError("cancelled")

    base_path = detect_steam_install_path() or Millennium.steam_path()
    target_dir = os.path.join(base_path or "", "config", "stplug-in")
    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as archive:
        names = archive.namelist()

        try:
            depotcache_dir = os.path.join(base_path or "", "depotcache")
            os.makedirs(depotcache_dir, exist_ok=True)
            for name in names:
                try:
                    if _is_download_cancelled(appid):
                        raise RuntimeError("cancelled")
                    if name.lower().endswith(".manifest"):
                        pure = os.path.basename(name)
                        data = archive.read(name)
                        out_path = os.path.join(depotcache_dir, pure)
                        with open(out_path, "wb") as manifest_file:
                            manifest_file.write(data)
                        logger.log(f"LuaTools: Extracted manifest -> {out_path}")
                except Exception as manifest_exc:
                    logger.warn(f"LuaTools: Failed to extract manifest {name}: {manifest_exc}")
        except Exception as depot_exc:
            logger.warn(f"LuaTools: depotcache extraction failed: {depot_exc}")

        candidates = []
        for name in names:
            pure = os.path.basename(name)
            if re.fullmatch(r"\d+\.lua", pure):
                candidates.append(name)

        if _is_download_cancelled(appid):
            raise RuntimeError("cancelled")

        chosen = None
        preferred = f"{appid}.lua"
        for name in candidates:
            if os.path.basename(name) == preferred:
                chosen = name
                break
        if chosen is None and candidates:
            chosen = candidates[0]
        if not chosen:
            raise RuntimeError("No numeric .lua file found in zip")

        data = archive.read(chosen)
        try:
            text = data.decode("utf-8")
        except Exception:
            text = data.decode("utf-8", errors="replace")

        processed_lines = []
        for line in text.splitlines(True):
            if re.match(r"^\s*setManifestid\(", line) and not re.match(r"^\s*--", line):
                line = re.sub(r"^(\s*)", r"\1--", line)
            processed_lines.append(line)
        processed_text = "".join(processed_lines)

        _set_download_state(appid, {"status": "installing"})
        dest_file = os.path.join(target_dir, f"{appid}.lua")
        if _is_download_cancelled(appid):
            raise RuntimeError("cancelled")
        with open(dest_file, "w", encoding="utf-8") as output:
            output.write(processed_text)
        logger.log(f"LuaTools: Installed lua -> {dest_file}")
        _set_download_state(appid, {"installedPath": dest_file})

    try:
        os.remove(zip_path)
    except Exception:
        try:
            for _ in range(3):
                time.sleep(0.2)
                try:
                    os.remove(zip_path)
                    break
                except Exception:
                    continue
        except Exception:
            pass


def _is_download_cancelled(appid: int) -> bool:
    try:
        return _get_download_state(appid).get("status") == "cancelled"
    except Exception:
        return False


def _download_zip_for_app(appid: int):
    client = ensure_http_client("LuaTools: download")
    apis = load_api_manifest()
    if not apis:
        logger.warn("LuaTools: No enabled APIs in manifest")
        _set_download_state(appid, {"status": "failed", "error": "No APIs available"})
        return

    dest_root = ensure_temp_download_dir()
    dest_path = os.path.join(dest_root, f"{appid}.zip")
    _set_download_state(
        appid,
        {"status": "checking", "currentApi": None, "bytesRead": 0, "totalBytes": 0, "dest": dest_path},
    )

    for api in apis:
        name = api.get("name", "Unknown")
        template = api.get("url", "")
        success_code = int(api.get("success_code", 200))
        unavailable_code = int(api.get("unavailable_code", 404))
        url = template.replace("<appid>", str(appid))
        _set_download_state(
            appid, {"status": "checking", "currentApi": name, "bytesRead": 0, "totalBytes": 0}
        )
        logger.log(f"LuaTools: Trying API '{name}' -> {url}")
        try:
            headers = {"User-Agent": USER_AGENT}
            if _is_download_cancelled(appid):
                logger.log(f"LuaTools: Download cancelled before contacting API '{name}'")
                return
            with client.stream("GET", url, headers=headers, follow_redirects=True) as resp:
                code = resp.status_code
                logger.log(f"LuaTools: API '{name}' status={code}")
                if code == unavailable_code:
                    continue
                if code != success_code:
                    continue
                total = int(resp.headers.get("Content-Length", "0") or "0")
                _set_download_state(appid, {"status": "downloading", "bytesRead": 0, "totalBytes": total})
                with open(dest_path, "wb") as output:
                    for chunk in resp.iter_bytes():
                        if not chunk:
                            continue
                        if _is_download_cancelled(appid):
                            logger.log(f"LuaTools: Download cancelled mid-stream for appid={appid}")
                            raise RuntimeError("cancelled")
                        output.write(chunk)
                        state = _get_download_state(appid)
                        read = int(state.get("bytesRead", 0)) + len(chunk)
                        _set_download_state(appid, {"bytesRead": read})
                        if _is_download_cancelled(appid):
                            logger.log(f"LuaTools: Download cancelled after writing chunk for appid={appid}")
                            raise RuntimeError("cancelled")
                logger.log(f"LuaTools: Download complete -> {dest_path}")

                if _is_download_cancelled(appid):
                    logger.log(f"LuaTools: Download marked cancelled after completion for appid={appid}")
                    raise RuntimeError("cancelled")

                try:
                    with open(dest_path, "rb") as fh:
                        magic = fh.read(4)
                        if magic not in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"):
                            file_size = os.path.getsize(dest_path)
                            with open(dest_path, "rb") as check_f:
                                preview = check_f.read(512)
                                content_preview = preview[:100].decode("utf-8", errors="ignore")
                            logger.warn(
                                f"LuaTools: API '{name}' returned non-zip file (magic={magic.hex()}, size={file_size}, preview={content_preview[:50]})"
                            )
                            try:
                                os.remove(dest_path)
                            except Exception:
                                pass
                            continue
                except FileNotFoundError:
                    logger.warn("LuaTools: Downloaded file not found after download")
                    continue
                except Exception as validation_exc:
                    logger.warn(f"LuaTools: File validation failed for API '{name}': {validation_exc}")
                    try:
                        os.remove(dest_path)
                    except Exception:
                        pass
                    continue

                try:
                    if _is_download_cancelled(appid):
                        logger.log(f"LuaTools: Processing aborted due to cancellation for appid={appid}")
                        raise RuntimeError("cancelled")
                    _set_download_state(appid, {"status": "processing"})
                    _process_and_install_lua(appid, dest_path)
                    if _is_download_cancelled(appid):
                        logger.log(f"LuaTools: Installation complete but marked cancelled for appid={appid}")
                        raise RuntimeError("cancelled")
                    try:
                        fetched_name = _fetch_app_name(appid) or f"UNKNOWN ({appid})"
                        _append_loaded_app(appid, fetched_name)
                        _log_appid_event(f"ADDED - {name}", appid, fetched_name)
                    except Exception:
                        pass
                    _set_download_state(appid, {"status": "done", "success": True, "api": name})
                    return
                except Exception as install_exc:
                    if isinstance(install_exc, RuntimeError) and str(install_exc) == "cancelled":
                        try:
                            if os.path.exists(dest_path):
                                os.remove(dest_path)
                        except Exception:
                            pass
                        logger.log(f"LuaTools: Cancelled download cleanup complete for appid={appid}")
                        return
                    logger.warn(f"LuaTools: Processing failed -> {install_exc}")
                    _set_download_state(
                        appid, {"status": "failed", "error": f"Processing failed: {install_exc}"}
                    )
                    try:
                        os.remove(dest_path)
                    except Exception:
                        pass
                    return
        except RuntimeError as cancel_exc:
            if str(cancel_exc) == "cancelled":
                try:
                    if os.path.exists(dest_path):
                        os.remove(dest_path)
                except Exception:
                    pass
                logger.log(f"LuaTools: Download cancelled and cleaned up for appid={appid}")
                return
            logger.warn(f"LuaTools: Runtime error during download for appid={appid}: {cancel_exc}")
            _set_download_state(appid, {"status": "failed", "error": str(cancel_exc)})
            return
        except Exception as err:
            logger.warn(f"LuaTools: API '{name}' failed with error: {err}")
            continue

    _set_download_state(appid, {"status": "failed", "error": "Not available on any API"})


def start_add_via_luatools(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    logger.log(f"LuaTools: StartAddViaLuaTools appid={appid}")
    _set_download_state(appid, {"status": "queued", "bytesRead": 0, "totalBytes": 0})
    thread = threading.Thread(target=_download_zip_for_app, args=(appid,), daemon=True)
    thread.start()
    return json.dumps({"success": True})


def get_add_status(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})
    state = _get_download_state(appid)
    return json.dumps({"success": True, "state": state})


def read_loaded_apps() -> str:
    try:
        path = _loaded_apps_path()
        entries = []
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle.read().splitlines():
                    if ":" in line:
                        appid_str, name = line.split(":", 1)
                        appid_str = appid_str.strip()
                        name = name.strip()
                        if appid_str.isdigit() and name:
                            entries.append({"appid": int(appid_str), "name": name})
        return json.dumps({"success": True, "apps": entries})
    except Exception as exc:
        return json.dumps({"success": False, "error": str(exc)})


def dismiss_loaded_apps() -> str:
    try:
        path = _loaded_apps_path()
        if os.path.exists(path):
            os.remove(path)
        return json.dumps({"success": True})
    except Exception as exc:
        return json.dumps({"success": False, "error": str(exc)})


def delete_luatools_for_app(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    base = detect_steam_install_path() or Millennium.steam_path()
    target_dir = os.path.join(base or "", "config", "stplug-in")
    paths = [
        os.path.join(target_dir, f"{appid}.lua"),
        os.path.join(target_dir, f"{appid}.lua.disabled"),
    ]
    deleted = []
    for path in paths:
        try:
            if os.path.exists(path):
                os.remove(path)
                deleted.append(path)
        except Exception as exc:
            logger.warn(f"LuaTools: Failed to delete {path}: {exc}")
    try:
        name = _get_loaded_app_name(appid) or _fetch_app_name(appid) or f"UNKNOWN ({appid})"
        _remove_loaded_app(appid)
        if deleted:
            _log_appid_event("REMOVED", appid, name)
    except Exception:
        pass
    return json.dumps({"success": True, "deleted": deleted, "count": len(deleted)})


def get_icon_data_url() -> str:
    try:
        steam_ui_path = os.path.join(Millennium.steam_path(), "steamui", WEBKIT_DIR_NAME)
        icon_path = os.path.join(steam_ui_path, WEB_UI_ICON_FILE)
        if not os.path.exists(icon_path):
            icon_path = public_path(WEB_UI_ICON_FILE)
        with open(icon_path, "rb") as handle:
            data = handle.read()
        b64 = base64.b64encode(data).decode("ascii")
        return json.dumps({"success": True, "dataUrl": f"data:image/png;base64,{b64}"})
    except Exception as exc:
        logger.warn(f"LuaTools: GetIconDataUrl failed: {exc}")
        return json.dumps({"success": False, "error": str(exc)})


def has_luatools_for_app(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})
    exists = has_lua_for_app(appid)
    return json.dumps({"success": True, "exists": exists})


def cancel_add_via_luatools(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    state = _get_download_state(appid)
    if not state or state.get("status") in {"done", "failed"}:
        return json.dumps({"success": True, "message": "Nothing to cancel"})

    _set_download_state(appid, {"status": "cancelled", "error": "Cancelled by user"})
    logger.log(f"LuaTools: Cancellation requested for appid={appid}")
    return json.dumps({"success": True})


def get_installed_lua_scripts() -> str:
    """Get list of all installed Lua scripts from stplug-in directory."""
    try:
        # Pre-load app names cache from file to avoid API calls
        _preload_app_names_cache()

        base_path = detect_steam_install_path() or Millennium.steam_path()
        if not base_path:
            return json.dumps({"success": False, "error": "Could not find Steam installation path"})

        target_dir = os.path.join(base_path, "config", "stplug-in")
        if not os.path.exists(target_dir):
            return json.dumps({"success": True, "scripts": []})

        installed_scripts = []

        try:
            for filename in os.listdir(target_dir):
                # Match both enabled (.lua) and disabled (.lua.disabled) scripts
                if filename.endswith(".lua") or filename.endswith(".lua.disabled"):
                    try:
                        # Extract appid from filename
                        appid_str = filename.replace(".lua.disabled", "").replace(".lua", "")
                        appid = int(appid_str)

                        # Check if it's disabled
                        is_disabled = filename.endswith(".lua.disabled")

                        # Try to get game name from cache (no API calls during listing)
                        game_name = ""
                        with APP_NAME_CACHE_LOCK:
                            game_name = APP_NAME_CACHE.get(appid, "")

                        # Fallback to loaded_apps file if not in cache
                        if not game_name:
                            game_name = _get_loaded_app_name(appid)

                        # Only use "Unknown Game" as last resort - don't fetch from API
                        if not game_name:
                            game_name = f"Unknown Game ({appid})"

                        # Get file stats
                        file_path = os.path.join(target_dir, filename)
                        file_stat = os.stat(file_path)
                        file_size = file_stat.st_size

                        # Format date
                        import datetime
                        modified_time = datetime.datetime.fromtimestamp(file_stat.st_mtime)
                        formatted_date = modified_time.strftime("%Y-%m-%d %H:%M:%S")

                        script_info = {
                            "appid": appid,
                            "gameName": game_name,
                            "filename": filename,
                            "isDisabled": is_disabled,
                            "fileSize": file_size,
                            "modifiedDate": formatted_date,
                            "path": file_path
                        }

                        installed_scripts.append(script_info)

                    except ValueError:
                        # Not a numeric filename, skip
                        continue
                    except Exception as exc:
                        logger.warn(f"LuaTools: Failed to process Lua file {filename}: {exc}")
                        continue

        except Exception as exc:
            logger.warn(f"LuaTools: Failed to scan stplug-in directory: {exc}")
            return json.dumps({"success": False, "error": f"Failed to scan directory: {str(exc)}"})

        # Sort by appid
        installed_scripts.sort(key=lambda x: x["appid"])

        return json.dumps({"success": True, "scripts": installed_scripts})

    except Exception as exc:
        logger.warn(f"LuaTools: Failed to get installed Lua scripts: {exc}")
        return json.dumps({"success": False, "error": str(exc)})


__all__ = [
    "cancel_add_via_luatools",
    "delete_luatools_for_app",
    "dismiss_loaded_apps",
    "fetch_app_name",
    "get_add_status",
    "get_icon_data_url",
    "get_installed_lua_scripts",
    "has_luatools_for_app",
    "read_loaded_apps",
    "start_add_via_luatools",
]

