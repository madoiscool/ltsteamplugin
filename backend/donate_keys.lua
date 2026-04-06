--- Key donation: parse config.vdf for decryption keys and submit them.

local fs = require("fs")
local logger = require("logger")
local regex = require("regex")
local utils = require("utils")
local config = require("config")
local http_utils = require("http_utils")
local steam_utils = require("steam_utils")

local M = {}

-- ─── Validation ───

local function validate_appid_key_pair(appid, key)
    if type(appid) ~= "string" or type(key) ~= "string" then
        return false
    end

    -- AppID: numeric only, max 10 digits
    if not appid:match("^%d+$") or #appid > 10 then
        return false
    end

    -- Decryption key: exactly 64 chars, alphanumeric only
    if #key ~= 64 then
        return false
    end
    if not key:match("^[a-zA-Z0-9]+$") then
        return false
    end

    return true
end

-- ─── VDF parsing for decryption keys ───

local function find_decryption_keys(data, pairs_list)
    if type(data) ~= "table" then return end

    for key, value in pairs(data) do
        if type(value) == "table" then
            -- Check if this entry has a DecryptionKey
            local decryption_key = value.DecryptionKey
            if type(decryption_key) == "string" then
                local appid = utils.trim(tostring(key))
                local key_value = utils.trim(decryption_key)
                if appid ~= "" and key_value ~= "" then
                    pairs_list[#pairs_list + 1] = { appid = appid, key = key_value }
                end
            else
                -- Recurse into nested tables
                find_decryption_keys(value, pairs_list)
            end
        end
    end
end

local function parse_config_vdf_decryption_keys(steam_path)
    local config_path = fs.join(steam_path, "config", "config.vdf")

    if not fs.exists(config_path) then
        logger:warn("LuaTools: config.vdf not found at " .. config_path)
        return {}
    end

    local content, err = utils.read_file(config_path)
    if not content then
        logger:warn("LuaTools: Failed to read config.vdf: " .. (err or "unknown"))
        return {}
    end

    local ok, vdf_data = pcall(steam_utils.parse_vdf, content)
    if not ok then
        logger:warn("LuaTools: Failed to parse config.vdf: " .. tostring(vdf_data))
        return {}
    end

    local pairs_list = {}
    find_decryption_keys(vdf_data, pairs_list)
    return pairs_list
end

-- ─── Public API ───

function M.extract_valid_decryption_keys(steam_path)
    if not steam_path or steam_path == "" or not fs.exists(steam_path) then
        logger:warn("LuaTools: Invalid Steam path for donate keys: " .. tostring(steam_path))
        return {}
    end

    logger:info("LuaTools: Starting donate keys extraction...")

    local all_pairs = parse_config_vdf_decryption_keys(steam_path)
    local valid_pairs = {}

    for _, pair in ipairs(all_pairs) do
        if validate_appid_key_pair(pair.appid, pair.key) then
            valid_pairs[#valid_pairs + 1] = pair
        else
            logger:info("LuaTools: Invalid appid/key pair skipped: appid=" .. pair.appid .. ", key_len=" .. #pair.key)
        end
    end

    logger:info("LuaTools: Found " .. #valid_pairs .. " valid decryption key pairs")
    return valid_pairs
end

function M.send_donation_keys(pairs_list)
    if not pairs_list or #pairs_list == 0 then
        logger:info("LuaTools: No keys to donate")
        return false
    end

    -- Format: "appid:key,appid:key"
    local formatted = {}
    for _, pair in ipairs(pairs_list) do
        formatted[#formatted + 1] = pair.appid .. ":" .. pair.key
    end
    local body = table.concat(formatted, ",")

    logger:info("LuaTools: Sending " .. #pairs_list .. " appid/key pairs to donation endpoint...")

    local resp, err = http_utils.post(config.DONATE_KEYS_URL, body, {
        headers = {
            ["Content-Type"] = "text/plain",
            ["User-Agent"] = config.USER_AGENT,
        },
    })

    if resp then
        logger:info("LuaTools: Donated AppIDs: " .. #pairs_list .. " - Resp: " .. tostring(resp.status))
        return true
    else
        logger:warn("LuaTools: Failed to send donation keys: " .. (err or "unknown"))
        return false
    end
end

function M.check_and_donate_keys()
    local settings_manager = require("settings.manager")
    local values = settings_manager.get_settings_payload().values or {}
    local general = values.general or {}
    local donate_enabled = general.donateKeys

    if donate_enabled == false then
        return
    end

    local steam_path = steam_utils.detect_steam_install_path()
    if not steam_path or steam_path == "" then
        logger:warn("LuaTools: Cannot donate keys - Steam path not found")
        return
    end

    local pairs_list = M.extract_valid_decryption_keys(steam_path)
    if #pairs_list > 0 then
        M.send_donation_keys(pairs_list)
    else
        logger:info("LuaTools: No valid keys found to donate")
    end
end

return M
