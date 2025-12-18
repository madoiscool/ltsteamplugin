from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class SettingOption:
    key: str
    label: str
    option_type: str
    default: Any
    description: str = ""
    choices: Optional[List[Dict[str, Any]]] = None
    requires_restart: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SettingGroup:
    key: str
    label: str
    description: str
    options: List[SettingOption]


SETTINGS_GROUPS: List[SettingGroup] = [
    SettingGroup(
        key="general",
        label="General",
        description="Global LuaTools preferences.",
        options=[
            SettingOption(
                key="language",
                label="Language",
                option_type="select",
                description="Choose the language used by LuaTools.",
                default="en",
                metadata={"dynamicChoices": "locales"},
            ),
            SettingOption(
                key="donateKeys",
                label="Donate Keys",
                option_type="toggle",
                description="Allow LuaTools to donate spare Steam keys. (placeholder option)",
                default=True,
                metadata={"yesLabel": "Yes", "noLabel": "No"},
            ),
            SettingOption(
                key="theme",
                label="Theme",
                option_type="select",
                description="Choose the color theme for LuaTools interface.",
                default="original",
                metadata={"dynamicChoices": "themes"},
            ),
        ],
    ),
]


def get_settings_schema() -> List[Dict[str, Any]]:
    """Return a serialisable representation of the settings schema."""
    schema: List[Dict[str, Any]] = []
    for group in SETTINGS_GROUPS:
        schema.append(
            {
                "key": group.key,
                "label": group.label,
                "description": group.description,
                "options": [
                    {
                        "key": option.key,
                        "label": option.label,
                        "type": option.option_type,
                        "description": option.description,
                        "default": option.default,
                        "choices": option.choices or [],
                        "requiresRestart": option.requires_restart,
                        "metadata": option.metadata,
                    }
                    for option in group.options
                ],
            }
        )
    return schema


def get_default_settings_values() -> Dict[str, Any]:
    """Return a flat dictionary of option defaults, namespaced by group."""
    defaults: Dict[str, Any] = {}
    for group in SETTINGS_GROUPS:
        group_defaults: Dict[str, Any] = {}
        for option in group.options:
            group_defaults[option.key] = option.default
        defaults[group.key] = group_defaults
    return defaults


def merge_defaults_with_values(values: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Merge provided values with defaults, returning a dictionary that includes
    all current schema keys. Extra keys in `values` are preserved to avoid
    data loss when options are removed.
    """
    merged = values.copy() if isinstance(values, dict) else {}
    defaults = get_default_settings_values()

    for group_key, group_defaults in defaults.items():
        existing_group = merged.get(group_key)
        if not isinstance(existing_group, dict):
            existing_group = {}
        # Preserve unknown keys within the group.
        merged_group = {**group_defaults, **existing_group}
        merged[group_key] = merged_group

    return merged

