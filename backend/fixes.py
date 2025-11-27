"""Game fix lookup, application, and removal logic."""

from __future__ import annotations

import json
import os
import threading
import zipfile
from datetime import datetime
from typing import Dict, Optional

from downloads import fetch_app_name
from http_client import ensure_http_client
from logger import logger
from utils import ensure_temp_download_dir
from steam_utils import get_game_install_path_response

FIX_DOWNLOAD_STATE: Dict[int, Dict[str, any]] = {}
FIX_DOWNLOAD_LOCK = threading.Lock()
UNFIX_STATE: Dict[int, Dict[str, any]] = {}
UNFIX_LOCK = threading.Lock()


def _set_fix_download_state(appid: int, update: dict) -> None:
    with FIX_DOWNLOAD_LOCK:
        state = FIX_DOWNLOAD_STATE.get(appid) or {}
        state.update(update)
        FIX_DOWNLOAD_STATE[appid] = state


def _get_fix_download_state(appid: int) -> dict:
    with FIX_DOWNLOAD_LOCK:
        return FIX_DOWNLOAD_STATE.get(appid, {}).copy()


def _set_unfix_state(appid: int, update: dict) -> None:
    with UNFIX_LOCK:
        state = UNFIX_STATE.get(appid) or {}
        state.update(update)
        UNFIX_STATE[appid] = state


def _get_unfix_state(appid: int) -> dict:
    with UNFIX_LOCK:
        return UNFIX_STATE.get(appid, {}).copy()


