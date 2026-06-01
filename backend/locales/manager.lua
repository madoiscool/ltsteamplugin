local fs = require("fs")
local utils = require("plugin_utils")
local paths = require("paths")
local logger = require("plugin_logger")

local DEFAULT_LOCALE = "en"
local PLACEHOLDER_VALUE = "translation missing"
local LOCALES_DIR = paths.backend_path("locales")

local function _ensure_locales_dir()
    if not fs.exists(LOCALES_DIR) then
        fs.create_directories(LOCALES_DIR)
    end
end

local function _locale_path(locale)
    return fs.join(LOCALES_DIR, locale .. ".json")
end

local function _read_locale_file(locale)
    local path = _locale_path(locale)
    if not fs.exists(path) then
        return {}, {}
    end
    local data = utils.read_json(path)
    if not data then return {}, {} end

    local meta = data._meta or {}
    local strings = data.strings

    if type(strings) ~= "table" then
        strings = {}
        for k, v in pairs(data) do
            if k ~= "_meta" and type(v) == "string" then
                strings[k] = v
            end
        end
    end
    return meta, strings
end

local function _write_locale_file(locale, meta, strings)
    _ensure_locales_dir()
    local data = {
        _meta = meta or {},
        strings = strings or {}
    }
    data._meta.code = locale
    utils.write_json(_locale_path(locale), data)
end

local function _normalise_value(value)
    if not value then return nil end
    local stripped = tostring(value):match("^%s*(.-)%s*$")
    if stripped == "" or stripped:lower() == PLACEHOLDER_VALUE then
        return nil
    end
    return tostring(value)
end

local LocaleManager = {}
LocaleManager.__index = LocaleManager

function LocaleManager.new()
    local self = setmetatable({}, LocaleManager)
    self._locales = {}
    self._english_strings = {}
    self._english_meta = {}
    self:refresh()
    return self
end

function LocaleManager:refresh()
    _ensure_locales_dir()
    local meta, strings = _read_locale_file(DEFAULT_LOCALE)
    if not strings or next(strings) == nil then
        logger.warn("LuaTools: Default locale en.json is empty or missing.")
        strings = {}
    end
    
    self._english_meta = meta
    self._english_meta.code = DEFAULT_LOCALE
    self._english_strings = {}
    for k, v in pairs(strings) do self._english_strings[k] = v end
    self._locales = {}

    local success, files = pcall(fs.list, LOCALES_DIR)
    if success and files then
        for _, entry in ipairs(files) do
            local filename = entry.name
            if filename:match("%.json$") then
                local locale_code = filename:sub(1, -6)
                local l_meta, l_strings = _read_locale_file(locale_code)
                
                if locale_code ~= DEFAULT_LOCALE then
                    local updated = false
                    for key, _ in pairs(self._english_strings) do
                        if not l_strings[key] then
                            l_strings[key] = PLACEHOLDER_VALUE
                            updated = true
                        end
                    end
                    if updated then
                        _write_locale_file(locale_code, l_meta, l_strings)
                    end
                end

                local merged_strings = {}
                for key, english_value in pairs(self._english_strings) do
                    local candidate = l_strings[key]
                    local normalised = _normalise_value(candidate)
                    if normalised and locale_code ~= DEFAULT_LOCALE then
                        merged_strings[key] = normalised
                    else
                        local fallback = _normalise_value(english_value)
                        merged_strings[key] = fallback or PLACEHOLDER_VALUE
                    end
                end

                l_meta.code = locale_code
                local name = l_meta.name or l_meta.nativeName or locale_code
                l_meta.name = name
                l_meta.nativeName = l_meta.nativeName or name

                self._locales[locale_code] = {
                    meta = l_meta,
                    strings = merged_strings,
                    raw = l_strings
                }
            end
        end
    end

    if not self._locales[DEFAULT_LOCALE] then
        local def_strings = {}
        for k, v in pairs(self._english_strings) do
            def_strings[k] = _normalise_value(v) or PLACEHOLDER_VALUE
        end
        self._locales[DEFAULT_LOCALE] = {
            meta = self._english_meta,
            strings = def_strings,
            raw = self._english_strings
        }
    end
end

function LocaleManager:available_locales()
    local locales = {}
    for code, payload in pairs(self._locales) do
        local meta = payload.meta or {}
        table.insert(locales, {
            code = code,
            name = meta.name or code,
            nativeName = meta.nativeName or meta.name or code
        })
    end
    table.sort(locales, function(a, b) return a.code < b.code end)
    return locales
end

function LocaleManager:get_locale_strings(locale)
    local payload = self._locales[locale] or self._locales[DEFAULT_LOCALE]
    local strings = payload and payload.strings or {}
    local result = {}
    for k, v in pairs(strings) do result[k] = v end
    return result
end

function LocaleManager:translate(key, locale)
    if not key then return PLACEHOLDER_VALUE end
    local payload = self._locales[locale]
    if payload and payload.strings and payload.strings[key] then
        return payload.strings[key]
    end
    payload = self._locales[DEFAULT_LOCALE]
    if payload and payload.strings and payload.strings[key] then
        return payload.strings[key]
    end
    return PLACEHOLDER_VALUE
end

local manager_instance = nil
local function get_locale_manager()
    if not manager_instance then
        manager_instance = LocaleManager.new()
    end
    return manager_instance
end

return {
    DEFAULT_LOCALE = DEFAULT_LOCALE,
    PLACEHOLDER_VALUE = PLACEHOLDER_VALUE,
    LOCALES_DIR = LOCALES_DIR,
    get_locale_manager = get_locale_manager
}
