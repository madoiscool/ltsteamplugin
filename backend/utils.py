"""Generic helpers for file and data handling in the LuaTools backend."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict

from paths import backend_path, get_plugin_dir


def read_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        return ""


def write_text(path: str, text: str) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def read_json(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def write_json(path: str, data: Dict[str, Any]) -> bool:
    """Write JSON data to file. Returns True on success, False on failure."""
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
        return True
    except Exception as exc:
        # Import logger here to avoid circular import
        try:
            from logger import logger
            logger.warn(f"write_json failed for {path}: {exc}")
        except Exception:
            pass
        return False


def count_apis(text: str) -> int:
    try:
        data = json.loads(text)
        apis = data.get("api_list", [])
        if isinstance(apis, list):
            return len(apis)
    except Exception:
        pass
    return text.count('"name"')


def normalize_manifest_text(text: str) -> str:
    content = (text or "").strip()
    if not content:
        return content

    content = re.sub(r",\s*]", "]", content)
    content = re.sub(r",\s*}\s*$", "}", content)

    if content.startswith('"api_list"') or content.startswith("'api_list'") or content.startswith("api_list"):
        if not content.startswith("{"):
            content = "{" + content
        if not content.endswith("}"):
            content = content.rstrip(",") + "}"

    try:
        json.loads(content)
        return content
    except Exception:
        return text


def parse_version(version: str) -> tuple:
    try:
        parts = [int(part) for part in re.findall(r"\d+", str(version))]
        return tuple(parts or [0])
    except Exception:
        return (0,)


def get_plugin_version() -> str:
    try:
        plugin_json_path = os.path.join(get_plugin_dir(), "plugin.json")
        data = read_json(plugin_json_path)
        return str(data.get("version", "0"))
    except Exception:
        return "0"


def ensure_temp_download_dir() -> str:
    root = backend_path("temp_dl")
    try:
        os.makedirs(root, exist_ok=True)
    except Exception:
        pass
    return root


__all__ = [
    "backend_path",
    "ensure_temp_download_dir",
    "count_apis",
    "get_plugin_dir",
    "get_plugin_version",
    "normalize_manifest_text",
    "parse_version",
    "read_json",
    "read_text",
    "write_json",
    "write_text",
]

