--- Game fix lookup, application, and removal logic.

local fs = require("fs")
local http = require("http")
local json = require("json")
local logger = require("logger")
local utils = require("utils")
local datetime = require("datetime")

local paths = require("paths")
local config = require("config")
local http_utils = require("http_utils")
local steam_utils = require("steam_utils")

local M = {}

-- ─── State ───

local fix_download_state = {}
local unfix_state = {}
local fixes_index_cache = nil

-- ─── State helpers ───

local function set_fix_state(appid, update)
    local state = fix_download_state[appid] or {}
    for k, v in pairs(update) do state[k] = v end
    fix_download_state[appid] = state
end

local function get_fix_state(appid)
    local state = fix_download_state[appid] or {}
    local copy = {}
    for k, v in pairs(state) do copy[k] = v end
    return copy
end

local function set_unfix(appid, update)
    local state = unfix_state[appid] or {}
    for k, v in pairs(update) do state[k] = v end
    unfix_state[appid] = state
end

local function get_unfix(appid)
    local state = unfix_state[appid] or {}
    local copy = {}
    for k, v in pairs(state) do copy[k] = v end
    return copy
end

-- ─── Fixes index ───

local function fetch_fixes_index()
    if fixes_index_cache then return fixes_index_cache end

    local resp, err = http_utils.get(config.FIXES_INDEX_URL, { timeout = 10 })
    if resp and resp.body then
        local ok, data = pcall(json.decode, resp.body)
        if ok and type(data) == "table" then
            local generic_set = {}
            for _, id in ipairs(data.genericFixes or {}) do generic_set[tonumber(id) or id] = true end
            local online_set = {}
            for _, id in ipairs(data.onlineFixes or {}) do online_set[tonumber(id) or id] = true end
            fixes_index_cache = { generic = generic_set, online = online_set }
            logger:info("LuaTools: Fixes index loaded")
            return fixes_index_cache
        end
    end
    logger:warn("LuaTools: Failed to fetch fixes index: " .. (err or "unknown"))
    return nil
end

function M.init_fixes_index()
    fetch_fixes_index()
end

-- ─── Path safety ───

local function is_safe_path(base_path, target_path)
    local abs_base = fs.absolute(base_path)
    local abs_target = fs.absolute(fs.join(base_path, target_path))
    return utils.startswith(abs_target, abs_base)
end

-- ─── Check for fixes ───

