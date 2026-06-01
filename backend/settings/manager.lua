local fs = require("fs")
local cjson = require("json")
local paths = require("paths")
local logger = require("plugin_logger")
local utils = require("plugin_utils")
local locales = require("locales.manager")
local options = require("settings.options")

local SCHEMA_VERSION = 1
local SETTINGS_FILE = paths.backend_path("data/settings.json")

local _SETTINGS_CACHE = nil

-- Simple placeholder since we can't easily read registry in Millennium Lua securely
local function _detect_steam_language()
    return "en"
end

local function _available_locale_codes()
    local manager = locales.get_locale_manager()
    local avail = manager:available_locales()
    if not avail or #avail == 0 then
        return {{code = locales.DEFAULT_LOCALE, name = "English", nativeName = "English"}}
    end
    return avail
end

local function _ensure_language_valid(values)
    local general = values.general
    local changed = false
    if type(general) ~= "table" then
        general = {}
        values.general = general
        changed = true
    end

    local available_codes = {}
    for _, loc in ipairs(_available_locale_codes()) do
        available_codes[loc.code] = true
    end
    available_codes[locales.DEFAULT_LOCALE] = true

    local current_language = general.language
    if not available_codes[current_language] then
        general.language = locales.DEFAULT_LOCALE
        changed = true
    end
    return changed
end

local function _available_theme_files()
    local themes = {}
    
    local themes_json_path = fs.join(paths.get_plugin_dir(), "public", "themes", "themes.json")
    if fs.exists(themes_json_path) then
        local success, data = pcall(cjson.decode, utils.read_text(themes_json_path))
        if success and type(data) == "table" then
            for _, item in ipairs(data) do
                if type(item) == "table" and item.value then
                    table.insert(themes, {value = tostring(item.value), label = tostring(item.label or item.value)})
                end
            end
        end
    end

    if #themes == 0 then
        local themes_dir = fs.join(paths.get_plugin_dir(), "public", "themes")
        if fs.exists(themes_dir) then
            local success, files = pcall(fs.list, themes_dir)
            if success and files then
                for _, entry in ipairs(files) do
                    local filename = entry.name
                    if filename:match("%.css$") then
                        local theme_name = filename:sub(1, -5)
                        local display_name = theme_name:gsub("^%l", string.upper)
                        table.insert(themes, {value = theme_name, label = display_name})
                    end
                end
            end
        end
    end

    if #themes == 0 then
        themes = {
            {value = "original", label = "Original"},
            {value = "dark", label = "Dark"},
            {value = "light", label = "Light"}
        }
    end

    return themes
end

local function _inject_locale_choices(schema)
    local locale_choices = {}
    for _, loc in ipairs(_available_locale_codes()) do
        table.insert(locale_choices, {
            value = loc.code,
            label = loc.nativeName or loc.name or loc.code
        })
    end
    local theme_choices = _available_theme_files()

    for _, group in ipairs(schema) do
        if group.key == "general" then
            for _, opt in ipairs(group.options or {}) do
                if opt.key == "language" then
                    opt.choices = locale_choices
                    opt.metadata = opt.metadata or {}
                    opt.metadata.dynamicChoices = "locales"
                elseif opt.key == "theme" then
                    opt.choices = theme_choices
                    opt.metadata = opt.metadata or {}
                    opt.metadata.dynamicChoices = "themes"
                end
            end
        end
    end
    return schema
end

local function _load_settings_file()
    if not fs.exists(SETTINGS_FILE) then return {} end
    local data = utils.read_json(SETTINGS_FILE)
    return data or {}
end

local function _write_settings_file(data)
    local dir = fs.parent_path(SETTINGS_FILE)
    if not fs.exists(dir) then fs.create_directories(dir) end
    utils.write_json(SETTINGS_FILE, data)
end

local function _persist_values(values)
    local payload = {version = SCHEMA_VERSION, values = values}
    _write_settings_file(payload)
    _SETTINGS_CACHE = utils.read_json(SETTINGS_FILE).values or values
end

local manager = {}

function manager._load_settings_cache()
    if _SETTINGS_CACHE then return _SETTINGS_CACHE end
    local raw_data = _load_settings_file()
    local version = raw_data.version or 0
    local values = raw_data.values

    local first_launch = (values == nil)
    local merged_values = options.merge_defaults_with_values(values)

    if first_launch then
        local detected = _detect_steam_language()
        if detected then
            merged_values.general = merged_values.general or {}
            merged_values.general.language = detected
        end
    end

    if version ~= SCHEMA_VERSION or type(values) ~= "table" then
        _write_settings_file({version = SCHEMA_VERSION, values = merged_values})
    end
    
    _SETTINGS_CACHE = merged_values
    return merged_values
end

function manager._get_values_locked()
    local values = manager._load_settings_cache()
    if type(values) ~= "table" then values = {} end
    if _ensure_language_valid(values) then
        _persist_values(values)
    end
    return values
end

function manager.init_settings()
    manager._load_settings_cache()
end

function manager.get_settings_state()
    local values = manager._get_values_locked()
    return {
        version = SCHEMA_VERSION,
        values = values
    }
end

function manager.get_current_language()
    local values = manager._get_values_locked()
    local general = values.general or {}
    if general.useSteamLanguage ~= false then
        local detected = _detect_steam_language()
        if detected then return detected end
    end
    return tostring(general.language or locales.DEFAULT_LOCALE)
end

function manager.get_morrenus_api_key()
    local values = manager._get_values_locked()
    local general = values.general or {}
    return tostring(general.morrenusApiKey or "")
end

function manager.get_available_locales()
    return _available_locale_codes()
end

function manager.get_settings_payload()
    local values = manager._get_values_locked()
    local schema = _inject_locale_choices(options.get_settings_schema())
    local avail_locales = manager.get_available_locales()
    local language = manager.get_current_language()
    local translations = locales.get_locale_manager():get_locale_strings(language)

    return {
        version = SCHEMA_VERSION,
        values = values,
        schema = schema,
        language = language,
        locales = avail_locales,
        translations = translations
    }
end

function manager.apply_settings_changes(changes)
    if type(changes) ~= "table" then return {success = false, error = "Invalid payload"} end
    local current = manager._get_values_locked()
    local updated = options.merge_defaults_with_values(current)

    for group_key, options_changes in pairs(changes) do
        if type(options_changes) == "table" and updated[group_key] then
            for option_key, value in pairs(options_changes) do
                updated[group_key][option_key] = value
            end
        end
    end

    _ensure_language_valid(updated)
    _persist_values(updated)

    local language = updated.general and updated.general.language or locales.DEFAULT_LOCALE
    local translations = locales.get_locale_manager():get_locale_strings(language)

    return {
        success = true,
        values = updated,
        language = language,
        translations = translations
    }
end

return manager
