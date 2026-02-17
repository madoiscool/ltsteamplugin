"""Backup and restore functionality for Steam configuration folders."""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from logger import logger
from paths import backend_path

BACKUP_LOCK = threading.Lock()

# Folders to backup
FOLDERS_TO_BACKUP = [
    "C:\\Program Files (x86)\\Steam\\config\\depotcache",
    "C:\\Program Files (x86)\\Steam\\config\\stplug-in",
]


def _get_backup_dir() -> str:
    """Get the backup directory path (user's Downloads folder)."""
    try:
        # Get user's Downloads folder
        downloads_path = str(Path.home() / "Downloads" / "LuaTools Backups")
        os.makedirs(downloads_path, exist_ok=True)
        return downloads_path
    except Exception as e:
        logger.error(f"Failed to get Downloads folder: {e}")
        # Fallback to plugin backup dir if Downloads fails
        backup_path = backend_path("backups")
        os.makedirs(backup_path, exist_ok=True)
        return backup_path


def _get_timestamp() -> str:
    """Get current timestamp for backup naming."""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def create_backup(backup_name: str = "", destination: str = "") -> Dict[str, Any]:
    """Create a backup of Steam config folders.
    
    Args:
        backup_name: Optional name for the backup (default: timestamp)
        destination: Optional destination path (default: plugin backup dir)
    
    Returns:
        Dict with success status and backup info
    """
    try:
        if not backup_name:
            backup_name = f"steam_config_backup_{_get_timestamp()}"
        
        # Use default destination if not provided
        if not destination:
            destination = _get_backup_dir()
        else:
            # Ensure destination directory exists
            os.makedirs(destination, exist_ok=True)
        
        backup_path = os.path.join(destination, f"{backup_name}.zip")
        
        # Check if backup already exists
        if os.path.exists(backup_path):
            return {
                "success": False,
                "error": f"Backup file already exists: {backup_path}",
            }
        
        logger.log(f"LuaTools: Creating backup to {backup_path}")
        
        with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for folder_path in FOLDERS_TO_BACKUP:
                if os.path.exists(folder_path):
                    folder_name = os.path.basename(folder_path)
                    logger.log(f"LuaTools: Backing up {folder_path}")
                    
                    # Add entire folder to zip
                    for root, dirs, files in os.walk(folder_path):
                        for file in files:
                            file_path = os.path.join(root, file)
                            # Calculate archive name (relative path)
                            arcname = os.path.relpath(file_path, os.path.dirname(folder_path))
                            zipf.write(file_path, arcname)
                else:
                    logger.warn(f"LuaTools: Folder not found: {folder_path}")
        
        file_size = os.path.getsize(backup_path)
        logger.log(f"LuaTools: Backup created successfully: {backup_path} ({file_size} bytes)")
        
        return {
            "success": True,
            "backup_path": backup_path,
            "backup_name": backup_name,
            "file_size": file_size,
            "timestamp": _get_timestamp(),
            "message": f"Backup created successfully at {backup_path}",
        }
    
    except Exception as exc:
        logger.error(f"LuaTools: Backup creation failed: {exc}")
        return {
            "success": False,
            "error": str(exc),
        }


def restore_backup(backup_path: str, restore_location: str = "") -> Dict[str, Any]:
    """Restore a backup of Steam config folders.
    
    Args:
        backup_path: Path to the backup zip file
        restore_location: Optional location to restore to (default: original locations)
    
    Returns:
        Dict with success status and restore info
    """
    try:
        if not os.path.exists(backup_path):
            return {
                "success": False,
                "error": f"Backup file not found: {backup_path}",
            }
        
        if not backup_path.endswith('.zip'):
            return {
                "success": False,
                "error": "Invalid backup file: must be a .zip file",
            }
        
        logger.log(f"LuaTools: Restoring backup from {backup_path}")
        
        with zipfile.ZipFile(backup_path, 'r') as zipf:
            if restore_location:
                # Extract to custom location
                os.makedirs(restore_location, exist_ok=True)
                zipf.extractall(restore_location)
                logger.log(f"LuaTools: Backup restored to {restore_location}")
            else:
                # Extract to original locations
                # Handle various archive path layouts. create_backup writes files
                # with arcname relative to the parent of the config folder, e.g.
                # "depotcache/..." or "stplug-in/...". Some older archives may
                # include a "Steam/config/" prefix. Normalize and handle both.
                steam_config_dir = os.path.join("C:\\Program Files (x86)\\Steam", "config")

                for member in zipf.namelist():
                    # Normalize path separators and strip any leading ./
                    norm = member.replace('\\', '/').lstrip('./')

                    relative_path = None

                    # Common case: arcname like 'depotcache/...' or 'stplug-in/...'
                    if norm.startswith('depotcache/') or norm == 'depotcache' or norm.startswith('stplug-in/') or norm == 'stplug-in':
                        relative_path = norm

                    # Older/alternative case: 'Steam/config/depotcache/...'
                    elif '/Steam/config/' in norm:
                        relative_path = norm.split('/Steam/config/', 1)[1]

                    # Alternative case: 'Steam/config' as prefix without leading slash
                    elif norm.startswith('Steam/config/'):
                        relative_path = norm[len('Steam/config/') :]

                    if not relative_path:
                        # Not part of config backup, skip
                        continue

                    target_path = os.path.join(steam_config_dir, *relative_path.split('/'))

                    # Directory entry
                    if norm.endswith('/'):
                        os.makedirs(target_path, exist_ok=True)
                        continue

                    # Ensure parent directories exist
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)

                    # Extract file contents
                    with zipf.open(member) as source, open(target_path, 'wb') as target:
                        shutil.copyfileobj(source, target)
                
                logger.log(f"LuaTools: Backup restored to original locations")
        
        return {
            "success": True,
            "backup_path": backup_path,
            "message": "Backup restored successfully",
        }
    
    except Exception as exc:
        logger.error(f"LuaTools: Backup restoration failed: {exc}")
        return {
            "success": False,
            "error": str(exc),
        }


