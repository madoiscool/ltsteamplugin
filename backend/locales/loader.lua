--- Locale manager: loads JSON locale files with English fallback chain.

local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local paths = require("paths")

local M = {}

M.DEFAULT_LOCALE = "en"
M.PLACEHOLDER_VALUE = "translation missing"

local _locales = {}       -- { [code] = { meta, strings, raw } }
local _english_strings = {}
local _english_meta = {}
local _initialized = false

local function locales_dir()
    return paths.locales_dir()
end

local function locale_path(locale)
    return fs.join(locales_dir(), locale .. ".json")
end

local function read_locale_file(locale)
    local path = locale_path(locale)
    if not fs.exists(path) then
        return {}, {}
    end

    local content, err = utils.read_file(path)
    if not content then
        logger:warn("LuaTools: Failed to read locale file " .. path .. ": " .. (err or "unknown"))
        return {}, {}
    end

    local ok, data = pcall(json.decode, content)
    if not ok or type(data) ~= "table" then
        logger:warn("LuaTools: Failed to parse locale file " .. path)
        return {}, {}
    end

    local meta = data._meta or {}
    local strings = data.strings

    if type(meta) ~= "table" then meta = {} end

    if type(strings) == "table" then
        -- Ensure all values are strings
        local clean = {}
        for k, v in pairs(strings) do
            clean[tostring(k)] = tostring(v)
        end
        strings = clean
    else
        -- Backwards compatibility with flat files
        strings = {}
        for key, value in pairs(data) do
            if key ~= "_meta" and type(value) == "string" then
                strings[tostring(key)] = value
            end
        end
    end

    return meta, strings
end

local function normalise_value(value)
    if value == nil then return nil end
    if type(value) ~= "string" then value = tostring(value) end
    local stripped = utils.trim(value)
    if stripped == "" then return nil end
    if stripped:lower() == M.PLACEHOLDER_VALUE then return nil end
    return value
end

--- Load all locale files into memory.
function M.refresh()
    local dir = locales_dir()
    if not fs.exists(dir) then
        logger:warn("LuaTools: Locales directory not found: " .. dir)
        _initialized = true
        return
    end

    -- Load English first (fallback)
    local en_meta, en_strings = read_locale_file(M.DEFAULT_LOCALE)
    if not next(en_strings) then
        logger:warn("LuaTools: Default locale en.json is empty or missing.")
        en_strings = {}
    end
    _english_meta = en_meta
    _english_meta.code = M.DEFAULT_LOCALE
    _english_strings = en_strings
    _locales = {}

    -- List all JSON files
    local files = fs.list(dir)
    if not files then
        _initialized = true
        return
    end

    for _, entry in ipairs(files) do
        local name = entry.name or ""
        if name:match("%.json$") then
            local locale_code = name:sub(1, -6) -- remove .json
            local locale_meta, locale_strings = read_locale_file(locale_code)

            -- Fill missing keys with placeholder (don't write back to avoid file churn)
            if locale_code ~= M.DEFAULT_LOCALE then
                for key, _ in pairs(_english_strings) do
                    if not locale_strings[key] then
                        locale_strings[key] = M.PLACEHOLDER_VALUE
                    end
                end
            end

            -- Build merged strings with English fallback
            local merged_strings = {}
            for key, english_value in pairs(_english_strings) do
                local candidate = locale_strings[key]
                local normalised = normalise_value(candidate)
                if normalised and locale_code ~= M.DEFAULT_LOCALE then
                    merged_strings[key] = normalised
                else
                    local fallback = normalise_value(english_value)
                    merged_strings[key] = fallback or M.PLACEHOLDER_VALUE
                end
            end

            local meta_payload = {}
            for k, v in pairs(locale_meta) do meta_payload[k] = v end
            meta_payload.code = locale_code
            if not meta_payload.name and not meta_payload.nativeName then
                meta_payload.name = locale_code
                meta_payload.nativeName = locale_code
            end

            _locales[locale_code] = {
                meta = meta_payload,
                strings = merged_strings,
                raw = locale_strings,
            }
        end
    end

    -- Ensure default locale is present
    if not _locales[M.DEFAULT_LOCALE] then
        local default_strings = {}
        for key, value in pairs(_english_strings) do
            default_strings[key] = normalise_value(value) or M.PLACEHOLDER_VALUE
        end
        _locales[M.DEFAULT_LOCALE] = {
            meta = _english_meta,
            strings = default_strings,
            raw = _english_strings,
        }
    end

    _initialized = true
end

--- Return list of available locales with metadata.
function M.available_locales()
    if not _initialized then M.refresh() end

    local result = {}
    -- Collect and sort by code
    local codes = {}
    for code, _ in pairs(_locales) do
        codes[#codes + 1] = code
    end
    table.sort(codes)

    for _, code in ipairs(codes) do
        local payload = _locales[code]
        local meta = payload.meta or {}
        result[#result + 1] = {
            code = code,
            name = meta.name or code,
            nativeName = meta.nativeName or meta.name or code,
        }
    end
    return result
end

--- Get all strings for a locale (with fallback to English).
function M.get_locale_strings(locale)
    if not _initialized then M.refresh() end

    local payload = _locales[locale]
    if not payload then
        payload = _locales[M.DEFAULT_LOCALE]
    end
    if not payload then return {} end

    -- Return a copy
    local result = {}
    for k, v in pairs(payload.strings or {}) do
        result[k] = v
    end
    return result
end

--- Translate a single key with fallback chain.
function M.translate(key, locale)
    if not key or key == "" then return M.PLACEHOLDER_VALUE end
    if not _initialized then M.refresh() end

    local payload = _locales[locale]
    if payload then
        local value = (payload.strings or {})[key]
        if value then return value end
    end

    local en_payload = _locales[M.DEFAULT_LOCALE]
    if en_payload then
        local value = (en_payload.strings or {})[key]
        if value then return value end
    end

    return M.PLACEHOLDER_VALUE
end

return M
