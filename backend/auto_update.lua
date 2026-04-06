--- Auto-update: check GitHub releases, download updates, restart Steam.

local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local paths = require("paths")
local config = require("config")
local http_utils = require("http_utils")

local M = {}

-- ─── Helpers ───

local function parse_version(version_str)
    local parts = {}
    for num in tostring(version_str):gmatch("(%d+)") do
        parts[#parts + 1] = tonumber(num) or 0
    end
    -- Pad to at least 3 parts
    while #parts < 3 do
        parts[#parts + 1] = 0
    end
    return parts
end

local function version_greater(a, b)
    local va = parse_version(a)
    local vb = parse_version(b)
    for i = 1, math.max(#va, #vb) do
        local ai = va[i] or 0
        local bi = vb[i] or 0
        if ai > bi then return true end
        if ai < bi then return false end
    end
    return false
end

local function get_plugin_version()
    local plugin_json_path = fs.join(paths.get_plugin_dir(), "plugin.json")
    local content, _ = utils.read_file(plugin_json_path)
    if not content then return "0.0" end
    local ok, data = pcall(json.decode, content)
    if ok and type(data) == "table" then
        return tostring(data.version or "0.0")
    end
    return "0.0"
end

local function read_json_file(path)
    if not fs.exists(path) then return {} end
    local content, _ = utils.read_file(path)
    if not content then return {} end
    local ok, data = pcall(json.decode, content)
    if ok and type(data) == "table" then return data end
    return {}
end

local function write_json_file(path, data)
    local ok, encoded = pcall(json.encode, data)
    if ok then
        utils.write_file(path, encoded)
    end
end

-- ─── Pending update application ───

function M.apply_pending_update_if_any()
    local pending_zip = paths.backend_path(config.UPDATE_PENDING_ZIP)
    local pending_info = paths.backend_path(config.UPDATE_PENDING_INFO)

    if not fs.exists(pending_zip) then
        return ""
    end

    logger:info("AutoUpdate: Applying pending update from " .. pending_zip)

    -- Extract zip using PowerShell
    local plugin_dir = paths.get_plugin_dir()
    local ok, output = pcall(utils.exec,
        'powershell -NoProfile -Command "Expand-Archive -Path \'' .. pending_zip .. '\' -DestinationPath \'' .. plugin_dir .. '\' -Force"')

    if not ok then
        logger:warn("AutoUpdate: Failed to extract pending update: " .. tostring(output))
        return ""
    end

    -- Clean up zip
    pcall(fs.remove, pending_zip)

    -- Read info for version
    local info = read_json_file(pending_info)
    pcall(fs.remove, pending_info)

    local new_version = tostring(info.version or "")
    if new_version ~= "" then
        return "LuaTools updated to " .. new_version .. ". Please restart Steam."
    end
    return "LuaTools update applied. Please restart Steam."
end

-- ─── GitHub release fetch ───

local function fetch_github_latest(gh_cfg)
    local owner = utils.trim(tostring(gh_cfg.owner or ""))
    local repo = utils.trim(tostring(gh_cfg.repo or ""))
    local asset_name = utils.trim(tostring(gh_cfg.asset_name or "ltsteamplugin.zip"))
    local tag = utils.trim(tostring(gh_cfg.tag or ""))
    local tag_prefix = utils.trim(tostring(gh_cfg.tag_prefix or ""))
    local token = utils.trim(tostring(gh_cfg.token or ""))

    if owner == "" or repo == "" then
        logger:warn("AutoUpdate: github config missing owner or repo")
        return nil
    end

    local endpoint
    if tag ~= "" then
        endpoint = "https://api.github.com/repos/" .. owner .. "/" .. repo .. "/releases/tags/" .. tag
    else
        endpoint = "https://api.github.com/repos/" .. owner .. "/" .. repo .. "/releases/latest"
    end

    local headers = {
        Accept = "application/vnd.github+json",
        ["User-Agent"] = "LuaTools-Updater",
    }
    if token ~= "" then
        headers["Authorization"] = "Bearer " .. token
    end

    -- Try GitHub API
    logger:info("AutoUpdate: Fetching GitHub release from " .. endpoint)
    local resp, err = http_utils.get(endpoint, {
        headers = headers,
        fallback_url = "https://luatools.vercel.app/api/github-latest",
    })

    if not resp then
        logger:warn("AutoUpdate: Failed to fetch release info: " .. (err or "unknown"))
        return nil
    end

    local ok, data = pcall(json.decode, resp.body or "")
    if not ok or type(data) ~= "table" then
        logger:warn("AutoUpdate: Failed to parse release JSON")
        return nil
    end

    local tag_name = utils.trim(tostring(data.tag_name or ""))
    local version = tag_name
    if version == "" then
        version = utils.trim(tostring(data.name or ""))
    end
    if tag_prefix ~= "" and utils.startswith(version, tag_prefix) then
        version = version:sub(#tag_prefix + 1)
    end

    -- Find asset download URL
    local zip_url = ""
    local assets = data.assets
    if type(assets) == "table" then
        for _, asset in ipairs(assets) do
            if type(asset) == "table" then
                local a_name = utils.trim(tostring(asset.name or ""))
                if a_name == asset_name then
                    zip_url = utils.trim(tostring(asset.browser_download_url or ""))
                    break
                end
            end
        end
    end

    -- Fallback to proxy download URL
    if zip_url == "" and tag_name ~= "" then
        zip_url = "https://luatools.vercel.app/api/get-plugin/" .. tag_name
        logger:info("AutoUpdate: Using proxy download URL: " .. zip_url)
    end

    if zip_url == "" then
        logger:warn("AutoUpdate: No download URL found")
        return nil
    end

    return { version = version, zip_url = zip_url }
end

-- ─── Core update check ───

function M.check_for_update_once()
    local cfg_path = paths.backend_path(config.UPDATE_CONFIG_FILE)
    local cfg = read_json_file(cfg_path)

    local latest_version = ""
    local zip_url = ""

    local gh_cfg = cfg.github
    if type(gh_cfg) == "table" then
        local manifest = fetch_github_latest(gh_cfg)
        if manifest then
            latest_version = utils.trim(tostring(manifest.version or ""))
            zip_url = utils.trim(tostring(manifest.zip_url or ""))
        end
    else
        local manifest_url = utils.trim(tostring(cfg.manifest_url or ""))
        if manifest_url == "" then return "" end

        local resp, err = http_utils.get(manifest_url)
        if not resp then
            logger:warn("AutoUpdate: Failed to fetch manifest: " .. (err or "unknown"))
            return ""
        end

        local ok, manifest = pcall(json.decode, resp.body or "")
        if ok and type(manifest) == "table" then
            latest_version = utils.trim(tostring(manifest.version or ""))
            zip_url = utils.trim(tostring(manifest.zip_url or ""))
        end
    end

    if latest_version == "" or zip_url == "" then
        logger:warn("AutoUpdate: Manifest missing version or zip_url")
        return ""
    end

    local current_version = get_plugin_version()
    if not version_greater(latest_version, current_version) then
        logger:info("AutoUpdate: Up-to-date (current " .. current_version .. ", latest " .. latest_version .. ")")
        return ""
    end

    -- Download the update
    logger:info("AutoUpdate: Downloading update " .. latest_version .. " from " .. zip_url)
    local pending_zip = paths.backend_path(config.UPDATE_PENDING_ZIP)
    local pending_info = paths.backend_path(config.UPDATE_PENDING_INFO)

    local resp, err = http_utils.get(zip_url)
    if not resp then
        logger:warn("AutoUpdate: Failed to download update: " .. (err or "unknown"))
        return ""
    end

    -- Write zip to disk
    local write_ok, write_err = utils.write_file(pending_zip, resp.body or "")
    if not write_ok then
        logger:warn("AutoUpdate: Failed to write update zip: " .. (write_err or "unknown"))
        return ""
    end

    -- Try to extract immediately
    local plugin_dir = paths.get_plugin_dir()
    local extract_ok, extract_output = pcall(utils.exec,
        'powershell -NoProfile -Command "Expand-Archive -Path \'' .. pending_zip .. '\' -DestinationPath \'' .. plugin_dir .. '\' -Force"')

    if extract_ok then
        pcall(fs.remove, pending_zip)
        logger:info("AutoUpdate: Update extracted; will take effect after restart")
        return "LuaTools updated to " .. latest_version .. ". Please restart Steam."
    else
        -- Queue for next startup
        logger:warn("AutoUpdate: Extraction failed, will apply on next start: " .. tostring(extract_output))
        write_json_file(pending_info, { version = latest_version, zip_url = zip_url })
        return "Update " .. latest_version .. " downloaded. Restart Steam to apply."
    end
end

-- ─── Steam restart ───

function M.restart_steam()
    local script_path = paths.backend_path("restart_steam.cmd")
    if not fs.exists(script_path) then
        logger:error("LuaTools: restart script not found: " .. script_path)
        return false
    end

    local ok, _ = pcall(utils.exec, 'cmd /C "' .. script_path .. '"')
    if ok then
        logger:info("LuaTools: Restart script launched")
        return true
    else
        logger:error("LuaTools: Failed to launch restart script")
        return false
    end
end

-- ─── Public RPC helpers ───

function M.check_for_updates_now()
    local ok, message = pcall(M.check_for_update_once)
    if ok then
        if message and message ~= "" then
            -- Store message for frontend to pick up
            local api_manifest = require("api_manifest")
            api_manifest.store_last_message(message)
        end
        return { success = true, message = message or "" }
    else
        logger:warn("LuaTools: CheckForUpdatesNow failed: " .. tostring(message))
        return { success = false, error = tostring(message) }
    end
end

function M.start_auto_update_check()
    logger:info("AutoUpdate: Running initial update check...")
    local message = ""

    local ok, result = pcall(M.check_for_update_once)
    if ok and result and result ~= "" then
        message = result
        local api_manifest = require("api_manifest")
        api_manifest.store_last_message(message)
        logger:info("AutoUpdate: Initial check found update: " .. message)
    end

    return message
end

return M
