from __future__ import annotations

import copy
import json
import os
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple

from logger import logger
from paths import backend_path, get_plugin_dir

from locales import DEFAULT_LOCALE, PLACEHOLDER_VALUE, get_locale_manager

from .options import (
    SETTINGS_GROUPS,
    SettingOption,
    get_settings_schema,
    merge_defaults_with_values,
)

SCHEMA_VERSION = 1
SETTINGS_FILE = backend_path(os.path.join("data", "settings.json"))

_SETTINGS_LOCK = threading.Lock()
_SETTINGS_CACHE: Dict[str, Any] | None = None
_CHANGE_HOOKS: Dict[Tuple[str, str], List[Callable[[Any, Any], None]]] = {}


def _available_locale_codes() -> List[Dict[str, Any]]:
    manager = get_locale_manager()
    locales = manager.available_locales()
    if not locales:
        # Guarantee default locale presence even if file missing
        locales = [{"code": DEFAULT_LOCALE, "name": "English", "nativeName": "English"}]
    return locales


def _ensure_language_valid(values: Dict[str, Any]) -> bool:
    general = values.get("general")
    changed = False
    if not isinstance(general, dict):
        general = {}
        values["general"] = general
        changed = True

    available_codes = {locale["code"] for locale in _available_locale_codes()}
    available_codes.add(DEFAULT_LOCALE)

    current_language = general.get("language")
    if current_language not in available_codes:
        logger.warn(
            f"LuaTools: language '{current_language}' not available; "
            f"falling back to {DEFAULT_LOCALE} (available={sorted(available_codes)})"
        )
        general["language"] = DEFAULT_LOCALE
        changed = True
    return changed


def _available_theme_files() -> List[Dict[str, Any]]:
    """Return list of available theme files.

    This first attempts to read a single source-of-truth JSON file
    `public/themes/themes.json`. If that is missing or invalid it
    falls back to scanning the `public/themes` directory for `.css`
    files. If both fail, a built-in fallback list is returned.
    """
    themes = []
    # Primary: read themes.json
    try:
        themes_json_path = os.path.join(get_plugin_dir(), "public", "themes", "themes.json")
        if os.path.exists(themes_json_path):
            try:
                with open(themes_json_path, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict) and item.get("value"):
                                themes.append({"value": str(item.get("value")), "label": str(item.get("label") or item.get("value"))})
            except Exception as exc:
                logger.warn(f"LuaTools: Failed to parse themes.json: {exc}")
    except Exception:
        pass

    # Secondary: scan themes directory for .css files
    if not themes:
        try:
            themes_dir = os.path.join(get_plugin_dir(), "public", "themes")
            if os.path.exists(themes_dir):
                for filename in os.listdir(themes_dir):
                    if filename.endswith(".css"):
                        theme_name = filename[:-4]
                        display_name = theme_name.capitalize()
                        themes.append({"value": theme_name, "label": display_name})
        except Exception as exc:
            logger.warn(f"LuaTools: Failed to list theme files: {exc}")

    # Tertiary: hardcoded fallback
    if not themes:
        themes = [
            {"value": "original", "label": "Original"},
            {"value": "dark", "label": "Dark"},
            {"value": "light", "label": "Light"},
            {"value": "forest", "label": "Forest"},
            {"value": "ocean", "label": "Ocean"},
            {"value": "purple", "label": "Purple"},
            {"value": "space", "label": "Space"},
            {"value": "rosepine", "label": "Rosepine"},
            {"value": "catppuccin", "label": "Catppuccin"},
            {"value": "dracula", "label": "Dracula"},
            {"value": "christmas", "label": "Christmas"},
        ]
        logger.warn(f"LuaTools: Using hardcoded theme list as fallback")

    # Sort themes, but put 'original' first
    try:
        themes.sort(key=lambda x: (x["value"] != "original", x["label"]))
    except Exception:
        pass
    return themes


