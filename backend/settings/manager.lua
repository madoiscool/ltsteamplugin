--- Settings manager: load, save, validate, and apply settings changes.

local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local paths = require("paths")
local steam_utils = require("steam_utils")
local locale_loader = require("locales.loader")
local options = require("settings.options")

local M = {}

local SCHEMA_VERSION = 1
local SETTINGS_FILE = paths.data_path("settings.json")

local _settings_cache = nil
local _change_hooks = {} -- { ["group.option"] = { callback, ... } }
local _option_lookup = options.build_option_lookup()

-- ─── Available choices helpers ───

local function available_locale_codes()
    local locales = locale_loader.available_locales()
    if not locales or #locales == 0 then
        locales = { { code = locale_loader.DEFAULT_LOCALE, name = "English", nativeName = "English" } }
    end
    return locales
end

local function available_theme_files()
    local themes = {}

    -- Primary: read themes.json
    local themes_json_path = fs.join(paths.get_plugin_dir(), "public", "themes", "themes.json")
    if fs.exists(themes_json_path) then
        local content, _ = utils.read_file(themes_json_path)
        if content then
            local ok, data = pcall(json.decode, content)
            if ok and type(data) == "table" then
                for _, item in ipairs(data) do
                    if type(item) == "table" and item.value then
                        themes[#themes + 1] = {
                            value = tostring(item.value),
                            label = tostring(item.label or item.value),
                        }
                    end
                end
            end
        end
    end

    -- Secondary: scan themes directory for .css files
    if #themes == 0 then
        local themes_dir = fs.join(paths.get_plugin_dir(), "public", "themes")
        if fs.exists(themes_dir) then
            local files = fs.list(themes_dir)
            if files then
                for _, entry in ipairs(files) do
                    local name = entry.name or ""
                    if name:match("%.css$") then
                        local theme_name = name:sub(1, -5)
                        themes[#themes + 1] = {
                            value = theme_name,
                            label = theme_name:sub(1, 1):upper() .. theme_name:sub(2),
                        }
                    end
                end
            end
        end
    end

    -- Tertiary: hardcoded fallback
    if #themes == 0 then
        themes = {
            { value = "original", label = "Original" },
            { value = "dark", label = "Dark" },
            { value = "light", label = "Light" },
            { value = "forest", label = "Forest" },
            { value = "ocean", label = "Ocean" },
            { value = "purple", label = "Purple" },
            { value = "space", label = "Space" },
            { value = "rosepine", label = "Rosepine" },
            { value = "catppuccin", label = "Catppuccin" },
            { value = "dracula", label = "Dracula" },
            { value = "christmas", label = "Christmas" },
        }
        logger:warn("LuaTools: Using hardcoded theme list as fallback")
    end

    -- Sort: 'original' first, then alphabetical
    table.sort(themes, function(a, b)
        if a.value == "original" then return true end
        if b.value == "original" then return false end
        return a.label < b.label
    end)

    return themes
end

-- ─── File I/O ───

local function ensure_settings_dir()
    local dir = fs.parent_path(SETTINGS_FILE)
    if not fs.exists(dir) then
        fs.create_directories(dir)
    end
end

local function load_settings_file()
    if not fs.exists(SETTINGS_FILE) then
        return {}
    end
    local content, err = utils.read_file(SETTINGS_FILE)
    if not content then
        logger:warn("LuaTools: Failed to read settings file: " .. (err or "unknown"))
        return {}
    end
    local ok, data = pcall(json.decode, content)
    if not ok or type(data) ~= "table" then
        logger:warn("LuaTools: Failed to parse settings file")
        return {}
    end
    return data
end

local function write_settings_file(data)
    ensure_settings_dir()
    local ok, encoded = pcall(json.encode, data)
    if not ok then
        logger:warn("LuaTools: Failed to encode settings: " .. tostring(encoded))
        return
    end
    local success, err = utils.write_file(SETTINGS_FILE, encoded)
    if not success then
        logger:warn("LuaTools: Failed to write settings file: " .. (err or "unknown"))
    end
end

local function persist_values(values)
    local payload = { version = SCHEMA_VERSION, values = values }
    write_settings_file(payload)
    -- Deep copy for cache
    local ok, copy = pcall(json.decode, json.encode(values))
    _settings_cache = ok and copy or values
end

-- ─── Validation ───

local function ensure_language_valid(values)
    local general = values.general
    local changed = false
    if type(general) ~= "table" then
        general = {}
        values.general = general
        changed = true
    end

    local available = available_locale_codes()
    local codes_set = {}
    for _, loc in ipairs(available) do
        codes_set[loc.code] = true
    end
    codes_set[locale_loader.DEFAULT_LOCALE] = true

    local current = general.language
    if not codes_set[current] then
        logger:warn("LuaTools: language '" .. tostring(current) .. "' not available, falling back to " .. locale_loader.DEFAULT_LOCALE)
        general.language = locale_loader.DEFAULT_LOCALE
        changed = true
    end
    return changed