def get_backups_list(backup_location: str = "") -> Dict[str, Any]:
    """Get list of available backups.
    
    Args:
        backup_location: Optional location to search for backups (default: plugin backup dir)
    
    Returns:
        Dict with list of backups
    """
    try:
        if not backup_location:
            backup_location = _get_backup_dir()
        
        if not os.path.exists(backup_location):
            return {
                "success": True,
                "backups": [],
                "message": "No backups found",
            }
        
        backups = []
        for file in os.listdir(backup_location):
            if file.endswith('.zip'):
                file_path = os.path.join(backup_location, file)
                file_size = os.path.getsize(file_path)
                mod_time = os.path.getmtime(file_path)
                mod_date = datetime.fromtimestamp(mod_time).strftime("%Y-%m-%d %H:%M:%S")
                
                backups.append({
                    "name": file,
                    "path": file_path,
                    "size": file_size,
                    "size_mb": round(file_size / (1024 * 1024), 2),
                    "date": mod_date,
                })
        
        # Sort by modification time (newest first)
        backups.sort(key=lambda x: x["date"], reverse=True)
        
        return {
            "success": True,
            "backups": backups,
            "count": len(backups),
        }
    
    except Exception as exc:
        logger.error(f"LuaTools: Failed to list backups: {exc}")
        return {
            "success": False,
            "error": str(exc),
        }


def delete_backup(backup_path: str) -> Dict[str, Any]:
    """Delete a backup file.
    
    Args:
        backup_path: Path to the backup zip file
    
    Returns:
        Dict with success status
    """
    try:
        if not os.path.exists(backup_path):
            return {
                "success": False,
                "error": f"Backup file not found: {backup_path}",
            }
        
        os.remove(backup_path)
        logger.log(f"LuaTools: Backup deleted: {backup_path}")
        
        return {
            "success": True,
            "message": f"Backup deleted successfully",
        }
    
    except Exception as exc:
        logger.error(f"LuaTools: Failed to delete backup: {exc}")
        return {
            "success": False,
            "error": str(exc),
        }


def open_backup_location(backup_path: str) -> Dict[str, Any]:
    """Open the backup file location in file manager.
    
    Args:
        backup_path: Path to the backup zip file
    
    Returns:
        Dict with success status
    """
    try:
        if not os.path.exists(backup_path):
            return {
                "success": False,
                "error": f"Backup file not found: {backup_path}",
            }
        
        import subprocess
        import sys
        
        # Normalize path
        backup_path = os.path.normpath(backup_path)
        
        # Open file manager with file selected
        if sys.platform == "win32":
            # Windows: use explorer with /select to highlight the file
            subprocess.Popen(f'explorer /select,"{backup_path}"')
        elif sys.platform == "darwin":
            # macOS: use open command
            subprocess.Popen(["open", "-R", backup_path])
        else:
            # Linux: open the directory
            dir_path = os.path.dirname(backup_path)
            subprocess.Popen(["xdg-open", dir_path])
        
        logger.log(f"LuaTools: Opened backup location: {backup_path}")
        
        return {
            "success": True,
            "message": "File location opened in file manager",
        }
    
    except Exception as exc:
        logger.error(f"LuaTools: Failed to open backup location: {exc}")
        return {
            "success": False,
            "error": str(exc),
        }