def _inject_locale_choices(schema: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    locale_choices = [
        {
            "value": locale["code"],
            "label": locale.get("nativeName") or locale.get("name") or locale["code"],
        }
        for locale in _available_locale_codes()
    ]

    theme_choices = _available_theme_files()

    for group in schema:
        if group.get("key") != "general":
            continue
        options = group.get("options") or []
        for option in options:
            if option.get("key") == "language":
                option["choices"] = locale_choices
                metadata = option.get("metadata") or {}
                metadata["dynamicChoices"] = "locales"
                option["metadata"] = metadata
            elif option.get("key") == "theme":
                option["choices"] = theme_choices
                metadata = option.get("metadata") or {}
                metadata["dynamicChoices"] = "themes"
                option["metadata"] = metadata
    return schema


def _ensure_settings_dir() -> None:
    directory = os.path.dirname(SETTINGS_FILE)
    try:
        os.makedirs(directory, exist_ok=True)
    except Exception as exc:
        logger.warn(f"LuaTools: Failed to ensure settings directory: {exc}")


def _load_settings_file() -> Dict[str, Any]:
    if not os.path.exists(SETTINGS_FILE):
        return {}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        logger.warn(f"LuaTools: Failed to read settings file: {exc}")
        return {}


def _write_settings_file(data: Dict[str, Any]) -> None:
    _ensure_settings_dir()
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
    except Exception as exc:
        logger.warn(f"LuaTools: Failed to persist settings file: {exc}")


def _persist_values(values: Dict[str, Any]) -> None:
    payload = {"version": SCHEMA_VERSION, "values": values}
    _write_settings_file(payload)
    global _SETTINGS_CACHE
    _SETTINGS_CACHE = copy.deepcopy(values)


def _build_option_lookup() -> Dict[Tuple[str, str], SettingOption]:
    lookup: Dict[Tuple[str, str], SettingOption] = {}
    for group in SETTINGS_GROUPS:
        for option in group.options:
            lookup[(group.key, option.key)] = option
    return lookup


_OPTION_LOOKUP = _build_option_lookup()


def _validate_option_value(option: SettingOption, value: Any) -> Tuple[bool, Any, str | None]:
    if option.option_type == "toggle":
        if isinstance(value, bool):
            return True, value, None
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes", "y"}:
                return True, True, None
            if lowered in {"false", "0", "no", "n"}:
                return True, False, None
        return False, option.default, "Value must be a boolean"

    if option.option_type == "text":
        # Accept any string value, convert non-strings to string
        if value is None:
            return True, "", None
        return True, str(value).strip(), None

    if option.option_type == "select":
        dynamic = option.metadata.get("dynamicChoices") if isinstance(option.metadata, dict) else None
        if dynamic == "locales":
            available = _available_locale_codes()
            allowed_map: Dict[str, str] = {}
            for locale in available:
                code = str(locale.get("code") or "").strip()
                if not code:
                    continue
                allowed_map[code.lower()] = code
                for name_key in ("name", "nativeName"):
                    name_value = locale.get(name_key)
                    if isinstance(name_value, str) and name_value.strip():
                        allowed_map[name_value.strip().lower()] = code
            candidate = str(value or "").strip()
            try:
                logger.log(
                    "LuaTools: validating locale option "
                    f"value={candidate!r}, allowed={sorted(set(allowed_map.values()))}"
                )
            except Exception:
                pass
            matched = allowed_map.get(candidate.lower())
            if matched:
                return True, matched, None
            try:
                logger.warn(
                    f"LuaTools: invalid locale selection {value!r}; allowed codes "
                    f"{sorted(set(allowed_map.values()))}"
                )
            except Exception:
                pass
            return False, option.default, "Value not in list of allowed options"
        elif dynamic == "themes":
            available = _available_theme_files()
            allowed_map: Dict[str, str] = {}
            for theme in available:
                theme_value = str(theme.get("value") or "").strip()
                if not theme_value:
                    continue
                allowed_map[theme_value.lower()] = theme_value
                label_value = theme.get("label")
                if isinstance(label_value, str) and label_value.strip():
                    allowed_map[label_value.strip().lower()] = theme_value
            candidate = str(value or "").strip()
            try:
                logger.log(
                    "LuaTools: validating theme option "
                    f"value={candidate!r}, allowed={sorted(set(allowed_map.values()))}"
                )
            except Exception:
                pass
            matched = allowed_map.get(candidate.lower())
            if matched:
                return True, matched, None
            try:
                logger.warn(
                    f"LuaTools: invalid theme selection {value!r}; allowed themes "
                    f"{sorted(set(allowed_map.values()))}"
                )
            except Exception:
                pass
            return False, option.default, "Value not in list of allowed options"
        else:
            allowed = {
                str(choice.get("value"))
                for choice in option.choices or []
                if isinstance(choice, dict) and choice.get("value") is not None
            }
            if str(value) in allowed:
                return True, value, None
            try:
                logger.warn(
                    f"LuaTools: invalid select option value {value!r}; allowed {sorted(allowed)}"
                )
            except Exception:
                pass
            return False, option.default, "Value not in list of allowed options"

    # Fallback: accept any value
    return True, value, None


def _load_settings_cache() -> Dict[str, Any]:
    global _SETTINGS_CACHE
    if _SETTINGS_CACHE is not None:
        return _SETTINGS_CACHE

    raw_data = _load_settings_file()
    version = raw_data.get("version", 0)
    values = raw_data.get("values")

    merged_values = merge_defaults_with_values(values)
    if version != SCHEMA_VERSION or merged_values != values:
        _write_settings_file({"version": SCHEMA_VERSION, "values": merged_values})
    _SETTINGS_CACHE = merged_values
    return merged_values


def _get_values_locked() -> Dict[str, Any]:
    values = _load_settings_cache()
    if not isinstance(values, dict):
        values = {}
    if _ensure_language_valid(values):
        _persist_values(values)
    return values


def register_change_hook(option_path: Tuple[str, str], callback: Callable[[Any, Any], None]) -> None:
    """Register a callback invoked when a particular option changes."""
    with _SETTINGS_LOCK:
        hooks = _CHANGE_HOOKS.setdefault(option_path, [])
        hooks.append(callback)


def get_settings_state() -> Dict[str, Any]:
    """Return current schema, version and values for the frontend."""
    with _SETTINGS_LOCK:
        values = _get_values_locked()
        return {
            "version": SCHEMA_VERSION,
            "values": copy.deepcopy(values),
        }


def get_current_language() -> str:
    with _SETTINGS_LOCK:
        values = _get_values_locked()
        general = values.get("general") or {}
        language = general.get("language") or DEFAULT_LOCALE
        return str(language)


def get_morrenus_api_key() -> str:
    """Get the Morrenus API key from settings."""
    with _SETTINGS_LOCK:
        values = _get_values_locked()
        general = values.get("general") or {}
        return str(general.get("morrenusApiKey") or "")


def get_available_locales() -> List[Dict[str, Any]]:
    return _available_locale_codes()


def get_settings_payload() -> Dict[str, Any]:
    with _SETTINGS_LOCK:
        values = _get_values_locked()
        values_snapshot = copy.deepcopy(values)

    schema = _inject_locale_choices(get_settings_schema())
    locales = get_available_locales()
    language = str(values_snapshot.get("general", {}).get("language") or DEFAULT_LOCALE)
    translations = get_locale_manager().get_locale_strings(language)

    return {
        "version": SCHEMA_VERSION,
        "values": values_snapshot,
        "schema": schema,
        "language": language,
        "locales": locales,
        "translations": translations,
    }


def get_translation_map(locale: Optional[str] = None) -> Dict[str, Any]:
    manager = get_locale_manager()
    locales = manager.available_locales()
    codes = {item["code"] for item in locales}
    codes.add(DEFAULT_LOCALE)

    if locale not in codes:
        locale = get_current_language()
    if locale not in codes:
        locale = DEFAULT_LOCALE

    return {
        "language": locale,
        "locales": locales,
        "strings": manager.get_locale_strings(locale),
    }


def apply_settings_changes(changes: Dict[str, Any]) -> Dict[str, Any]:
    """Apply a batch of settings changes."""
    if not isinstance(changes, dict):
        return {"success": False, "error": "Invalid payload"}

    with _SETTINGS_LOCK:
        current = _get_values_locked()
        updated = merge_defaults_with_values(current)

        errors: Dict[str, Dict[str, str]] = {}
        applied_changes: List[Tuple[Tuple[str, str], Any, Any]] = []

        for group_key, options_changes in changes.items():
            if not isinstance(options_changes, dict):
                errors.setdefault(group_key, {})["*"] = "Group payload must be an object"
                continue

            logger.log(f"LuaTools: applying group {group_key} with payload {options_changes}")

            if group_key not in updated:
                errors.setdefault(group_key, {})["*"] = "Unknown settings group"
                continue

            for option_key, value in options_changes.items():
                try:
                    logger.log(
                        f"LuaTools: apply change request {group_key}.{option_key} -> {value!r}"
                    )
                except Exception:
                    pass
                option_lookup_key = (group_key, option_key)
                option = _OPTION_LOOKUP.get(option_lookup_key)
                if not option:
                    errors.setdefault(group_key, {})[option_key] = "Unknown option"
                    continue

                is_valid, normalised_value, error = _validate_option_value(option, value)
                try:
                    logger.log(
                        f"LuaTools: validated {group_key}.{option_key}, "
                        f"is_valid={is_valid}, normalised={normalised_value!r}, error={error}"
                    )
                except Exception:
                    pass
                if not is_valid:
                    errors.setdefault(group_key, {})[option_key] = error or "Invalid value"
                    continue

                previous_value = updated[group_key].get(option_key, option.default)
                if previous_value == normalised_value:
                    continue

                updated[group_key][option_key] = normalised_value
                applied_changes.append((option_lookup_key, previous_value, normalised_value))

        language_changed = False
        if errors:
            return {"success": False, "errors": errors}

        # Ensure language is still valid even if no change applied
        if _ensure_language_valid(updated):
            language_changed = True

        if not applied_changes and not language_changed:
            values_snapshot = copy.deepcopy(updated)
            language = str(values_snapshot.get("general", {}).get("language") or DEFAULT_LOCALE)
            translations = get_locale_manager().get_locale_strings(language)
            logger.log(
                f"LuaTools: no changes applied; returning cached values with language={language}"
            )
            return {
                "success": True,
                "values": values_snapshot,
                "language": language,
                "translations": translations,
                "message": "No-op",
            }

        _persist_values(updated)
        values_snapshot = copy.deepcopy(updated)
        language = str(values_snapshot.get("general", {}).get("language") or DEFAULT_LOCALE)

        # Invoke hooks outside of file write but still under lock to maintain order.
        for option_key, previous, current_value in applied_changes:
            for callback in _CHANGE_HOOKS.get(option_key, []):
                try:
                    callback(previous, current_value)
                except Exception as exc:
                    logger.warn(f"LuaTools: settings hook failed for {option_key}: {exc}")

        translations = get_locale_manager().get_locale_strings(language)

        logger.log(
            f"LuaTools: apply_settings_changes final language={language}, values={values_snapshot}"
        )
        return {
            "success": True,
            "values": values_snapshot,
            "language": language,
            "translations": translations,
        }