def check_for_fixes(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    client = ensure_http_client("LuaTools: CheckForFixes")
    result = {
        "success": True,
        "appid": appid,
        "gameName": "",
        "genericFix": {"status": 0, "available": False},
        "onlineFix": {"status": 0, "available": False},
    }

    try:
        result["gameName"] = fetch_app_name(appid) or f"Unknown Game ({appid})"
    except Exception as exc:
        logger.warn(f"LuaTools: Failed to fetch game name for {appid}: {exc}")
        result["gameName"] = f"Unknown Game ({appid})"

    try:
        generic_url = f"https://github.com/ShayneVi/Bypasses/releases/download/v1.0/{appid}.zip"
        resp = client.head(generic_url, follow_redirects=True, timeout=10)
        result["genericFix"]["status"] = resp.status_code
        result["genericFix"]["available"] = resp.status_code == 200
        if resp.status_code == 200:
            result["genericFix"]["url"] = generic_url
        logger.log(f"LuaTools: Generic fix check for {appid} -> {resp.status_code}")
    except Exception as exc:
        logger.warn(f"LuaTools: Generic fix check failed for {appid}: {exc}")

    online_urls = [
        f"https://github.com/ShayneVi/OnlineFix1/releases/download/fixes/{appid}.zip",
        f"https://github.com/ShayneVi/OnlineFix2/releases/download/fixes/{appid}.zip",
    ]

    for online_url in online_urls:
        try:
            resp = client.head(online_url, follow_redirects=True, timeout=10)
            logger.log(f"LuaTools: Online-fix check ({online_url}) for {appid} -> {resp.status_code}")
            if resp.status_code == 200:
                result["onlineFix"]["status"] = resp.status_code
                result["onlineFix"]["available"] = True
                result["onlineFix"]["url"] = online_url
                break
            elif result["onlineFix"]["status"] == 0:
                result["onlineFix"]["status"] = resp.status_code
        except Exception as exc:
            logger.warn(f"LuaTools: Online-fix check failed for {online_url}: {exc}")
            if result["onlineFix"]["status"] == 0:
                result["onlineFix"]["status"] = 0

    return json.dumps(result)


def _download_and_extract_fix(appid: int, download_url: str, install_path: str, fix_type: str, game_name: str = ""):
    client = ensure_http_client("LuaTools: fix download")
    try:
        dest_root = ensure_temp_download_dir()
        dest_zip = os.path.join(dest_root, f"fix_{appid}.zip")
        _set_fix_download_state(appid, {"status": "downloading", "bytesRead": 0, "totalBytes": 0, "error": None})

        logger.log(f"LuaTools: Downloading {fix_type} from {download_url}")

        with client.stream("GET", download_url, follow_redirects=True, timeout=30) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("Content-Length", "0") or "0")
            _set_fix_download_state(appid, {"totalBytes": total})

            with open(dest_zip, "wb") as output:
                for chunk in resp.iter_bytes():
                    if not chunk:
                        continue
                    state = _get_fix_download_state(appid)
                    if state.get("status") == "cancelled":
                        logger.log(f"LuaTools: Fix download cancelled before writing chunk for {appid}")
                        raise RuntimeError("cancelled")
                    output.write(chunk)
                    read = int(state.get("bytesRead", 0)) + len(chunk)
                    _set_fix_download_state(appid, {"bytesRead": read})
                    if _get_fix_download_state(appid).get("status") == "cancelled":
                        logger.log(f"LuaTools: Fix download cancelled for {appid}")
                        raise RuntimeError("cancelled")

        logger.log(f"LuaTools: Download complete, extracting to {install_path}")
        _set_fix_download_state(appid, {"status": "extracting"})

        extracted_files = []
        with zipfile.ZipFile(dest_zip, "r") as archive:
            all_names = archive.namelist()
            appid_folder = f"{appid}/"

            top_level_entries = set()
            for name in all_names:
                parts = name.split("/")
                if parts[0]:
                    top_level_entries.add(parts[0])
            if _get_fix_download_state(appid).get("status") == "cancelled":
                logger.log(f"LuaTools: Fix extraction cancelled before start for {appid}")
                raise RuntimeError("cancelled")

            if len(top_level_entries) == 1 and appid_folder.rstrip("/") in top_level_entries:
                logger.log(f"LuaTools: Found single folder {appid} in zip, extracting its contents")
                for member in archive.namelist():
                    if member.startswith(appid_folder) and member != appid_folder:
                        target_path = member[len(appid_folder):]
                        if not target_path:
                            continue
                        source = archive.open(member)
                        target = os.path.join(install_path, target_path)
                        os.makedirs(os.path.dirname(target), exist_ok=True)
                        if not member.endswith("/"):
                            with open(target, "wb") as output:
                                output.write(source.read())
                            extracted_files.append(target_path.replace("\\", "/"))
                        source.close()
                        if _get_fix_download_state(appid).get("status") == "cancelled":
                            logger.log(f"LuaTools: Fix extraction cancelled mid-process for {appid}")
                            raise RuntimeError("cancelled")
            else:
                logger.log(f"LuaTools: Extracting all zip contents to {install_path}")
                for member in archive.namelist():
                    if member.endswith("/"):
                        continue
                    archive.extract(member, install_path)
                    extracted_files.append(member.replace("\\", "/"))
                    if _get_fix_download_state(appid).get("status") == "cancelled":
                        logger.log(f"LuaTools: Fix extraction cancelled mid-process for {appid}")
                        raise RuntimeError("cancelled")

        if _get_fix_download_state(appid).get("status") == "cancelled":
            logger.log(f"LuaTools: Fix cancelled after extraction for {appid}")
            raise RuntimeError("cancelled")

        ini_relative_path = None
        for rel_path in extracted_files:
            if rel_path.replace("\\", "/").lower().endswith("unsteam.ini"):
                ini_relative_path = rel_path
                break

        if fix_type.lower() == "online fix (unsteam)":
            try:
                if ini_relative_path:
                    ini_full_path = os.path.join(install_path, ini_relative_path.replace("/", os.sep))
                    if os.path.exists(ini_full_path):
                        with open(ini_full_path, "r", encoding="utf-8", errors="ignore") as ini_file:
                            contents = ini_file.read()
                        updated_contents = contents.replace("<appid>", str(appid))
                        if updated_contents != contents:
                            with open(ini_full_path, "w", encoding="utf-8") as ini_file:
                                ini_file.write(updated_contents)
                            logger.log(f"LuaTools: Updated unsteam.ini with appid {appid}")
                        else:
                            logger.log("LuaTools: unsteam.ini did not contain <appid> placeholder or was already updated")
                    else:
                        logger.warn(f"LuaTools: Expected unsteam.ini at {ini_full_path} but file not found")
                else:
                    logger.warn("LuaTools: Extracted files do not include unsteam.ini for Online Fix (Unsteam)")
            except Exception as exc:
                logger.warn(f"LuaTools: Failed to update unsteam.ini: {exc}")

        log_file_path = os.path.join(install_path, f"luatools-fix-log-{appid}.log")
        try:
            # Read existing log to preserve previous fixes
            existing_content = ""
            if os.path.exists(log_file_path):
                try:
                    with open(log_file_path, "r", encoding="utf-8") as log_file:
                        existing_content = log_file.read()
                except Exception:
                    pass

            # Append new fix entry
            with open(log_file_path, "w", encoding="utf-8") as log_file:
                # Write existing content first
                if existing_content:
                    log_file.write(existing_content)
                    if not existing_content.endswith("\n"):
                        log_file.write("\n")
                    log_file.write("\n---\n\n")  # Separator between fixes

                # Write new fix entry
                log_file.write(f'[FIX]\n')
                log_file.write(f'Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
                log_file.write(f'Game: {game_name or f"Unknown Game ({appid})"}\n')
                log_file.write(f"Fix Type: {fix_type}\n")
                log_file.write(f"Download URL: {download_url}\n")
                log_file.write("Files:\n")
                for file_path in extracted_files:
                    log_file.write(f"{file_path}\n")
                log_file.write("[/FIX]\n")

            logger.log(f"LuaTools: Appended fix log at {log_file_path} with {len(extracted_files)} files")
        except Exception as exc:
            logger.warn(f"LuaTools: Failed to create fix log file: {exc}")

        logger.log(f"LuaTools: {fix_type} applied successfully to {install_path}")
        _set_fix_download_state(appid, {"status": "done", "success": True})

        try:
            os.remove(dest_zip)
        except Exception:
            pass

    except Exception as exc:
        if str(exc) == "cancelled":
            try:
                if os.path.exists(dest_zip):
                    os.remove(dest_zip)
            except Exception:
                pass
            _set_fix_download_state(appid, {"status": "cancelled", "success": False, "error": "Cancelled by user"})
            return
        logger.warn(f"LuaTools: Failed to apply fix: {exc}")
        _set_fix_download_state(appid, {"status": "failed", "error": str(exc)})


def apply_game_fix(appid: int, download_url: str, install_path: str, fix_type: str = "", game_name: str = "") -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    if not download_url or not install_path:
        return json.dumps({"success": False, "error": "Missing download URL or install path"})

    if not os.path.exists(install_path):
        return json.dumps({"success": False, "error": "Install path does not exist"})

    logger.log(f"LuaTools: ApplyGameFix appid={appid}, fixType={fix_type}")

    _set_fix_download_state(appid, {"status": "queued", "bytesRead": 0, "totalBytes": 0, "error": None})
    thread = threading.Thread(
        target=_download_and_extract_fix, args=(appid, download_url, install_path, fix_type, game_name), daemon=True
    )
    thread.start()

    return json.dumps({"success": True})


def get_apply_fix_status(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    state = _get_fix_download_state(appid)
    return json.dumps({"success": True, "state": state})
 
 
def cancel_apply_fix(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    state = _get_fix_download_state(appid)
    if not state or state.get("status") in {"done", "failed"}:
        return json.dumps({"success": True, "message": "Nothing to cancel"})

    _set_fix_download_state(appid, {"status": "cancelled", "success": False, "error": "Cancelled by user"})
    logger.log(f"LuaTools: CancelApplyFix requested for appid={appid}")
    return json.dumps({"success": True})


def _unfix_game_worker(appid: int, install_path: str, fix_date: str = None):
    try:
        logger.log(f"LuaTools: Starting un-fix for appid {appid}, fix_date={fix_date}")
        log_file_path = os.path.join(install_path, f"luatools-fix-log-{appid}.log")

        if not os.path.exists(log_file_path):
            _set_unfix_state(appid, {"status": "failed", "error": "No fix log found. Cannot un-fix."})
            return

        _set_unfix_state(appid, {"status": "removing", "progress": "Reading log file..."})

        files_to_delete = set()  # Use set to avoid duplicates
        remaining_fixes = []  # Fixes to keep in the log

        try:
            with open(log_file_path, "r", encoding="utf-8") as handle:
                log_content = handle.read()

            # Parse multiple fixes (new format with [FIX] markers)
            if "[FIX]" in log_content:
                # New format with multiple fixes
                fix_blocks = log_content.split("[FIX]")
                for block in fix_blocks:
                    if not block.strip():
                        continue

                    lines = block.split("\n")
                    in_files_section = False
                    block_date = None
                    block_lines = []  # Store original block content

                    for line in lines:
                        line_stripped = line.strip()
                        if line_stripped == "[/FIX]" or line_stripped == "---":
                            break
                        if line_stripped.startswith("Date:"):
                            block_date = line_stripped.replace("Date:", "").strip()

                        block_lines.append(line)

                        if line_stripped == "Files:":
                            in_files_section = True
                        elif in_files_section and line_stripped:
                            # If we're deleting a specific fix, only add files from that fix
                            if fix_date is None or (block_date and block_date == fix_date):
                                files_to_delete.add(line_stripped)

                    # If we're deleting a specific fix, keep the others
                    if fix_date is not None and block_date and block_date != fix_date:
                        remaining_fixes.append("[FIX]\n" + "\n".join(block_lines) + "\n[/FIX]")
            else:
                # Old format (single fix without markers) - legacy support
                # Delete all files (no individual selection possible)
                lines = log_content.split("\n")
                in_files_section = False
                for line in lines:
                    line = line.strip()
                    if line == "Files:":
                        in_files_section = True
                    elif in_files_section and line:
                        files_to_delete.add(line)

            logger.log(f"LuaTools: Found {len(files_to_delete)} unique files to remove from log")
        except Exception as exc:
            logger.warn(f"LuaTools: Failed to read log file: {exc}")
            _set_unfix_state(appid, {"status": "failed", "error": f"Failed to read log file: {str(exc)}"})
            return

        _set_unfix_state(appid, {"status": "removing", "progress": f"Removing {len(files_to_delete)} files..."})
        deleted_count = 0
        for file_path in files_to_delete:
            try:
                full_path = os.path.join(install_path, file_path)
                if os.path.exists(full_path):
                    os.remove(full_path)
                    deleted_count += 1
                    logger.log(f"LuaTools: Deleted {file_path}")
            except Exception as exc:
                logger.warn(f"LuaTools: Failed to delete {file_path}: {exc}")

        logger.log(f"LuaTools: Deleted {deleted_count}/{len(files_to_delete)} files")

        # Update or delete the log file
        if remaining_fixes:
            # We deleted a specific fix, update the log with remaining fixes
            try:
                with open(log_file_path, "w", encoding="utf-8") as handle:
                    handle.write("\n\n---\n\n".join(remaining_fixes))
                logger.log(f"LuaTools: Updated log file, {len(remaining_fixes)} fixes remaining")
            except Exception as exc:
                logger.warn(f"LuaTools: Failed to update log file: {exc}")
        else:
            # No fixes remaining, delete the log file
            try:
                os.remove(log_file_path)
                logger.log(f"LuaTools: Deleted log file {log_file_path}")
            except Exception as exc:
                logger.warn(f"LuaTools: Failed to delete log file: {exc}")

        _set_unfix_state(appid, {"status": "done", "success": True, "filesRemoved": deleted_count})

    except Exception as exc:
        logger.warn(f"LuaTools: Un-fix failed: {exc}")
        _set_unfix_state(appid, {"status": "failed", "error": str(exc)})


def unfix_game(appid: int, install_path: str = "", fix_date: str = "") -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    resolved_path = install_path
    if not resolved_path:
        try:
            result = get_game_install_path_response(appid)
            if not result.get("success") or not result.get("installPath"):
                return json.dumps({"success": False, "error": "Could not find game install path"})
            resolved_path = result["installPath"]
        except Exception as exc:
            return json.dumps({"success": False, "error": f"Failed to get install path: {str(exc)}"})

    if not os.path.exists(resolved_path):
        return json.dumps({"success": False, "error": "Install path does not exist"})

    logger.log(f"LuaTools: UnFixGame appid={appid}, path={resolved_path}, fix_date={fix_date}")

    _set_unfix_state(appid, {"status": "queued", "progress": "", "error": None})
    thread = threading.Thread(target=_unfix_game_worker, args=(appid, resolved_path, fix_date or None), daemon=True)
    thread.start()

    return json.dumps({"success": True})


def get_unfix_status(appid: int) -> str:
    try:
        appid = int(appid)
    except Exception:
        return json.dumps({"success": False, "error": "Invalid appid"})

    state = _get_unfix_state(appid)
    return json.dumps({"success": True, "state": state})


def get_installed_fixes() -> str:
    """Scan all Steam library folders for games with luatools fix logs."""
    try:
        from steam_utils import _find_steam_path, _parse_vdf_simple

        steam_path = _find_steam_path()
        if not steam_path:
            return json.dumps({"success": False, "error": "Could not find Steam installation path"})

        library_vdf_path = os.path.join(steam_path, "config", "libraryfolders.vdf")
        if not os.path.exists(library_vdf_path):
            return json.dumps({"success": False, "error": "Could not find libraryfolders.vdf"})

        try:
            with open(library_vdf_path, "r", encoding="utf-8") as handle:
                vdf_content = handle.read()
            library_data = _parse_vdf_simple(vdf_content)
        except Exception as exc:
            logger.warn(f"LuaTools: Failed to parse libraryfolders.vdf: {exc}")
            return json.dumps({"success": False, "error": "Failed to parse libraryfolders.vdf"})

        library_folders = library_data.get("libraryfolders", {})
        all_library_paths = []

        for folder_data in library_folders.values():
            if isinstance(folder_data, dict):
                folder_path = folder_data.get("path", "")
                if folder_path:
                    folder_path = folder_path.replace("\\\\", "\\")
                    all_library_paths.append(folder_path)

        installed_fixes = []

        for lib_path in all_library_paths:
            steamapps_path = os.path.join(lib_path, "steamapps")
            if not os.path.exists(steamapps_path):
                continue

            # Get all appmanifest files
            try:
                for filename in os.listdir(steamapps_path):
                    if not filename.startswith("appmanifest_") or not filename.endswith(".acf"):
                        continue

                    # Extract appid from filename
                    try:
                        appid_str = filename.replace("appmanifest_", "").replace(".acf", "")
                        appid = int(appid_str)
                    except Exception:
                        continue

                    # Parse manifest to get install directory
                    manifest_path = os.path.join(steamapps_path, filename)
                    try:
                        with open(manifest_path, "r", encoding="utf-8") as handle:
                            manifest_content = handle.read()
                        manifest_data = _parse_vdf_simple(manifest_content)
                        app_state = manifest_data.get("AppState", {})
                        install_dir = app_state.get("installdir", "")
                        game_name = app_state.get("name", f"Unknown Game ({appid})")

                        if not install_dir:
                            continue

                        full_install_path = os.path.join(lib_path, "steamapps", "common", install_dir)
                        if not os.path.exists(full_install_path):
                            continue

                        # Check for luatools fix log
                        log_file_path = os.path.join(full_install_path, f"luatools-fix-log-{appid}.log")
                        if os.path.exists(log_file_path):
                            # Parse the log file to get fix info (supports multiple fixes)
                            try:
                                with open(log_file_path, "r", encoding="utf-8") as log_handle:
                                    log_content = log_handle.read()

                                # Parse multiple fixes (new format with [FIX] markers)
                                fixes_in_log = []
                                if "[FIX]" in log_content:
                                    # New format with multiple fixes
                                    fix_blocks = log_content.split("[FIX]")
                                    for block in fix_blocks:
                                        if not block.strip():
                                            continue

                                        # Extract data from this fix block
                                        fix_data = {
                                            "appid": appid,
                                            "gameName": game_name,
                                            "installPath": full_install_path,
                                            "date": "",
                                            "fixType": "",
                                            "downloadUrl": "",
                                            "filesCount": 0,
                                            "files": []
                                        }

                                        lines = block.split("\n")
                                        in_files_section = False

                                        for line in lines:
                                            line = line.strip()
                                            if line == "[/FIX]" or line == "---":
                                                break
                                            if line.startswith("Date:"):
                                                fix_data["date"] = line.replace("Date:", "").strip()
                                            elif line.startswith("Game:"):
                                                log_game_name = line.replace("Game:", "").strip()
                                                if log_game_name and log_game_name != f"Unknown Game ({appid})":
                                                    fix_data["gameName"] = log_game_name
                                            elif line.startswith("Fix Type:"):
                                                fix_data["fixType"] = line.replace("Fix Type:", "").strip()
                                            elif line.startswith("Download URL:"):
                                                fix_data["downloadUrl"] = line.replace("Download URL:", "").strip()
                                            elif line == "Files:":
                                                in_files_section = True
                                            elif in_files_section and line:
                                                fix_data["files"].append(line)

                                        fix_data["filesCount"] = len(fix_data["files"])
                                        if fix_data["date"]:  # Only add if it has a date (valid fix)
                                            fixes_in_log.append(fix_data)
                                else:
                                    # Old format (single fix without markers) - legacy support
                                    log_lines = log_content.split("\n")
                                    fix_data = {
                                        "appid": appid,
                                        "gameName": game_name,
                                        "installPath": full_install_path,
                                        "date": "",
                                        "fixType": "",
                                        "downloadUrl": "",
                                        "filesCount": 0,
                                        "files": []
                                    }

                                    in_files_section = False
                                    for line in log_lines:
                                        line = line.strip()
                                        if line.startswith("Date:"):
                                            fix_data["date"] = line.replace("Date:", "").strip()
                                        elif line.startswith("Game:"):
                                            log_game_name = line.replace("Game:", "").strip()
                                            if log_game_name and log_game_name != f"Unknown Game ({appid})":
                                                fix_data["gameName"] = log_game_name
                                        elif line.startswith("Fix Type:"):
                                            fix_data["fixType"] = line.replace("Fix Type:", "").strip()
                                        elif line.startswith("Download URL:"):
                                            fix_data["downloadUrl"] = line.replace("Download URL:", "").strip()
                                        elif line == "Files:":
                                            in_files_section = True
                                        elif in_files_section and line:
                                            fix_data["files"].append(line)

                                    fix_data["filesCount"] = len(fix_data["files"])
                                    if fix_data["date"]:
                                        fixes_in_log.append(fix_data)

                                # Add all fixes found for this game
                                for fix in fixes_in_log:
                                    installed_fixes.append(fix)

                            except Exception as exc:
                                logger.warn(f"LuaTools: Failed to parse fix log for {appid}: {exc}")

                    except Exception as exc:
                        logger.warn(f"LuaTools: Failed to process manifest {filename}: {exc}")
                        continue

            except Exception as exc:
                logger.warn(f"LuaTools: Failed to scan library {lib_path}: {exc}")
                continue

        return json.dumps({"success": True, "fixes": installed_fixes})

    except Exception as exc:
        logger.warn(f"LuaTools: Failed to get installed fixes: {exc}")
        return json.dumps({"success": False, "error": str(exc)})


__all__ = [
    "apply_game_fix",
    "cancel_apply_fix",
    "check_for_fixes",
    "get_apply_fix_status",
    "get_installed_fixes",
    "get_unfix_status",
    "unfix_game",
]

