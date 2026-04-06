--- Game download/install flows, app list caching, and related utilities.

local fs = require("fs")
local http = require("http")
local json = require("json")
local logger = require("logger")
local millennium = require("millennium")
local regex = require("regex")
local utils = require("utils")
local datetime = require("datetime")

local paths = require("paths")
local config = require("config")
local http_utils = require("http_utils")
local steam_utils = require("steam_utils")
local api_manifest = require("api_manifest")
local settings_manager = require("settings.manager")

local M = {}

-- ─── State ───

local download_state = {} -- { [appid] = { status, bytesRead, totalBytes, ... } }
local app_name_cache = {} -- { [appid] = "name" }
local app_info_cache = {} -- { [appid] = { workshop_depot, dlc_list } }
local applist_data = {}   -- { [appid] = "name" }
local applist_loaded = false
local games_db_data = {}
local games_db_loaded = false
local last_api_call_time = 0

-- ─── Download state helpers ───

local function set_download_state(appid, update)
    local state = download_state[appid] or {}
    for k, v in pairs(update) do state[k] = v end
    download_state[appid] = state
end

local function get_download_state(appid)
    local state = download_state[appid] or {}
    -- Return a copy
    local copy = {}
    for k, v in pairs(state) do copy[k] = v end
    return copy
end

-- ─── File paths ───

local function loaded_apps_path()
    return paths.backend_path(config.LOADED_APPS_FILE)
end

local function appid_log_path()
    return paths.backend_path(config.APPID_LOG_FILE)
end

local function applist_file_path()
    return paths.temp_dl_path("all-appids.json")
end

local function games_db_file_path()
    return paths.temp_dl_path("games.json")
end

-- ─── App name helpers ───

local function load_applist_into_memory()
    if applist_loaded then return end

    local file_path = applist_file_path()
    if not fs.exists(file_path) then
        logger:info("LuaTools: Applist file not found, skipping load")
        applist_loaded = true
        return
    end

    local content, err = utils.read_file(file_path)
    if not content then
        logger:warn("LuaTools: Failed to read applist: " .. (err or "unknown"))
        applist_loaded = true
        return
    end

    local ok, data = pcall(json.decode, content)
    if not ok or type(data) ~= "table" then
        logger:warn("LuaTools: Applist file has invalid format")
        applist_loaded = true
        return
    end

    local count = 0
    for _, entry in ipairs(data) do
        if type(entry) == "table" and entry.appid and entry.name then
            local name = tostring(entry.name)
            if utils.trim(name) ~= "" then
                applist_data[tonumber(entry.appid)] = name
                count = count + 1
            end
        end
    end
    logger:info("LuaTools: Loaded " .. count .. " app names from applist")
    applist_loaded = true
end

local function get_app_name_from_applist(appid)
    if not applist_loaded then load_applist_into_memory() end
    return applist_data[tonumber(appid)] or ""
end

