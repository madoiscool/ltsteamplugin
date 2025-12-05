"""Achievement fetching and display functionality - uses external SAM.CLI tool to interact with Steam."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Dict, List, Optional, Any

from logger import logger
from paths import get_plugin_dir


def _write_debug_log(message: str) -> None:
    """Write debug message to a local log file for easier debugging."""
    try:
        # Get backend dir from file path
        backend_dir = os.path.dirname(os.path.realpath(__file__))
        debug_log_path = os.path.join(backend_dir, "achievements_debug.log")
        import datetime
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(debug_log_path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass  # Don't fail if we can't write debug log


def _run_sam_cli(command: str, appid: int, *args) -> Dict[str, Any]:
    """
    Executes the SAM.CLI.exe tool with the given arguments.
    
    Args:
        command: The command to run (get-achievements, unlock, lock)
        appid: The AppID of the game
        *args: Additional arguments for the command
        
    Returns:
        Dict containing the JSON response from the CLI
    """
    try:
        plugin_dir = get_plugin_dir()
        sam_cli_path = os.path.join(plugin_dir, "vendor", "SAM", "SAM.CLI.exe")
        
        if not os.path.exists(sam_cli_path):
            error_msg = f"SAM.CLI.exe not found at: {sam_cli_path}"
            logger.warn(f"LuaTools: {error_msg}")
            _write_debug_log(f"ERROR: {error_msg}")
            return {"success": False, "error": "SAM.CLI tool not found. Please reinstall LuaTools."}
            
        cmd_args = [sam_cli_path, command, str(appid)]
        cmd_args.extend([str(arg) for arg in args])
        
        logger.log(f"LuaTools: Running SAM CLI: {' '.join(cmd_args)}")
        _write_debug_log(f"Running SAM CLI: {' '.join(cmd_args)}")
        
        # Run the process
        # CREATE_NO_WINDOW flag for Windows to avoid popping up a console window
        creationflags = 0x08000000 if sys.platform == "win32" else 0

        process = subprocess.Popen(
            cmd_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creationflags
        )

        stdout_bytes, stderr_bytes = process.communicate()

        # Handle encoding properly - SAM.CLI outputs in console encoding (CP850/CP1252 on Windows)
        # Python defaults to UTF-8, but console uses system locale
        try:
            if sys.platform == "win32":
                # Try CP850 first (Brazilian console), then fallback to CP1252, then UTF-8
                try:
                    stdout = stdout_bytes.decode('cp850')
                except UnicodeDecodeError:
                    try:
                        stdout = stdout_bytes.decode('cp1252')
                    except UnicodeDecodeError:
                        stdout = stdout_bytes.decode('utf-8', errors='replace')
            else:
                stdout = stdout_bytes.decode('utf-8')
        except Exception:
            stdout = stdout_bytes.decode('utf-8', errors='replace')

        stderr = stderr_bytes.decode('utf-8', errors='replace') if stderr_bytes else ""
        
        if stderr:
            _write_debug_log(f"SAM CLI STDERR: {stderr}")
            
        if stdout:
            try:
                # Find the last line that looks like JSON
                lines = stdout.strip().split('\n')
                json_str = ""
                
                # Sometimes there might be debug output before the JSON
                # We look for the start of the JSON object
                full_output = stdout.strip()
                json_start = full_output.find('{')
                json_end = full_output.rfind('}')
                
                if json_start != -1 and json_end != -1:
                    json_str = full_output[json_start:json_end+1]
                    return json.loads(json_str)
                else:
                    _write_debug_log(f"Could not find JSON in output: {stdout}")
                    return {"success": False, "error": "Invalid output from SAM CLI"}
            except json.JSONDecodeError as e:
                _write_debug_log(f"Failed to parse JSON: {e}, Output: {stdout}")
                return {"success": False, "error": "Failed to parse SAM CLI output"}
        
        return {"success": False, "error": "No output from SAM CLI"}
        
    except Exception as e:
        error_msg = f"Exception running SAM CLI: {str(e)}"
        logger.warn(f"LuaTools: {error_msg}")
        _write_debug_log(error_msg)
        import traceback
        _write_debug_log(traceback.format_exc())
        return {"success": False, "error": str(e)}


def get_player_achievements(appid: int) -> Dict:
    """
    Get player's unlocked achievements using SAM.CLI.
    """
    return _run_sam_cli("get-achievements", appid)


def unlock_achievement(appid: int, achievement_id: str) -> Dict:
    """
    Unlock an achievement using SAM.CLI.
    """
    return _run_sam_cli("unlock", appid, achievement_id)


def lock_achievement(appid: int, achievement_id: str) -> Dict:
    """
    Lock an achievement using SAM.CLI.
    """
    return _run_sam_cli("lock", appid, achievement_id)


def get_all_achievements_for_app(appid: int) -> Dict:
    """
    Get all achievements for an app using SAM.CLI.
    Note: get-achievements already returns all achievements with their status.
    """
    return _run_sam_cli("get-achievements", appid)


def import_achievements(appid: int, achievements_list: List) -> Dict:
    """
    Import achievements from a backup list.
    Only unlocks achievements marked as unlocked in the backup.
    """
    try:
        appid = int(appid)
        if not isinstance(achievements_list, list):
            return {"success": False, "error": "Achievements list must be an array"}

        # Detect format: list of objects (old) or list of IDs (new)
        if len(achievements_list) > 0:
            first_item = achievements_list[0]
            if isinstance(first_item, dict):
                # Old format: list of achievement objects
                unlocked_to_import = [ach for ach in achievements_list if ach.get("unlocked", False)]
                achievement_ids = [ach.get("id", "").strip() for ach in unlocked_to_import if ach.get("id", "").strip()]
            elif isinstance(first_item, str):
                # New format: list of achievement IDs (already filtered to unlocked only)
                achievement_ids = [ach_id.strip() for ach_id in achievements_list if ach_id.strip()]
                unlocked_to_import = [{"id": ach_id} for ach_id in achievement_ids]  # For counting
            else:
                return {"success": False, "error": "Invalid achievement list format"}
        else:
            return {"success": False, "error": "Achievements list is empty"}

        if not achievement_ids:
            return {"success": False, "error": "No unlocked achievements found in backup"}

        logger.log(f"LuaTools: Importing {len(achievement_ids)} unlocked achievements for appid {appid}")

        imported_count = 0
        failed_count = 0
        failed_list = []

        # Import each unlocked achievement with progress tracking (1 per second)
        import time
        for i, ach_id in enumerate(achievement_ids, 1):
            logger.log(f"LuaTools: Processing achievement {i}/{len(achievement_ids)}: {ach_id}")
            try:
                result = unlock_achievement(appid, ach_id)
                if result.get("success"):
                    imported_count += 1
                    logger.log(f"LuaTools: Successfully imported {ach_id} ({imported_count}/{len(achievement_ids)})")
                    _write_debug_log(f"Imported achievement: {ach_id}")
                else:
                    failed_count += 1
                    error_msg = result.get("error", "Unknown error")
                    failed_list.append(f"{ach_id}: {error_msg}")
                    logger.log(f"LuaTools: Failed to import {ach_id}: {error_msg}")
                    _write_debug_log(f"Failed to import {ach_id}: {error_msg}")
            except Exception as exc:
                failed_count += 1
                failed_list.append(f"{ach_id}: Exception - {str(exc)}")
                logger.log(f"LuaTools: Exception importing {ach_id}: {exc}")
                _write_debug_log(f"Exception importing {ach_id}: {exc}")

            # Wait 1 second between achievements for better progress visibility
            if i < len(achievement_ids):  # Don't wait after the last one
                time.sleep(1)

        result_msg = f"Imported {imported_count} achievement(s)"
        if failed_count > 0:
            result_msg += f", {failed_count} failed"

        response = {
            "success": imported_count > 0,
            "imported": imported_count,
            "failed": failed_count,
            "total_attempted": len(achievement_ids),
            "message": result_msg
        }

        if failed_list:
            response["failed_details"] = failed_list[:10]  # Limit to first 10 failures

        logger.log(f"LuaTools: Import completed: {result_msg}")
        return response

    except Exception as exc:
        error_msg = f"Failed to import achievements: {exc}"
        logger.warn(f"LuaTools: {error_msg}")
        _write_debug_log(f"EXCEPTION: {error_msg}")
        import traceback
        _write_debug_log(f"Traceback: {traceback.format_exc()}")
        return {"success": False, "error": str(exc)}


def get_achievements_for_app(appid: int) -> str:
    """Wrapper function to return JSON string."""
    result = get_player_achievements(appid)
    return json.dumps(result)