end

local function validate_option_value(option, value)
    if option.option_type == "toggle" then
        if type(value) == "boolean" then
            return true, value, nil
        end
        if type(value) == "string" then
            local lowered = utils.trim(value):lower()
            if lowered == "true" or lowered == "1" or lowered == "yes" or lowered == "y" then
                return true, true, nil
            end
            if lowered == "false" or lowered == "0" or lowered == "no" or lowered == "n" then
                return true, false, nil
            end
        end
        return false, option.default_value, "Value must be a boolean"
    end

    if option.option_type == "text" then
        if value == nil then return true, "", nil end
        return true, utils.trim(tostring(value)), nil
    end

    if option.option_type == "select" then
        local dynamic = type(option.metadata) == "table" and option.metadata.dynamicChoices or nil

        if dynamic == "locales" then
            local available = available_locale_codes()
            local allowed_map = {}
            for _, loc in ipairs(available) do
                local code = tostring(loc.code or ""):match("^%s*(.-)%s*$")
                if code ~= "" then
                    allowed_map[code:lower()] = code
                    if loc.name and loc.name ~= "" then
                        allowed_map[loc.name:lower()] = code
                    end
                    if loc.nativeName and loc.nativeName ~= "" then
                        allowed_map[loc.nativeName:lower()] = code
                    end
                end
            end
            local candidate = utils.trim(tostring(value or ""))
            local matched = allowed_map[candidate:lower()]
            if matched then return true, matched, nil end
            return false, option.default_value, "Value not in list of allowed options"

        elseif dynamic == "themes" then
            local available = available_theme_files()
            local allowed_map = {}
            for _, theme in ipairs(available) do
                local tv = utils.trim(tostring(theme.value or ""))
                if tv ~= "" then
                    allowed_map[tv:lower()] = tv
                    if theme.label and theme.label ~= "" then
                        allowed_map[theme.label:lower()] = tv
                    end
                end
            end
            local candidate = utils.trim(tostring(value or ""))
            local matched = allowed_map[candidate:lower()]
            if matched then return true, matched, nil end
            return false, option.default_value, "Value not in list of allowed options"

        else
            local allowed = {}
            for _, choice in ipairs(option.choices or {}) do
                if type(choice) == "table" and choice.value ~= nil then
                    allowed[tostring(choice.value)] = true
                end
            end
            if allowed[tostring(value)] then
                return true, value, nil
            end
            return false, option.default_value, "Value not in list of allowed options"
        end
    end

    -- Fallback: accept any value
    return true, value, nil
end

-- ─── Initialization ───

local function load_settings_cache()
    if _settings_cache then return _settings_cache end

    local raw_data = load_settings_file()
    local version = raw_data.version or 0
    local values = raw_data.values

    local first_launch = not values or (type(values) == "table" and not next(values))
    local merged = options.merge_defaults_with_values(values)

    -- On first launch, auto-detect Steam language
    if first_launch then
        local detected = steam_utils.detect_steam_language()
        if detected then
            local available = available_locale_codes()
            local codes_set = {}
            for _, loc in ipairs(available) do codes_set[loc.code] = true end
            if codes_set[detected] then
                if not merged.general then merged.general = {} end
                merged.general.language = detected
                logger:info("LuaTools: first launch, auto-selected language '" .. detected .. "'")
            else
                logger:info("LuaTools: detected locale '" .. detected .. "' not available, using default")
            end
        end
    end

    -- Compare loosely: if version changed or values differ, persist
    if version ~= SCHEMA_VERSION or first_launch then
        write_settings_file({ version = SCHEMA_VERSION, values = merged })
    end

    _settings_cache = merged
    return merged
end

function M.init_settings()
    load_settings_cache()
end

-- ─── Getters ───

local function get_values()
    local values = load_settings_cache()
    if type(values) ~= "table" then values = {} end
    if ensure_language_valid(values) then
        persist_values(values)
    end
    return values
end

function M.get_current_language()
    local values = get_values()
    local general = values.general or {}
    local use_steam = general.useSteamLanguage
    if use_steam ~= false then
        local detected = steam_utils.detect_steam_language()
        if detected then return detected end
    end
    return tostring(general.language or locale_loader.DEFAULT_LOCALE)
end

function M.get_morrenus_api_key()
    local values = get_values()
    local general = values.general or {}
    return tostring(general.morrenusApiKey or "")
end

function M.get_available_locales()
    return available_locale_codes()
end