function M.check_for_fixes(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end

    -- Lazy import to avoid circular dependency
    local downloads = require("downloads")

    local result = {
        success = true,
        appid = appid,
        gameName = "",
        genericFix = { status = 0, available = false },
        onlineFix = { status = 0, available = false },
    }

    local ok_name, name = pcall(downloads.fetch_app_name or function() return "" end, appid)
    result.gameName = (ok_name and name ~= "") and name or ("Unknown Game (" .. appid .. ")")

    local index = fetch_fixes_index()
    if index then
        local generic_url = config.FIXES_FILES_BASE_URL .. "/" .. appid .. ".zip"
        local online_url = "https://files.luatools.work/OnlineFix1/" .. appid .. ".zip"

        if index.generic[appid] then
            result.genericFix = { status = 200, available = true, url = generic_url }
        else
            result.genericFix.status = 404
        end

        if index.online[appid] then
            result.onlineFix = { status = 200, available = true, url = online_url }
        else
            result.onlineFix.status = 404
        end
    else
        -- Fallback: HEAD requests
        logger:warn("LuaTools: Fixes index unavailable, falling back to HEAD requests")
        local generic_url = config.FIXES_FILES_BASE_URL .. "/" .. appid .. ".zip"
        local status1, _ = http_utils.head(generic_url)
        if status1 then
            result.genericFix.status = status1
            result.genericFix.available = (status1 == 200)
            if status1 == 200 then result.genericFix.url = generic_url end
        end

        local online_url = "https://files.luatools.work/OnlineFix1/" .. appid .. ".zip"
        local status2, _ = http_utils.head(online_url)
        if status2 then
            result.onlineFix.status = status2
            result.onlineFix.available = (status2 == 200)
            if status2 == 200 then result.onlineFix.url = online_url end
        end
    end

    return json.encode(result)
end

-- ─── Fix download and extraction (synchronous) ───

local function download_and_extract_fix(appid, download_url, install_path, fix_type, game_name)
    local dest_zip = paths.temp_dl_path("fix_" .. appid .. ".zip")
    set_fix_state(appid, { status = "downloading", bytesRead = 0, totalBytes = 0, error = json.null })

    logger:info("LuaTools: Downloading " .. fix_type .. " from " .. download_url)

    local resp, err = http.get(download_url, {
        follow_redirects = true,
        timeout = 30,
    })

    if not resp or resp.status ~= 200 then
        error("Download failed: " .. (err or ("HTTP " .. tostring(resp and resp.status))))
    end

    local body = resp.body or ""
    set_fix_state(appid, { bytesRead = #body, totalBytes = #body })
    utils.write_file(dest_zip, body)

    logger:info("LuaTools: Download complete, extracting to " .. install_path)
    set_fix_state(appid, { status = "extracting" })

    -- Extract zip
    local extract_dir = paths.temp_dl_path("fix_extract_" .. appid)
    if fs.exists(extract_dir) then fs.remove_all(extract_dir) end
    fs.create_directories(extract_dir)

    local cmd = 'powershell -NoProfile -Command "Expand-Archive -LiteralPath \'' .. dest_zip:gsub("'", "''") .. '\' -DestinationPath \'' .. extract_dir:gsub("'", "''") .. '\' -Force"'
    utils.exec(cmd)

    -- Determine structure: single folder matching appid, or flat
    local top_entries = fs.list(extract_dir)
    local appid_folder = nil
    if top_entries and #top_entries == 1 and top_entries[1].is_directory and top_entries[1].name == tostring(appid) then
        appid_folder = top_entries[1].path
    end

    local source_dir = appid_folder or extract_dir
    local extracted_files = {}

    -- Copy files to install_path with path traversal protection
    local all_files = fs.list_recursive(source_dir)
    if all_files then
        for _, entry in ipairs(all_files) do
            if entry.is_file then
                -- Get relative path from source_dir
                local rel = fs.relative(entry.path, source_dir)
                if rel and is_safe_path(install_path, rel) then
                    local target = fs.join(install_path, rel)
                    local target_dir = fs.parent_path(target)
                    if not fs.exists(target_dir) then fs.create_directories(target_dir) end
                    fs.copy(entry.path, target)
                    extracted_files[#extracted_files + 1] = rel:gsub("\\", "/")
                else
                    logger:warn("LuaTools: Skipping unsafe path: " .. tostring(rel))
                end
            end
        end
    end

    -- Update unsteam.ini if Online Fix
    if fix_type:lower():find("online fix") or fix_type:lower():find("unsteam") then
        for _, rel_path in ipairs(extracted_files) do
            if rel_path:lower():match("unsteam%.ini$") then
                local ini_path = fs.join(install_path, rel_path:gsub("/", "\\"))
                if fs.exists(ini_path) then
                    local content, _ = utils.read_file(ini_path)
                    if content and content:find("<appid>", 1, true) then
                        content = content:gsub("<appid>", tostring(appid))
                        utils.write_file(ini_path, content)
                        logger:info("LuaTools: Updated unsteam.ini with appid " .. appid)
                    end
                end
                break
            end
        end
    end

    -- Write fix log
    local log_path = fs.join(install_path, "luatools-fix-log-" .. appid .. ".log")
    local existing = ""
    if fs.exists(log_path) then
        existing = utils.read_file(log_path) or ""
    end

    local stamp = datetime.format(datetime.now(), "%Y-%m-%d %H:%M:%S")
    local log_entry = "[FIX]\n"
    log_entry = log_entry .. "Date: " .. stamp .. "\n"
    log_entry = log_entry .. "Game: " .. (game_name ~= "" and game_name or ("Unknown Game (" .. appid .. ")")) .. "\n"
    log_entry = log_entry .. "Fix Type: " .. fix_type .. "\n"
    log_entry = log_entry .. "Download URL: " .. download_url .. "\n"
    log_entry = log_entry .. "Files:\n"
    for _, f in ipairs(extracted_files) do
        log_entry = log_entry .. f .. "\n"
    end
    log_entry = log_entry .. "[/FIX]\n"

    local full_log
    if existing ~= "" then
        if not existing:match("\n$") then existing = existing .. "\n" end
        full_log = existing .. "\n---\n\n" .. log_entry
    else
        full_log = log_entry
    end
    utils.write_file(log_path, full_log)

    -- Cleanup
    pcall(fs.remove_all, extract_dir)
    pcall(fs.remove, dest_zip)

    logger:info("LuaTools: " .. fix_type .. " applied successfully")
    set_fix_state(appid, { status = "done", success = true })
end

function M.apply_game_fix(appid, download_url, install_path, fix_type, game_name)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    download_url = tostring(download_url or "")
    install_path = tostring(install_path or "")
    fix_type = tostring(fix_type or "")
    game_name = tostring(game_name or "")

    if download_url == "" or install_path == "" then
        return json.encode({ success = false, error = "Missing download URL or install path" })
    end
    if not fs.exists(install_path) then
        return json.encode({ success = false, error = "Install path does not exist" })
    end

    logger:info("LuaTools: ApplyGameFix appid=" .. appid .. " fixType=" .. fix_type)
    set_fix_state(appid, { status = "queued", bytesRead = 0, totalBytes = 0, error = json.null })

    local ok, err = pcall(download_and_extract_fix, appid, download_url, install_path, fix_type, game_name)
    if not ok then
        logger:warn("LuaTools: Fix application failed: " .. tostring(err))
        set_fix_state(appid, { status = "failed", error = tostring(err) })
    end

    local state = get_fix_state(appid)
    return json.encode({ success = true, state = state })
end

function M.get_apply_fix_status(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return json.encode({ success = true, state = get_fix_state(appid) })
end

function M.cancel_apply_fix(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    set_fix_state(appid, { status = "cancelled", success = false, error = "Cancelled by user" })
    return json.encode({ success = true })
end

-- ─── Unfix ───

local function unfix_game_worker(appid, install_path, fix_date)
    logger:info("LuaTools: Starting un-fix for appid " .. appid)
    local log_path = fs.join(install_path, "luatools-fix-log-" .. appid .. ".log")

    if not fs.exists(log_path) then
        set_unfix(appid, { status = "failed", error = "No fix log found. Cannot un-fix." })
        return
    end

    set_unfix(appid, { status = "removing", progress = "Reading log file..." })

    local log_content, _ = utils.read_file(log_path)
    if not log_content then
        set_unfix(appid, { status = "failed", error = "Failed to read log file" })
        return
    end

    local files_to_delete = {}
    local files_set = {}
    local remaining_fixes = {}

    if log_content:find("[FIX]", 1, true) then
        -- New format with [FIX] markers
        for block in log_content:gmatch("%[FIX%](.-)%[/FIX%]") do
            local block_date = nil
            local in_files = false
            local block_files = {}
            local block_lines = {}

            for line in block:gmatch("[^\n]+") do
                local trimmed = utils.trim(line)
                block_lines[#block_lines + 1] = line
                if utils.startswith(trimmed, "Date:") then
                    block_date = utils.trim(trimmed:sub(6))
                elseif trimmed == "Files:" then
                    in_files = true
                elseif in_files and trimmed ~= "" and trimmed ~= "---" then
                    block_files[#block_files + 1] = trimmed
                end
            end

            if not fix_date or fix_date == "" or (block_date and block_date == fix_date) then
                for _, f in ipairs(block_files) do
                    if not files_set[f] then
                        files_to_delete[#files_to_delete + 1] = f
                        files_set[f] = true
                    end
                end
            else
                remaining_fixes[#remaining_fixes + 1] = "[FIX]\n" .. table.concat(block_lines, "\n") .. "\n[/FIX]"
            end
        end
    else
        -- Legacy format
        local in_files = false
        for line in log_content:gmatch("[^\n]+") do
            local trimmed = utils.trim(line)
            if trimmed == "Files:" then
                in_files = true
            elseif in_files and trimmed ~= "" then
                if not files_set[trimmed] then
                    files_to_delete[#files_to_delete + 1] = trimmed
                    files_set[trimmed] = true
                end
            end
        end
    end

    set_unfix(appid, { status = "removing", progress = "Removing " .. #files_to_delete .. " files..." })
    local deleted_count = 0

    for _, rel_path in ipairs(files_to_delete) do
        local full = fs.join(install_path, rel_path)
        if fs.exists(full) then
            local ok, _ = pcall(fs.remove, full)
            if ok then
                deleted_count = deleted_count + 1
                logger:info("LuaTools: Deleted " .. rel_path)
            end
        end
    end

    logger:info("LuaTools: Deleted " .. deleted_count .. "/" .. #files_to_delete .. " files")

    if #remaining_fixes > 0 then
        utils.write_file(log_path, table.concat(remaining_fixes, "\n\n---\n\n"))
    else
        pcall(fs.remove, log_path)
    end

    set_unfix(appid, { status = "done", success = true, filesRemoved = deleted_count })
end

function M.unfix_game(appid, install_path, fix_date)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end

    install_path = tostring(install_path or "")
    fix_date = tostring(fix_date or "")

    if install_path == "" then
        local result = steam_utils.get_game_install_path(appid)
        if not result.success or not result.installPath then
            return json.encode({ success = false, error = "Could not find game install path" })
        end
        install_path = result.installPath
    end

    if not fs.exists(install_path) then
        return json.encode({ success = false, error = "Install path does not exist" })
    end

    set_unfix(appid, { status = "queued", progress = "", error = json.null })

    local ok, err = pcall(unfix_game_worker, appid, install_path, fix_date ~= "" and fix_date or nil)
    if not ok then
        logger:warn("LuaTools: Unfix failed: " .. tostring(err))
        set_unfix(appid, { status = "failed", error = tostring(err) })
    end

    return json.encode({ success = true })
end

function M.get_unfix_status(appid)
    appid = tonumber(appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return json.encode({ success = true, state = get_unfix(appid) })
end

-- ─── Installed fixes scan ───

function M.get_installed_fixes()
    local ok, result = pcall(function()
        local steam_path = steam_utils.detect_steam_install_path()
        if steam_path == "" then
            return json.encode({ success = false, error = "Could not find Steam installation path" })
        end

        local library_vdf = fs.join(steam_path, "config", "libraryfolders.vdf")
        if not fs.exists(library_vdf) then
            return json.encode({ success = false, error = "Could not find libraryfolders.vdf" })
        end

        local content, _ = utils.read_file(library_vdf)
        if not content then
            return json.encode({ success = false, error = "Failed to read libraryfolders.vdf" })
        end

        local vdf_ok, library_data = pcall(steam_utils.parse_vdf, content)
        if not vdf_ok then
            return json.encode({ success = false, error = "Failed to parse libraryfolders.vdf" })
        end

        local library_folders = library_data.libraryfolders or {}
        local all_libs = {}
        for _, folder_data in pairs(library_folders) do
            if type(folder_data) == "table" and folder_data.path then
                local p = folder_data.path:gsub("\\\\", "\\")
                all_libs[#all_libs + 1] = p
            end
        end

        local installed_fixes = {}

        for _, lib_path in ipairs(all_libs) do
            local steamapps = fs.join(lib_path, "steamapps")
            if not fs.exists(steamapps) then goto continue_lib end

            local files = fs.list(steamapps)
            if not files then goto continue_lib end

            for _, entry in ipairs(files) do
                local name = entry.name or ""
                if not utils.startswith(name, "appmanifest_") or not utils.endswith(name, ".acf") then
                    goto continue_manifest
                end

                local appid_str = name:match("appmanifest_(%d+)%.acf")
                local appid = tonumber(appid_str)
                if not appid then goto continue_manifest end

                local manifest_content, _ = utils.read_file(entry.path)
                if not manifest_content then goto continue_manifest end

                local m_ok, manifest_data = pcall(steam_utils.parse_vdf, manifest_content)
                if not m_ok then goto continue_manifest end

                local app_state = manifest_data.AppState or {}
                local install_dir = app_state.installdir or ""
                local game_name = app_state.name or ("Unknown Game (" .. appid .. ")")
                if install_dir == "" then goto continue_manifest end

                local full_path = fs.join(lib_path, "steamapps", "common", install_dir)
                if not fs.exists(full_path) then goto continue_manifest end

                local log_path = fs.join(full_path, "luatools-fix-log-" .. appid .. ".log")
                if not fs.exists(log_path) then goto continue_manifest end

                local log_content, _ = utils.read_file(log_path)
                if not log_content then goto continue_manifest end

                -- Parse fix blocks
                if log_content:find("[FIX]", 1, true) then
                    for block in log_content:gmatch("%[FIX%](.-)%[/FIX%]") do
                        local fix_data = {
                            appid = appid,
                            gameName = game_name,
                            installPath = full_path,
                            date = "", fixType = "", downloadUrl = "",
                            filesCount = 0, files = {},
                        }
                        local in_files = false
                        for line in block:gmatch("[^\n]+") do
                            local t = utils.trim(line)
                            if utils.startswith(t, "Date:") then
                                fix_data.date = utils.trim(t:sub(6))
                            elseif utils.startswith(t, "Game:") then
                                local gn = utils.trim(t:sub(6))
                                if gn ~= "" then fix_data.gameName = gn end
                            elseif utils.startswith(t, "Fix Type:") then
                                fix_data.fixType = utils.trim(t:sub(10))
                            elseif utils.startswith(t, "Download URL:") then
                                fix_data.downloadUrl = utils.trim(t:sub(14))
                            elseif t == "Files:" then
                                in_files = true
                            elseif in_files and t ~= "" and t ~= "---" then
                                fix_data.files[#fix_data.files + 1] = t
                            end
                        end
                        fix_data.filesCount = #fix_data.files
                        if fix_data.date ~= "" then
                            installed_fixes[#installed_fixes + 1] = fix_data
                        end
                    end
                else
                    -- Legacy format
                    local fix_data = {
                        appid = appid, gameName = game_name, installPath = full_path,
                        date = "", fixType = "", downloadUrl = "",
                        filesCount = 0, files = {},
                    }
                    local in_files = false
                    for line in log_content:gmatch("[^\n]+") do
                        local t = utils.trim(line)
                        if utils.startswith(t, "Date:") then fix_data.date = utils.trim(t:sub(6))
                        elseif utils.startswith(t, "Fix Type:") then fix_data.fixType = utils.trim(t:sub(10))
                        elseif t == "Files:" then in_files = true
                        elseif in_files and t ~= "" then fix_data.files[#fix_data.files + 1] = t
                        end
                    end
                    fix_data.filesCount = #fix_data.files
                    if fix_data.date ~= "" then
                        installed_fixes[#installed_fixes + 1] = fix_data
                    end
                end

                ::continue_manifest::
            end
            ::continue_lib::
        end

        return json.encode({ success = true, fixes = installed_fixes })
    end)

    if ok then return result end
    return json.encode({ success = false, error = tostring(result) })
end

return M
