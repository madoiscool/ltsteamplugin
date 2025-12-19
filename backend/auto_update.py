"""Auto-update utilities for the LuaTools backend."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import zipfile
from typing import Any, Dict, Optional

from api_manifest import store_last_message
from config import (
    UPDATE_CHECK_INTERVAL_SECONDS,
    UPDATE_CONFIG_FILE,
    UPDATE_PENDING_INFO,
    UPDATE_PENDING_ZIP,
)
from http_client import ensure_http_client, get_http_client
from logger import logger
from paths import backend_path, get_plugin_dir
from steam_utils import detect_steam_install_path
from utils import (
    get_plugin_version,
    parse_version,
    read_json,
    write_json,
)

_UPDATE_CHECK_THREAD: Optional[threading.Thread] = None


def apply_pending_update_if_any() -> str:
    """Extract a pending update zip if present. Returns a message or empty string."""
    pending_zip = backend_path(UPDATE_PENDING_ZIP)
    pending_info = backend_path(UPDATE_PENDING_INFO)
    if not os.path.exists(pending_zip):
        return ""

    try:
        logger.log(f"AutoUpdate: Applying pending update from {pending_zip}")
        with zipfile.ZipFile(pending_zip, "r") as archive:
            archive.extractall(get_plugin_dir())
        try:
            os.remove(pending_zip)
        except Exception:
            pass

        info = read_json(pending_info)
        try:
            os.remove(pending_info)
        except Exception:
            pass

        new_version = str(info.get("version", "")) if isinstance(info, dict) else ""
        if new_version:
            return f"LuaTools updated to {new_version}. Please restart Steam."
        return "LuaTools update applied. Please restart Steam."
    except Exception as exc:
        logger.warn(f"AutoUpdate: Failed to apply pending update: {exc}")
        return ""


def _fetch_github_latest(cfg: Dict[str, Any]) -> Dict[str, Any]:
    owner = str(cfg.get("owner", "")).strip()
    repo = str(cfg.get("repo", "")).strip()
    asset_name = str(cfg.get("asset_name", "ltsteamplugin.zip")).strip()
    tag = str(cfg.get("tag", "")).strip()
    tag_prefix = str(cfg.get("tag_prefix", "")).strip()
    token = str(cfg.get("token", "")).strip()

    if not owner or not repo:
        logger.warn("AutoUpdate: github config missing owner or repo")
        return {}

    client = ensure_http_client("AutoUpdate: GitHub")
    endpoint = f"https://api.github.com/repos/{owner}/{repo}/releases/latest"
    if tag:
        endpoint = f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}"

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "LuaTools-Updater",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data: Optional[Dict[str, Any]] = None
    tag_name = ""

    # Primary GitHub API
    try:
        logger.log(f"AutoUpdate: Fetching GitHub release from {endpoint}")
        resp = client.get(endpoint, headers=headers, follow_redirects=True)
        logger.log(f"AutoUpdate: GitHub API response: status={resp.status_code}")
        resp.raise_for_status()
        data = resp.json()
        tag_name = str(data.get("tag_name", "")).strip()
        logger.log("AutoUpdate: GitHub API request successful")
    except Exception as api_err:
        logger.warn(f"AutoUpdate: GitHub API failed ({api_err}), trying proxy...")
        try:
            proxy_url = "https://luatools.vercel.app/api/github-latest"
            logger.log(f"AutoUpdate: Fetching GitHub release from proxy {proxy_url}")
            resp = client.get(proxy_url, follow_redirects=True, timeout=15)
            logger.log(f"AutoUpdate: Proxy GitHub API response: status={resp.status_code}")
            resp.raise_for_status()
            data = resp.json()
            tag_name = str(data.get("tag_name", "")).strip()
            logger.log("AutoUpdate: Proxy GitHub request successful")
        except Exception as proxy_err:
            logger.warn(f"AutoUpdate: Proxy request failed ({proxy_err})")
            return {}

    if not data:
        return {}

    version = tag_name or str(data.get("name", "")).strip()
    if tag_prefix and version.startswith(tag_prefix):
        version = version[len(tag_prefix) :]

    zip_url = ""

    try:
        assets = data.get("assets", [])
        if isinstance(assets, list):
            for asset in assets:
                a_name = str(asset.get("name", "")).strip()
                if a_name == asset_name:
                    zip_url = str(asset.get("browser_download_url", "")).strip()
                    break
    except Exception:
        pass

    if not zip_url and tag_name:
        zip_url = f"https://luatools.vercel.app/api/get-plugin/{tag_name}"
        logger.log(f"AutoUpdate: Using proxy download URL: {zip_url}")

    if not zip_url:
        logger.warn("AutoUpdate: No download URL found")
        return {}

    return {"version": version, "zip_url": zip_url}


def _download_and_extract_update(zip_url: str, pending_zip: str) -> bool:
    client = ensure_http_client("AutoUpdate: download")
    try:
        logger.log(f"AutoUpdate: Downloading {zip_url} -> {pending_zip}")
        with client.stream("GET", zip_url, follow_redirects=True) as response:
            logger.log(f"AutoUpdate: Update download response: status={response.status_code}")
            response.raise_for_status()
            with open(pending_zip, "wb") as output:
                for chunk in response.iter_bytes():
                    if chunk:
                        output.write(chunk)
        return True
    except Exception as exc:
        logger.warn(f"AutoUpdate: Failed to download update: {exc}")
        return False


def check_for_update_once() -> str:
    """Check remote manifest (if configured) and download a newer version.
    Returns a message for the user if an update was downloaded/applied."""
    client = ensure_http_client("AutoUpdate")
    cfg_path = backend_path(UPDATE_CONFIG_FILE)
    cfg = read_json(cfg_path)

    latest_version = ""
    zip_url = ""

    gh_cfg = cfg.get("github")
    if isinstance(gh_cfg, dict):
        manifest = _fetch_github_latest(gh_cfg)
        latest_version = str(manifest.get("version", "")).strip()
        zip_url = str(manifest.get("zip_url", "")).strip()
    else:
        manifest_url = str(cfg.get("manifest_url", "")).strip()
        if not manifest_url:
            return ""
        try:
            logger.log(f"AutoUpdate: Fetching manifest {manifest_url}")
            resp = client.get(manifest_url, follow_redirects=True)
            resp.raise_for_status()
            manifest = resp.json()
            latest_version = str(manifest.get("version", "")).strip()
            zip_url = str(manifest.get("zip_url", "")).strip()
        except Exception as exc:
            logger.warn(f"AutoUpdate: Failed to fetch manifest: {exc}")
            return ""

    if not latest_version or not zip_url:
        logger.warn("AutoUpdate: Manifest missing version or zip_url")
        return ""

    current_version = get_plugin_version()
    if parse_version(latest_version) <= parse_version(current_version):
        logger.log(
            f"AutoUpdate: Up-to-date (current {current_version}, latest {latest_version})"
        )
        return ""

    pending_zip = backend_path(UPDATE_PENDING_ZIP)
    pending_info = backend_path(UPDATE_PENDING_INFO)

    if not _download_and_extract_update(zip_url, pending_zip):
        return ""

    # Attempt to extract immediately
    try:
        with zipfile.ZipFile(pending_zip, "r") as archive:
            archive.extractall(get_plugin_dir())
        try:
            os.remove(pending_zip)
        except Exception:
            pass
        logger.log("AutoUpdate: Update extracted; will take effect after restart")
        return f"LuaTools updated to {latest_version}. Please restart Steam."
    except Exception as extract_err:
        logger.warn(
            f"AutoUpdate: Extraction failed, will apply on next start: {extract_err}"
        )
        write_json(pending_info, {"version": latest_version, "zip_url": zip_url})
        logger.log("AutoUpdate: Update downloaded and queued for apply on next start")
        return f"Update {latest_version} downloaded. Restart Steam to apply."


def _periodic_update_check_worker():
    while True:
        try:
            time.sleep(UPDATE_CHECK_INTERVAL_SECONDS)
            logger.log("AutoUpdate: Running periodic background check...")
            message = check_for_update_once()
            if message:
                store_last_message(message)
                logger.log(f"AutoUpdate: Periodic check found update: {message}")
        except Exception as exc:
            logger.warn(f"AutoUpdate: Periodic check failed: {exc}")


def _start_periodic_update_checks():
    global _UPDATE_CHECK_THREAD
    if _UPDATE_CHECK_THREAD is None or not _UPDATE_CHECK_THREAD.is_alive():
        _UPDATE_CHECK_THREAD = threading.Thread(
            target=_periodic_update_check_worker, daemon=True
        )
        _UPDATE_CHECK_THREAD.start()
        logger.log(
            f"AutoUpdate: Started periodic update check thread (every {UPDATE_CHECK_INTERVAL_SECONDS / 3600} hours)"
        )


def _check_and_donate_keys() -> None:
    """Check donateKeys setting and send keys if enabled."""
    try:
        from donate_keys import extract_valid_decryption_keys, send_donation_keys
        from settings.manager import _get_values_locked
        
        values = _get_values_locked()
        general = values.get("general", {})
        donate_keys_enabled = general.get("donateKeys", False)
        
        if not donate_keys_enabled:
            return
        
        steam_path = detect_steam_install_path()
        if not steam_path:
            logger.warn("LuaTools: Cannot donate keys - Steam path not found")
            return
        
        pairs = extract_valid_decryption_keys(steam_path)
        if pairs:
            send_donation_keys(pairs)
        else:
            logger.log("LuaTools: No valid keys found to donate")
            
    except Exception as exc:
        logger.warn(f"LuaTools: Donate keys check failed: {exc}")


def _start_initial_check_worker():
    try:
        message = check_for_update_once()
        if message:
            store_last_message(message)
            logger.log(
                f"AutoUpdate: Initial check found update: {message}. Auto-restarting Steam..."
            )
            time.sleep(2)
            restart_steam_internal()
        else:
            _start_periodic_update_checks()
        
        # Check and donate keys after update check completes
        _check_and_donate_keys()
    except Exception as exc:
        logger.warn(f"AutoUpdate: background check failed: {exc}")
        try:
            _start_periodic_update_checks()
        except Exception:
            pass


def start_auto_update_background_check() -> None:
    """Kick off the initial check in a background thread."""
    threading.Thread(target=_start_initial_check_worker, daemon=True).start()


def restart_steam_internal() -> bool:
    """Internal helper used to restart Steam via bundled script."""
    script_path = backend_path("restart_steam.cmd")
    if not os.path.exists(script_path):
        logger.error(f"LuaTools: restart script not found: {script_path}")
        return False
    try:
        CREATE_NO_WINDOW = 0x08000000
        subprocess.Popen(["cmd", "/C", script_path], creationflags=CREATE_NO_WINDOW)
        logger.log("LuaTools: Restart script launched (hidden)")
        return True
    except Exception as exc:
        logger.error(f"LuaTools: Failed to launch restart script: {exc}")
        return False


def restart_steam() -> bool:
    """Public method exposed to the frontend."""
    return restart_steam_internal()


def check_for_updates_now() -> Dict[str, Any]:
    """Expose a synchronous update check for the frontend."""
    try:
        message = check_for_update_once()
        if message:
            store_last_message(message)
        return {"success": True, "message": message}
    except Exception as exc:
        logger.warn(f"LuaTools: CheckForUpdatesNow failed: {exc}")
        return {"success": False, "error": str(exc)}


__all__ = [
    "apply_pending_update_if_any",
    "check_for_update_once",
    "check_for_updates_now",
    "restart_steam",
    "restart_steam_internal",
    "start_auto_update_background_check",
]

