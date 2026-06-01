local m_utils = require("utils")
local fs = require("fs")
local http_client = require("http_client")
local config = require("config")
local logger = require("plugin_logger")
local paths = require("paths")
local utils = require("plugin_utils")
local steam_utils = require("steam_utils")

local auto_update = {}

function auto_update.check_for_updates_now()
    local cfg_path = paths.backend_path(config.UPDATE_CONFIG_FILE)
    local cfg = utils.read_json(cfg_path)
    
    local latest_version = ""
    local zip_url = ""
    
    local gh_cfg = cfg.github
    if gh_cfg then
        local owner = gh_cfg.owner or ""
        local repo = gh_cfg.repo or ""
        local asset_name = gh_cfg.asset_name or "ltsteamplugin.zip"
        local tag = gh_cfg.tag or ""
        local tag_prefix = gh_cfg.tag_prefix or ""
        
        local endpoint = "https://api.github.com/repos/" .. owner .. "/" .. repo .. "/releases/latest"
        if tag ~= "" then
            endpoint = "https://api.github.com/repos/" .. owner .. "/" .. repo .. "/releases/tags/" .. tag
        end
        
        local resp = http_client.get(endpoint, {
            headers = {
                ["Accept"] = "application/vnd.github+json",
                ["User-Agent"] = "LuaTools-Updater"
            },
            timeout = 10
        })
        if resp and resp.status == 200 and resp.body then
            local data = utils.decode_json(resp.body)
            local tag_name = data.tag_name or ""
            latest_version = tag_name or data.name or ""
            if tag_prefix ~= "" and latest_version:sub(1, #tag_prefix) == tag_prefix then
                latest_version = latest_version:sub(#tag_prefix + 1)
            end
            
            for _, asset in ipairs(data.assets or {}) do
                if asset.name == asset_name then
                    zip_url = asset.browser_download_url
                    break
                end
            end
            if zip_url == "" and tag_name ~= "" then
                zip_url = "https://luatools.vercel.app/api/get-plugin/" .. tag_name
            end
        end
    end
    
    if latest_version == "" or zip_url == "" then
        return { success = false, error = "Manifest missing version or zip_url" }
    end
    
    local current_version = utils.get_plugin_version()

    -- Compare version tables component by component (can't use <= on tables in Lua)
    local function compare_versions(a, b)
        local ta = utils.parse_version(a)
        local tb = utils.parse_version(b)
        local len = math.max(#ta, #tb)
        for i = 1, len do
            local ai = ta[i] or 0
            local bi = tb[i] or 0
            if ai < bi then return -1
            elseif ai > bi then return 1
            end
        end
        return 0
    end

    if compare_versions(latest_version, current_version) <= 0 then
        return { success = true, message = "Up-to-date (current " .. current_version .. ")" }
    end
    
    local pending_zip = paths.backend_path(config.UPDATE_PENDING_ZIP)
    
    local dl_resp = http_client.get(zip_url, { timeout = 30 })
    if dl_resp and dl_resp.status == 200 and dl_resp.body then
        m_utils.write_file(pending_zip, dl_resp.body)
        
        local is_windows = m_utils.getenv("OS") == "Windows_NT"
        local cmd
        if is_windows then
            cmd = 'powershell -Command "Expand-Archive -Force -Path \'' .. pending_zip .. '\' -DestinationPath \'' .. paths.get_plugin_dir() .. '\'"'
        else
            cmd = 'unzip -o -q "' .. pending_zip .. '" -d "' .. paths.get_plugin_dir() .. '"'
        end
        m_utils.exec(cmd)
        fs.remove(pending_zip)
        
        local msg = "LuaTools updated to " .. latest_version .. ". Please restart Steam."
        return { success = true, message = msg }
    end
    
    return { success = false, error = "Update download failed" }
end

function auto_update.restart_steam()
    local is_windows = m_utils.getenv("OS") == "Windows_NT"
    if is_windows then
        local script_path = paths.backend_path("restart_steam.cmd")
        if fs.exists(script_path) then
            m_utils.exec('start /b cmd /C "' .. script_path .. '"')
            return true
        end
    else
        m_utils.exec("killall steam && steam &")
        return true
    end
    return false
end

function auto_update.apply_pending_update_if_any()
    return ""
end

return auto_update