local function ensure_applist_file()
    local file_path = applist_file_path()
    if fs.exists(file_path) then
        logger:info("LuaTools: Applist file already exists, skipping download")
        return
    end

    logger:info("LuaTools: Downloading applist...")
    local resp, err = http_utils.get(config.APPLIST_URL, { timeout = 300 })
    if not resp then
        logger:warn("LuaTools: Failed to download applist: " .. (err or "unknown"))
        return
    end

    -- Validate JSON
    local ok, data = pcall(json.decode, resp.body or "")
    if not ok or type(data) ~= "table" then
        logger:warn("LuaTools: Downloaded applist is not valid JSON")
        return
    end

    utils.write_file(file_path, resp.body)
    logger:info("LuaTools: Saved applist file (" .. #data .. " entries)")
end

local function fetch_app_name(appid)
    appid = tonumber(appid)
    if not appid then return "" end

    -- 1. Check cache
    if app_name_cache[appid] and app_name_cache[appid] ~= "" then
        return app_name_cache[appid]
    end

    -- 2. Check applist
    local applist_name = get_app_name_from_applist(appid)
    if applist_name ~= "" then
        app_name_cache[appid] = applist_name
        return applist_name
    end

    -- 3. Steam API (with rate limiting)
    local now = utils.time()
    local wait = config.API_CALL_MIN_INTERVAL - (now - last_api_call_time)
    if wait > 0 then utils.sleep(math.floor(wait * 1000)) end
    last_api_call_time = utils.time()

    local resp, _ = http_utils.get(config.STEAM_STORE_API_URL .. "?appids=" .. appid, { timeout = 10 })
    if resp and resp.body then
        local ok, data = pcall(json.decode, resp.body)
        if ok and type(data) == "table" then
            local entry = data[tostring(appid)]
            if type(entry) == "table" then
                local inner = entry.data
                if type(inner) == "table" and inner.name then
                    local name = utils.trim(tostring(inner.name))
                    if name ~= "" then
                        app_name_cache[appid] = name
                        return name
                    end
                end
            end
        end
    end

    app_name_cache[appid] = ""
    return ""
end

local function fetch_app_info(appid)
    appid = tonumber(appid)
    if not appid then return {} end

    if app_info_cache[appid] and next(app_info_cache[appid]) then
        return app_info_cache[appid]
    end

    local resp, _ = http_utils.get(config.STEAMCMD_API_URL .. "/" .. appid, { timeout = 10 })
    if resp and resp.body then
        local ok, raw = pcall(json.decode, resp.body)
        if ok and type(raw) == "table" then
            local data = raw.data or {}
            local root = data[tostring(appid)] or {}
            local depots = root.depots or {}
            local extended = root.extended or {}

            local output = {
                workshop_depot = depots.workshopdepot or "0",
                dlc_list = extended.listofdlc or "",
            }
            app_info_cache[appid] = output
            return output
        end
    end

    app_info_cache[appid] = {}
    return {}
end

-- ─── Loaded apps tracking ───

local function append_loaded_app(appid, name)
    local path = loaded_apps_path()
    local lines = {}
    if fs.exists(path) then
        local content, _ = utils.read_file(path)
        if content then
            for line in content:gmatch("[^\n]+") do
                if not utils.startswith(line, tostring(appid) .. ":") then
                    lines[#lines + 1] = line
                end
            end
        end
    end
    lines[#lines + 1] = tostring(appid) .. ":" .. name
    utils.write_file(path, table.concat(lines, "\n") .. "\n")
end

local function remove_loaded_app(appid)
    local path = loaded_apps_path()
    if not fs.exists(path) then return end
    local content, _ = utils.read_file(path)
    if not content then return end

    local prefix = tostring(appid) .. ":"
    local new_lines = {}
    for line in content:gmatch("[^\n]+") do
        if not utils.startswith(line, prefix) then
            new_lines[#new_lines + 1] = line
        end
    end
    utils.write_file(path, table.concat(new_lines, "\n") .. (#new_lines > 0 and "\n" or ""))
end

local function log_appid_event(action, appid, name)
    local stamp = datetime.format(datetime.now(), "%Y-%m-%d %H:%M:%S")
    local line = "[" .. action .. "] " .. tostring(appid) .. " - " .. name .. " - " .. stamp .. "\n"
    utils.append_file(appid_log_path(), line)
end

local function get_loaded_app_name(appid)
    local path = loaded_apps_path()
    if fs.exists(path) then
        local content, _ = utils.read_file(path)
        if content then
            local prefix = tostring(appid) .. ":"
            for line in content:gmatch("[^\n]+") do
                if utils.startswith(line, prefix) then
                    local name = line:sub(#prefix + 1)
                    name = utils.trim(name)
                    if name ~= "" then return name end
                end
            end
        end
    end
    return get_app_name_from_applist(appid)
end

local function preload_app_names_cache()
    -- Load from appidlogs.txt
    local log_path = appid_log_path()
    if fs.exists(log_path) then
        local content, _ = utils.read_file(log_path)
        if content then
            for line in content:gmatch("[^\n]+") do
                if line:find("]") and line:find(" %- ") then
                    local after_bracket = line:match("]%s*(.*)")
                    if after_bracket then
                        local parts = utils.split(after_bracket, " - ")
                        if #parts >= 2 then
                            local appid_str = utils.trim(parts[1])
                            local name = utils.trim(parts[2])
                            local appid = tonumber(appid_str)
                            if appid and name ~= "" and not utils.startswith(name, "Unknown") and not utils.startswith(name, "UNKNOWN") then
                                app_name_cache[appid] = name
                            end
                        end
                    end
                end
            end
        end
    end

    -- Load from loadedappids.txt (overrides)
    local apps_path = loaded_apps_path()
    if fs.exists(apps_path) then
        local content, _ = utils.read_file(apps_path)
        if content then
            for line in content:gmatch("[^\n]+") do
                if line:find(":") then
                    local appid_str, name = line:match("^(%d+):(.+)$")
                    if appid_str and name then
                        local appid = tonumber(appid_str)
                        name = utils.trim(name)
                        if appid and name ~= "" then
                            app_name_cache[appid] = name
                        end
                    end
                end
            end
        end
    end

    -- Load applist as fallback
    pcall(load_applist_into_memory)
end

-- ─── Zip processing ───

local function process_and_install_lua(appid, zip_path)
    local base_path = steam_utils.detect_steam_install_path()
    if base_path == "" then
        local ok, p = pcall(millennium.steam_path)
        if ok and p then base_path = p end
    end

    local target_dir = fs.join(base_path, "config", "stplug-in")
    if not fs.exists(target_dir) then
        fs.create_directories(target_dir)
    end

    -- Create temp extraction directory
    local extract_dir = paths.temp_dl_path("extract_" .. appid)
    if fs.exists(extract_dir) then fs.remove_all(extract_dir) end
    fs.create_directories(extract_dir)

    -- Extract zip using PowerShell
    local cmd = 'powershell -NoProfile -Command "Expand-Archive -LiteralPath \'' .. zip_path:gsub("'", "''") .. '\' -DestinationPath \'' .. extract_dir:gsub("'", "''") .. '\' -Force"'
    local output, status = utils.exec(cmd)
    if status and status ~= 0 then
        -- Try tar as fallback
        local cmd2 = 'tar -xf "' .. zip_path .. '" -C "' .. extract_dir .. '"'
        utils.exec(cmd2)
    end

    -- Extract manifests to depotcache
    local depotcache_dir = fs.join(base_path, "depotcache")
    if not fs.exists(depotcache_dir) then fs.create_directories(depotcache_dir) end

    local all_files = fs.list_recursive(extract_dir)
    if all_files then
        for _, entry in ipairs(all_files) do
            if entry.is_file and entry.name:lower():match("%.manifest$") then
                local dest = fs.join(depotcache_dir, entry.name)
                pcall(fs.copy, entry.path, dest)
                logger:info("LuaTools: Extracted manifest -> " .. dest)
            end
        end
    end

    -- Find the numeric .lua file
    local candidates = {}
    if all_files then
        for _, entry in ipairs(all_files) do
            if entry.is_file and entry.name:match("^%d+%.lua$") then
                candidates[#candidates + 1] = entry
            end
        end
    end

    local chosen = nil
    local preferred_name = tostring(appid) .. ".lua"
    for _, entry in ipairs(candidates) do
        if entry.name == preferred_name then
            chosen = entry
            break
        end
    end
    if not chosen and #candidates > 0 then
        chosen = candidates[1]
    end
    if not chosen then
        fs.remove_all(extract_dir)
        error("No numeric .lua file found in zip")
    end

    -- Read and process the lua file
    local lua_content, read_err = utils.read_file(chosen.path)
    if not lua_content then
        fs.remove_all(extract_dir)
        error("Failed to read lua file: " .. (read_err or "unknown"))
    end

    -- Comment out setManifestid lines, track addappid lines
    local processed_lines = {}
    local depot_ids = {}
    local depot_lines = {}

    for line in lua_content:gmatch("[^\n]*") do
        local trimmed = utils.trim(line)
        -- Comment out setManifestid lines (not already commented)
        if trimmed:match("^setManifestid%(") and not trimmed:match("^%-%-") then
            line = line:gsub("^(%s*)", "%1--", 1)
        end
        processed_lines[#processed_lines + 1] = line

        -- Track addappid lines
        if trimmed:match("^addappid%(") and not trimmed:match("^%-%-") then
            local id = trimmed:match("%d+")
            if id then
                depot_ids[#depot_ids + 1] = id
                depot_lines[id] = line
            end
        end
    end

    local processed_text = table.concat(processed_lines, "\n")

    -- Install the processed lua file
    set_download_state(appid, { status = "installing" })
    local dest_file = fs.join(target_dir, tostring(appid) .. ".lua")
    utils.write_file(dest_file, processed_text)
    logger:info("LuaTools: Installed lua -> " .. dest_file)
    set_download_state(appid, { installedPath = dest_file })

    -- Check content (workshop + DLC)
    local ok2, _ = pcall(function()
        local info = fetch_app_info(appid)
        local work_depot = tostring(info.workshop_depot or "0")
        local workshop_result
        if work_depot == "0" then
            workshop_result = "No workshop for the game"
        else
            local found = false
            for _, id in ipairs(depot_ids) do
                if id == work_depot then found = true; break end
            end
            local depot_line_clean = (depot_lines[work_depot] or ""):gsub("%s", "")
            if found and depot_line_clean:match(",%d+,[\"']") then
                workshop_result = "Included"
            else
                workshop_result = "Missing"
            end
        end

        local dlc_result = { included = {}, missing = {} }
        local dlc_list_str = info.dlc_list or ""
        if dlc_list_str ~= "" then
            for dlc_str in dlc_list_str:gmatch("[^,]+") do
                local dlc_id = utils.trim(dlc_str)
                if depot_lines[dlc_id] then
                    dlc_result.included[#dlc_result.included + 1] = tonumber(dlc_id)
                else
                    dlc_result.missing[#dlc_result.missing + 1] = tonumber(dlc_id)
                end
            end
        end

        set_download_state(appid, {
            status = "done",
            contentCheckResult = {
                workshop = workshop_result,
                dlc = dlc_result,
            },
        })
    end)

    if not ok2 then
        set_download_state(appid, { status = "done" })
    end

    -- Cleanup
    pcall(fs.remove_all, extract_dir)
    pcall(fs.remove, zip_path)
end

-- ─── Download flow (synchronous) ───

local function download_zip_for_app(appid)
    local apis = api_manifest.load_api_manifest()
    if not apis or #apis == 0 then
        logger:warn("LuaTools: No enabled APIs in manifest")
        set_download_state(appid, { status = "failed", error = "No APIs available" })
        return
    end

    local dest_path = paths.temp_dl_path(tostring(appid) .. ".zip")
    set_download_state(appid, {
        status = "checking", currentApi = nil,
        bytesRead = 0, totalBytes = 0,
        dest = dest_path, apiErrors = {},
    })

    local morrenus_key = settings_manager.get_morrenus_api_key()

    for _, api in ipairs(apis) do
        local name = api.name or "Unknown"
        local template = api.url or ""
        local success_code = tonumber(api.success_code) or 200
        local unavailable_code = tonumber(api.unavailable_code) or 404

        -- Handle Morrenus API key
        if template:find("<moapikey>", 1, true) then
            if not morrenus_key or morrenus_key == "" then
                logger:info("LuaTools: Skipping API '" .. name .. "' - Morrenus key not configured")
                goto continue_api
            end
            template = template:gsub("<moapikey>", morrenus_key)
        end

        local url = template:gsub("<appid>", tostring(appid))
        set_download_state(appid, { status = "checking", currentApi = name, bytesRead = 0, totalBytes = 0 })
        logger:info("LuaTools: Trying API '" .. name .. "'")

        local ok, result = pcall(function()
            local resp, err = http.get(url, {
                headers = { ["User-Agent"] = config.USER_AGENT },
                follow_redirects = true,
                timeout = config.HTTP_TIMEOUT_SECONDS,
            })

            if not resp then
                error("request failed: " .. (err or "unknown"))
            end

            if resp.status == unavailable_code then
                return "skip"
            end
            if resp.status ~= success_code then
                local state = get_download_state(appid)
                local api_errors = state.apiErrors or {}
                api_errors[name] = { type = "error", code = resp.status }
                set_download_state(appid, { apiErrors = api_errors })
                return "skip"
            end

            local body = resp.body or ""
            set_download_state(appid, { status = "downloading", bytesRead = #body, totalBytes = #body })

            -- Validate zip magic bytes
            if #body < 4 or body:sub(1, 2) ~= "PK" then
                logger:warn("LuaTools: API '" .. name .. "' returned non-zip data")
                return "skip"
            end

            -- Write to file
            utils.write_file(dest_path, body)
            logger:info("LuaTools: Download complete -> " .. dest_path)

            -- Process and install
            set_download_state(appid, { status = "processing" })
            process_and_install_lua(appid, dest_path)

            -- Track the install
            local fetched_name = fetch_app_name(appid)
            if fetched_name == "" then fetched_name = "UNKNOWN (" .. appid .. ")" end
            pcall(append_loaded_app, appid, fetched_name)
            pcall(log_appid_event, "ADDED - " .. name, appid, fetched_name)

            set_download_state(appid, { status = "done", success = true, api = name })
            return "done"
        end)

        if ok and result == "done" then return end
        if ok and result == "skip" then goto continue_api end
        if not ok then
            logger:warn("LuaTools: API '" .. name .. "' failed: " .. tostring(result))
            local state = get_download_state(appid)
            local api_errors = state.apiErrors or {}
            local err_str = tostring(result)
            if err_str:find("timeout") or err_str:find("Timeout") then
                api_errors[name] = { type = "timeout" }
            else
                api_errors[name] = { type = "error" }
            end
            set_download_state(appid, { apiErrors = api_errors })
        end

        ::continue_api::
    end

    set_download_state(appid, { status = "failed", error = "Not available on any API" })
end

-- ─── Public API ───

function M.init_applist()
    local ok, err = pcall(function()
        ensure_applist_file()
        load_applist_into_memory()
    end)
    if not ok then
        logger:warn("LuaTools: Applist initialization failed: " .. tostring(err))
    end
end

function M.init_games_db()
    local ok, err = pcall(function()
        -- Check if cache is stale (>24h)
        local file_path = games_db_file_path()
        local need_download = not fs.exists(file_path)
        if not need_download then
            local mtime = fs.last_write_time(file_path)
            local now = datetime.unix()
            if (now - mtime) > config.GAMES_DB_MAX_AGE_SECONDS then
                need_download = true
            end
        end

        if need_download then
            logger:info("LuaTools: Downloading Games DB...")
            local resp, dl_err = http_utils.get(config.GAMES_DB_URL, { timeout = 60 })
            if resp and resp.body then
                utils.write_file(file_path, resp.body)
                logger:info("LuaTools: Saved Games DB")
            else
                logger:warn("LuaTools: Failed to download Games DB: " .. (dl_err or "unknown"))
            end
        end

        -- Load into memory
        if not games_db_loaded then
            if fs.exists(file_path) then
                local content, _ = utils.read_file(file_path)
                if content then
                    local parse_ok, data = pcall(json.decode, content)
                    if parse_ok then
                        games_db_data = data
                        games_db_loaded = true
                    end
                end
            end
            games_db_loaded = true
        end
    end)
    if not ok then
        logger:warn("LuaTools: Games DB initialization failed: " .. tostring(err))
    end
end

function M.has_luatools_for_app(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    local exists = steam_utils.has_lua_for_app(appid)
    return json.encode({ success = true, exists = exists })
end

function M.start_add_via_luatools(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end

    logger:info("LuaTools: StartAddViaLuaTools appid=" .. appid)
    set_download_state(appid, { status = "queued", bytesRead = 0, totalBytes = 0 })

    -- Synchronous download
    download_zip_for_app(appid)

    local state = get_download_state(appid)
    return json.encode({ success = true, state = state })
end

function M.get_add_status(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return json.encode({ success = true, state = get_download_state(appid) })
end

function M.cancel_add_via_luatools(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    -- With synchronous downloads, cancellation happens via frontend not calling again
    set_download_state(appid, { status = "cancelled", error = "Cancelled by user" })
    return json.encode({ success = true })
end

function M.read_loaded_apps()
    local ok, result = pcall(function()
        local path = loaded_apps_path()
        local entries = {}
        if fs.exists(path) then
            local content, _ = utils.read_file(path)
            if content then
                for line in content:gmatch("[^\n]+") do
                    local appid_str, name = line:match("^(%d+):(.+)$")
                    if appid_str and name then
                        entries[#entries + 1] = { appid = tonumber(appid_str), name = utils.trim(name) }
                    end
                end
            end
        end
        return json.encode({ success = true, apps = entries })
    end)
    if ok then return result end
    return json.encode({ success = false, error = tostring(result) })
end

function M.dismiss_loaded_apps()
    local path = loaded_apps_path()
    if fs.exists(path) then fs.remove(path) end
    return json.encode({ success = true })
end

function M.delete_luatools_for_app(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end

    local base = steam_utils.detect_steam_install_path()
    if base == "" then
        local ok, p = pcall(millennium.steam_path)
        if ok and p then base = p end
    end

    local target_dir = fs.join(base, "config", "stplug-in")
    local file_paths = {
        fs.join(target_dir, tostring(appid) .. ".lua"),
        fs.join(target_dir, tostring(appid) .. ".lua.disabled"),
    }

    local deleted = {}
    for _, fpath in ipairs(file_paths) do
        if fs.exists(fpath) then
            pcall(fs.remove, fpath)
            deleted[#deleted + 1] = fpath
        end
    end

    local name = get_loaded_app_name(appid)
    if name == "" then name = fetch_app_name(appid) end
    if name == "" then name = "UNKNOWN (" .. appid .. ")" end
    pcall(remove_loaded_app, appid)
    if #deleted > 0 then
        pcall(log_appid_event, "REMOVED", appid, name)
    end

    return json.encode({ success = true, deleted = deleted, count = #deleted })
end

function M.get_icon_data_url()
    local ok, result = pcall(function()
        local steam_ui_path = fs.join(millennium.steam_path(), "steamui", config.WEBKIT_DIR_NAME)
        local icon_path = fs.join(steam_ui_path, config.WEB_UI_ICON_FILE)
        if not fs.exists(icon_path) then
            icon_path = paths.public_path(config.WEB_UI_ICON_FILE)
        end

        local content, err = utils.read_file(icon_path)
        if not content then
            error("Failed to read icon: " .. (err or "unknown"))
        end

        local b64 = utils.base64_encode(content)
        return json.encode({ success = true, dataUrl = "data:image/png;base64," .. b64 })
    end)
    if ok then return result end
    return json.encode({ success = false, error = tostring(result) })
end

function M.get_games_database()
    if not games_db_loaded then M.init_games_db() end
    return json.encode(games_db_data)
end

function M.get_installed_lua_scripts()
    local ok, result = pcall(function()
        preload_app_names_cache()

        local base_path = steam_utils.detect_steam_install_path()
        if base_path == "" then
            local ok2, p = pcall(millennium.steam_path)
            if ok2 and p then base_path = p end
        end
        if base_path == "" then
            return json.encode({ success = false, error = "Could not find Steam installation path" })
        end

        local target_dir = fs.join(base_path, "config", "stplug-in")
        if not fs.exists(target_dir) then
            return json.encode({ success = true, scripts = {} })
        end

        local scripts = {}
        local files = fs.list(target_dir)
        if files then
            for _, entry in ipairs(files) do
                local name = entry.name or ""
                if name:match("%.lua$") or name:match("%.lua%.disabled$") then
                    local appid_str = name:gsub("%.lua%.disabled$", ""):gsub("%.lua$", "")
                    local appid = tonumber(appid_str)
                    if appid then
                        local is_disabled = name:match("%.disabled$") ~= nil
                        local game_name = app_name_cache[appid] or ""
                        if game_name == "" then game_name = get_loaded_app_name(appid) end
                        if game_name == "" then game_name = "Unknown Game (" .. appid .. ")" end

                        local file_size = entry.size or 0
                        local mtime = fs.last_write_time(entry.path) or 0
                        local formatted_date = datetime.format(mtime * 1000, "%Y-%m-%d %H:%M:%S")

                        scripts[#scripts + 1] = {
                            appid = appid,
                            gameName = game_name,
                            filename = name,
                            isDisabled = is_disabled,
                            fileSize = file_size,
                            modifiedDate = formatted_date,
                            path = entry.path,
                        }
                    end
                end
            end
        end

        table.sort(scripts, function(a, b) return a.appid < b.appid end)
        return json.encode({ success = true, scripts = scripts })
    end)
    if ok then return result end
    return json.encode({ success = false, error = tostring(result) })
end

return M
