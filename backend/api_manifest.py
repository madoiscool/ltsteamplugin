"""Management of the LuaTools API manifest (free API list)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from config import (
    API_JSON_FILE,
    API_MANIFEST_PROXY_URL,
    API_MANIFEST_URL,
    HTTP_PROXY_TIMEOUT_SECONDS,
)
from http_client import ensure_http_client, get_http_client
from logger import logger
from utils import (
    backend_path,
    count_apis,
    normalize_manifest_text,
    read_text,
    write_text,
)
from settings.manager import get_morrenus_api_key

_APIS_INIT_DONE = False
_INIT_APIS_LAST_MESSAGE = ""


def init_apis(content_script_query: str = "") -> str:
    """Initialise the free API manifest if it has not been loaded yet."""
    global _APIS_INIT_DONE, _INIT_APIS_LAST_MESSAGE
    logger.log("InitApis: invoked")
    if _APIS_INIT_DONE:
        logger.log("InitApis: already completed this session, skipping")
        return json.dumps({"success": True, "message": _INIT_APIS_LAST_MESSAGE})

    client = ensure_http_client("InitApis")
    api_json_path = backend_path(API_JSON_FILE)
    message = ""

    if os.path.exists(api_json_path):
        logger.log(f"InitApis: Local file exists -> {api_json_path}; skipping remote fetch")
    else:
        logger.log(f"InitApis: Local file not found -> {api_json_path}")
        manifest_text = ""
        try:
            # Try primary URL first
            try:
                logger.log(f"InitApis: Fetching manifest from {API_MANIFEST_URL}")
                resp = client.get(API_MANIFEST_URL)
                logger.log(f"InitApis: Manifest response: status={resp.status_code}")
                resp.raise_for_status()
                manifest_text = resp.text
                logger.log(
                    f"InitApis: Fetched manifest, status={resp.status_code}, length={len(manifest_text)}"
                )
            except Exception as primary_err:
                logger.warn(f"InitApis: Primary URL failed ({primary_err}), trying proxy...")
                try:
                    logger.log(f"InitApis: Fetching manifest from proxy {API_MANIFEST_PROXY_URL}")
                    resp = client.get(API_MANIFEST_PROXY_URL, timeout=HTTP_PROXY_TIMEOUT_SECONDS)
                    logger.log(f"InitApis: Proxy manifest response: status={resp.status_code}")
                    resp.raise_for_status()
                    manifest_text = resp.text
                    logger.log(
                        f"InitApis: Fetched manifest from proxy, status={resp.status_code}, length={len(manifest_text)}"
                    )
                except Exception as proxy_err:
                    logger.warn(f"InitApis: Proxy also failed: {proxy_err}")
                    raise primary_err
        except Exception as fetch_err:
            logger.warn(f"InitApis: Failed to fetch free API manifest: {fetch_err}")

        normalized = normalize_manifest_text(manifest_text) if manifest_text else ""
        if normalized:
            write_text(api_json_path, normalized)
            count = count_apis(normalized)
            message = f"No API's Configured, Loaded {count} Free Ones :D"
            logger.log(f"InitApis: Wrote new api.json with {count} entries")
        else:
            message = "No API's Configured and failed to load free ones"
            logger.warn("InitApis: Manifest empty, nothing written")

    _APIS_INIT_DONE = True
    _INIT_APIS_LAST_MESSAGE = message
    logger.log(f'InitApis: completed message="{message}"')
    return json.dumps({"success": True, "message": message})


def get_init_apis_message(content_script_query: str = "") -> str:
    """Return and clear the last InitApis message."""
    global _INIT_APIS_LAST_MESSAGE
    logger.log("InitApis: GetInitApisMessage invoked")
    msg = _INIT_APIS_LAST_MESSAGE or ""
    if msg:
        logger.log(f"InitApis: delivering queued message -> {msg}")
    _INIT_APIS_LAST_MESSAGE = ""
    return json.dumps({"success": True, "message": msg})


def store_last_message(message: str) -> None:
    """Allow other subsystems to push a message shown on next InitApis poll."""
    global _INIT_APIS_LAST_MESSAGE
    _INIT_APIS_LAST_MESSAGE = message or ""


def fetch_free_apis_now(content_script_query: str = "") -> str:
    """Force refresh of the free API manifest."""
    client = ensure_http_client("LuaTools: FetchFreeApisNow")
    try:
        logger.log("LuaTools: FetchFreeApisNow invoked")
        manifest_text = ""

        try:
            logger.log(f"LuaTools: Fetching manifest from {API_MANIFEST_URL}")
            resp = client.get(API_MANIFEST_URL, follow_redirects=True)
            logger.log(f"LuaTools: Manifest response: status={resp.status_code}")
            resp.raise_for_status()
            manifest_text = resp.text
            logger.log("LuaTools: Fetched manifest from primary URL")
        except Exception as primary_err:
            logger.warn(f"LuaTools: Primary manifest URL failed ({primary_err}), trying proxy...")
            try:
                logger.log(f"LuaTools: Fetching manifest from proxy {API_MANIFEST_PROXY_URL}")
                resp = client.get(
                    API_MANIFEST_PROXY_URL,
                    follow_redirects=True,
                    timeout=HTTP_PROXY_TIMEOUT_SECONDS,
                )
                logger.log(f"LuaTools: Proxy manifest response: status={resp.status_code}")
                resp.raise_for_status()
                manifest_text = resp.text
                logger.log("LuaTools: Fetched manifest from proxy URL")
            except Exception as proxy_err:
                logger.warn(f"LuaTools: Proxy manifest URL also failed: {proxy_err}")
                return json.dumps(
                    {"success": False, "error": f"Both URLs failed: {primary_err}, {proxy_err}"}
                )

        normalized = normalize_manifest_text(manifest_text) if manifest_text else ""
        if not normalized:
            return json.dumps({"success": False, "error": "Empty manifest"})

        write_text(backend_path(API_JSON_FILE), normalized)
        try:
            data = json.loads(normalized)
            count = len([entry for entry in data.get("api_list", [])])
        except Exception:
            count = normalized.count('"name"')

        return json.dumps({"success": True, "count": count})
    except Exception as exc:
        logger.warn(f"LuaTools: FetchFreeApisNow failed: {exc}")
        return json.dumps({"success": False, "error": str(exc)})


def load_api_manifest() -> List[Dict[str, Any]]:
    """Return the list of enabled APIs from api.json."""
    path = backend_path(API_JSON_FILE)
    text = read_text(path)

    normalized = normalize_manifest_text(text)
    if normalized and normalized != text:
        try:
            write_text(path, normalized)
            logger.log("LuaTools: Normalized api.json")
        except Exception:
            pass
        text = normalized

    try:
        data = json.loads(text or "{}")
        apis = data.get("api_list", [])
        return [api for api in apis if api.get("enabled", False)]
    except Exception as exc:
        logger.error(f"LuaTools: Failed to parse api.json: {exc}")
        return []


def get_api_list(content_script_query: str = "") -> str:
    """Return the list of enabled API names for the frontend.

    APIs requiring <moapikey> are hidden if the Morrenus API key is not configured.
    """
    try:
        apis = load_api_manifest()
        morrenus_api_key = get_morrenus_api_key()

        api_names = []
        for i, api in enumerate(apis):
            url = api.get("url", "")
            # Skip APIs requiring Morrenus API key if key is not set
            if "<moapikey>" in url and not morrenus_api_key:
                continue
            api_names.append({"name": api.get("name", "Unknown"), "index": i})

        return json.dumps({"success": True, "apis": api_names})
    except Exception as exc:
        logger.error(f"LuaTools: Failed to get API list: {exc}")
        return json.dumps({"success": False, "error": str(exc), "apis": []})

