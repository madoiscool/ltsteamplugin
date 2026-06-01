local options = {}

options.SETTINGS_GROUPS = {
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
                default = true,
                metadata = {yesLabel = "Yes", noLabel = "No"}
            },
            {
                key = "language",
                label = "Language",
                option_type = "select",
                description = "Choose the language used by LuaTools.",
                default = "en",
                metadata = {dynamicChoices = "locales"}
            },
            {
                key = "donateKeys",
                label = "Donate Keys",
                option_type = "toggle",
                description = "Allow LuaTools to donate spare Steam keys. (placeholder option)",
                default = true,
                metadata = {yesLabel = "Yes", noLabel = "No"}
            },
            {
                key = "theme",
                label = "Theme",
                option_type = "select",
                description = "Choose the color theme for LuaTools interface.",
                default = "original",
                metadata = {dynamicChoices = "themes"}
            },
            {
                key = "fastDownload",
                label = "Fast Download",
                option_type = "toggle",
                description = "Automatically choose the first available source when adding a game.",
                default = true,
                metadata = {yesLabel = "Yes", noLabel = "No"}
            },
            {
                key = "morrenusApiKey",
                label = "Morrenus API Key",
                option_type = "text",
                description = "API Key required to use Sadie Source. Get from hubcapmanifest.com",
                default = "",
                metadata = {placeholder = "Enter your API key..."}
            }
        }
    }
}

function options.get_settings_schema()
    local schema = {}
    for _, group in ipairs(options.SETTINGS_GROUPS) do
        local group_options = {}
        for _, opt in ipairs(group.options) do
            table.insert(group_options, {
                key = opt.key,
                label = opt.label,
                type = opt.option_type,
                description = opt.description,
                default = opt.default,
                choices = opt.choices or {},
                requiresRestart = opt.requires_restart or false,
                metadata = opt.metadata or {}
            })
        end
        table.insert(schema, {
            key = group.key,
            label = group.label,
            description = group.description,
            options = group_options
        })
    end
    return schema
end

function options.get_default_settings_values()
    local defaults = {}
    for _, group in ipairs(options.SETTINGS_GROUPS) do
        local group_defaults = {}
        for _, opt in ipairs(group.options) do
            group_defaults[opt.key] = opt.default
        end
        defaults[group.key] = group_defaults
    end
    return defaults
end

function options.merge_defaults_with_values(values)
    local merged = type(values) == "table" and values or {}
    local defaults = options.get_default_settings_values()

    for group_key, group_defaults in pairs(defaults) do
        local existing_group = merged[group_key]
        if type(existing_group) ~= "table" then
            existing_group = {}
        end
        local merged_group = {}
        for k, v in pairs(group_defaults) do merged_group[k] = v end
        for k, v in pairs(existing_group) do merged_group[k] = v end
        merged[group_key] = merged_group
    end
    return merged
end

return options
