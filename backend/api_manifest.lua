--- Management of the LuaTools API manifest (free API list).

local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local regex = require("regex")
local paths = require("paths")
local config = require("config")
local http_utils = require("http_utils")
local settings_manager = require("settings.manager")

local M = {}

local _apis_init_done = false
local _init_apis_last_message = ""

-- ─── Helpers ───

local function count_apis(text)
    local ok, data = pcall(json.decode, text)
    if ok and type(data) == "table" then
        local api_list = data.api_list
        if type(api_list) == "table" then
            return #api_list
        end
    end
    -- Fallback: count occurrences of "name"
    local count = 0
    for _ in text:gmatch('"name"') do count = count + 1 end
    return count
end

local function normalize_manifest_text(text)
    local content = utils.trim(text or "")
    if content == "" then return content end

    -- Remove trailing commas before ] and }
    content = regex.replace(content, ",%s*]", "]") or content
    content = regex.replace(content, ",%s*}%s*$", "}") or content

    -- Wrap bare api_list in braces
    if utils.startswith(content, '"api_list"') or
       utils.startswith(content, "'api_list'") or
       utils.startswith(content, "api_list") then
        if not utils.startswith(content, "{") then
            content = "{" .. content
        end
        if not utils.endswith(content, "}") then
            -- Strip trailing comma
            content = content:gsub(",%s*$", "") .. "}"
        end
    end

    -- Validate JSON
    local ok, _ = pcall(json.decode, content)
    if ok then return content end
    return text
end

local function api_json_path()
    return paths.backend_path(config.API_JSON_FILE)
end

local function read_text(path)
    if not fs.exists(path) then return "" end
    local content, _ = utils.read_file(path)
    return content or ""
end

local function write_text(path, text)
    utils.write_file(path, text)
end

-- ─── Public API ───

function M.init_apis()
    logger:info("InitApis: invoked")
    if _apis_init_done then
        logger:info("InitApis: already completed this session, skipping")
        return json.encode({ success = true, message = _init_apis_last_message })
    end

    local path = api_json_path()
    local message = ""

    if fs.exists(path) then
        logger:info("InitApis: Local file exists -> " .. path .. "; skipping remote fetch")
    else
        logger:info("InitApis: Local file not found -> " .. path)
        local manifest_text = ""

        local resp, err = http_utils.get(config.API_MANIFEST_URL, {
            fallback_url = config.API_MANIFEST_PROXY_URL,
        })

        if resp then
            manifest_text = resp.body or ""
            logger:info("InitApis: Fetched manifest, length=" .. #manifest_text)
        else
            logger:warn("InitApis: Failed to fetch free API manifest: " .. (err or "unknown"))
        end

        local normalized = manifest_text ~= "" and normalize_manifest_text(manifest_text) or ""
        if normalized ~= "" then
            write_text(path, normalized)
            local cnt = count_apis(normalized)
            message = "No API's Configured, Loaded " .. cnt .. " Free Ones :D"
            logger:info("InitApis: Wrote new api.json with " .. cnt .. " entries")
        else
            message = "No API's Configured and failed to load free ones"
            logger:warn("InitApis: Manifest empty, nothing written")
        end
    end

    _apis_init_done = true
    _init_apis_last_message = message
    return json.encode({ success = true, message = message })
end

function M.get_init_apis_message()
    local msg = _init_apis_last_message or ""
    _init_apis_last_message = ""
    return json.encode({ success = true, message = msg })
end

function M.store_last_message(message)
    _init_apis_last_message = message or ""
end

function M.fetch_free_apis_now()
    logger:info("LuaTools: FetchFreeApisNow invoked")

    local resp, err = http_utils.get(config.API_MANIFEST_URL, {
        fallback_url = config.API_MANIFEST_PROXY_URL,
    })

    if not resp then
        return json.encode({ success = false, error = "Failed to fetch manifest: " .. (err or "unknown") })
    end

    local manifest_text = resp.body or ""
    local normalized = manifest_text ~= "" and normalize_manifest_text(manifest_text) or ""
    if normalized == "" then
        return json.encode({ success = false, error = "Empty manifest" })
    end

    write_text(api_json_path(), normalized)
    local cnt = count_apis(normalized)
    return json.encode({ success = true, count = cnt })
end

function M.load_api_manifest()
    local path = api_json_path()
    local text = read_text(path)

    local normalized = normalize_manifest_text(text)
    if normalized ~= "" and normalized ~= text then
        pcall(write_text, path, normalized)
        text = normalized
    end

    if text == "" then text = "{}" end
    local ok, data = pcall(json.decode, text)
    if not ok or type(data) ~= "table" then
        logger:error("LuaTools: Failed to parse api.json")
        return {}
    end

    local apis = data.api_list or {}
    local enabled = {}
    for _, api in ipairs(apis) do
        if type(api) == "table" and api.enabled then
            enabled[#enabled + 1] = api
        end
    end
    return enabled
end

function M.get_api_list()
    local ok, result = pcall(function()
        local apis = M.load_api_manifest()
        local morrenus_key = settings_manager.get_morrenus_api_key()
        local api_names = {}

        for i, api in ipairs(apis) do
            local url = api.url or ""
            -- Skip APIs requiring Morrenus key if not configured
            if url:find("<moapikey>", 1, true) and (not morrenus_key or morrenus_key == "") then
                goto continue
            end
            api_names[#api_names + 1] = { name = api.name or "Unknown", index = i - 1 }
            ::continue::
        end

        return json.encode({ success = true, apis = api_names })
    end)

    if ok then return result end
    return json.encode({ success = false, error = tostring(result), apis = {} })
end

return M