function M.get_settings_payload()
    local values = get_values()
    -- Deep copy via JSON round-trip
    local ok, values_snapshot = pcall(function()
        return json.decode(json.encode(values))
    end)
    if not ok then values_snapshot = values end

    local schema = options.get_settings_schema()
    -- Inject dynamic choices into schema
    local locales = M.get_available_locales()
    local locale_choices = {}
    for _, loc in ipairs(locales) do
        locale_choices[#locale_choices + 1] = {
            value = loc.code,
            label = loc.nativeName or loc.name or loc.code,
        }
    end
    local theme_choices = available_theme_files()

    for _, group in ipairs(schema) do
        if group.key == "general" then
            for _, opt in ipairs(group.options or {}) do
                if opt.key == "language" then
                    opt.choices = locale_choices
                elseif opt.key == "theme" then
                    opt.choices = theme_choices
                end
            end
        end
    end

    -- Determine active language
    local general = values_snapshot.general or {}
    local language
    if general.useSteamLanguage ~= false then
        local detected = steam_utils.detect_steam_language()
        local codes_set = {}
        for _, loc in ipairs(locales) do codes_set[loc.code] = true end
        if detected and codes_set[detected] then
            language = detected
        else
            language = tostring(general.language or locale_loader.DEFAULT_LOCALE)
        end
    else
        language = tostring(general.language or locale_loader.DEFAULT_LOCALE)
    end

    local translations = locale_loader.get_locale_strings(language)

    return {
        version = SCHEMA_VERSION,
        values = values_snapshot,
        schema = schema,
        language = language,
        locales = locales,
        translations = translations,
    }
end

function M.get_translation_map(locale)
    local locales = locale_loader.available_locales()
    local codes_set = {}
    for _, item in ipairs(locales) do codes_set[item.code] = true end
    codes_set[locale_loader.DEFAULT_LOCALE] = true

    if not codes_set[locale] then
        locale = M.get_current_language()
    end
    if not codes_set[locale] then
        locale = locale_loader.DEFAULT_LOCALE
    end

    return {
        language = locale,
        locales = locales,
        strings = locale_loader.get_locale_strings(locale),
    }
end

-- ─── Change hooks ───

function M.register_change_hook(group_key, option_key, callback)
    local key = group_key .. "." .. option_key
    if not _change_hooks[key] then
        _change_hooks[key] = {}
    end
    local hooks = _change_hooks[key]
    hooks[#hooks + 1] = callback
end

-- ─── Apply changes ───

function M.apply_settings_changes(changes)
    if type(changes) ~= "table" then
        return { success = false, error = "Invalid payload" }
    end

    local current = get_values()
    local updated = options.merge_defaults_with_values(current)
    local errors = {}
    local applied_changes = {}

    for group_key, options_changes in pairs(changes) do
        if type(options_changes) ~= "table" then
            if not errors[group_key] then errors[group_key] = {} end
            errors[group_key]["*"] = "Group payload must be an object"
            goto continue_group
        end

        if not updated[group_key] then
            if not errors[group_key] then errors[group_key] = {} end
            errors[group_key]["*"] = "Unknown settings group"
            goto continue_group
        end

        for option_key, value in pairs(options_changes) do
            local lookup_key = group_key .. "." .. option_key
            local option = _option_lookup[lookup_key]
            if not option then
                if not errors[group_key] then errors[group_key] = {} end
                errors[group_key][option_key] = "Unknown option"
                goto continue_option
            end

            local is_valid, normalised, err_msg = validate_option_value(option, value)
            if not is_valid then
                if not errors[group_key] then errors[group_key] = {} end
                errors[group_key][option_key] = err_msg or "Invalid value"
                goto continue_option
            end

            local previous = updated[group_key][option_key]
            if previous == nil then previous = option.default_value end
            if previous == normalised then
                goto continue_option
            end

            updated[group_key][option_key] = normalised
            applied_changes[#applied_changes + 1] = {
                key = lookup_key,
                group = group_key,
                option = option_key,
                previous = previous,
                current = normalised,
            }

            ::continue_option::
        end

        ::continue_group::
    end

    -- Check for errors
    if next(errors) then
        return { success = false, errors = errors }
    end

    local language_changed = ensure_language_valid(updated)

    if #applied_changes == 0 and not language_changed then
        local language = tostring((updated.general or {}).language or locale_loader.DEFAULT_LOCALE)
        local translations = locale_loader.get_locale_strings(language)
        return {
            success = true,
            values = updated,
            language = language,
            translations = translations,
            message = "No-op",
        }
    end

    persist_values(updated)

    -- Invoke hooks
    for _, change in ipairs(applied_changes) do
        local hooks = _change_hooks[change.key] or {}
        for _, callback in ipairs(hooks) do
            local ok, hook_err = pcall(callback, change.previous, change.current)
            if not ok then
                logger:warn("LuaTools: settings hook failed for " .. change.key .. ": " .. tostring(hook_err))
            end
        end
    end

    local language = tostring((updated.general or {}).language or locale_loader.DEFAULT_LOCALE)
    local translations = locale_loader.get_locale_strings(language)

    return {
        success = true,
        values = updated,
        language = language,
        translations = translations,
    }
end

return M
