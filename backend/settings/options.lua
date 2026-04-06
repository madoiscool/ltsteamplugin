--- Settings schema definition for the LuaTools backend.

local M = {}

M.SETTINGS_GROUPS = {
    {
        key = "general",
        label = "General",
        description = "Global LuaTools preferences.",
        options = {
            {
                key = "useSteamLanguage",
                label = "Use Steam Language",
                option_type = "toggle",
                description = "Use the Steam client's language for LuaTools.",
                default_value = true,
                choices = {},
                requires_restart = false,
                metadata = { yesLabel = "Yes", noLabel = "No" },
            },
            {
                key = "language",
                label = "Language",
                option_type = "select",
                description = "Choose the language used by LuaTools.",
                default_value = "en",
                choices = {},
                requires_restart = false,
                metadata = { dynamicChoices = "locales" },
            },
            {
                key = "donateKeys",
                label = "Donate Keys",
                option_type = "toggle",
                description = "Allow LuaTools to donate spare Steam keys. (placeholder option)",
                default_value = true,
                choices = {},
                requires_restart = false,
                metadata = { yesLabel = "Yes", noLabel = "No" },
            },
            {
                key = "theme",
                label = "Theme",
                option_type = "select",
                description = "Choose the color theme for LuaTools interface.",
                default_value = "original",
                choices = {},
                requires_restart = false,
                metadata = { dynamicChoices = "themes" },
            },
            {
                key = "morrenusApiKey",
                label = "Morrenus API Key",
                option_type = "text",
                description = "API Key required to use Sadie Source. Get from manifest.morrenus.xyz",
                default_value = "",
                choices = {},
                requires_restart = false,
                metadata = { placeholder = "Enter your API key..." },
            },
        },
    },
}

--- Return a serializable representation of the settings schema.
function M.get_settings_schema()
    local schema = {}
    for _, group in ipairs(M.SETTINGS_GROUPS) do
        local options = {}
        for _, option in ipairs(group.options) do
            options[#options + 1] = {
                key = option.key,
                label = option.label,
                type = option.option_type,
                description = option.description,
                default = option.default_value,
                choices = option.choices or {},
                requiresRestart = option.requires_restart,
                metadata = option.metadata,
            }
        end
        schema[#schema + 1] = {
            key = group.key,
            label = group.label,
            description = group.description,
            options = options,
        }
    end
    return schema
end

--- Return a flat dictionary of option defaults, namespaced by group.
function M.get_default_settings_values()
    local defaults = {}
    for _, group in ipairs(M.SETTINGS_GROUPS) do
        local group_defaults = {}
        for _, option in ipairs(group.options) do
            group_defaults[option.key] = option.default_value
        end
        defaults[group.key] = group_defaults
    end
    return defaults
end

--- Merge provided values with defaults, preserving extra keys.
function M.merge_defaults_with_values(values)
    local merged = {}
    if type(values) == "table" then
        for k, v in pairs(values) do
            merged[k] = v
        end
    end

    local defaults = M.get_default_settings_values()
    for group_key, group_defaults in pairs(defaults) do
        local existing_group = merged[group_key]
        if type(existing_group) ~= "table" then
            existing_group = {}
        end
        -- Merge: defaults first, then existing values override
        local merged_group = {}
        for k, v in pairs(group_defaults) do
            merged_group[k] = v
        end
        for k, v in pairs(existing_group) do
            merged_group[k] = v
        end
        merged[group_key] = merged_group
    end

    return merged
end

--- Build a lookup table: { ["group_key.option_key"] = option_table }
function M.build_option_lookup()
    local lookup = {}
    for _, group in ipairs(M.SETTINGS_GROUPS) do
        for _, option in ipairs(group.options) do
            lookup[group.key .. "." .. option.key] = option
        end
    end
    return lookup
end

return M
