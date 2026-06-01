-- LuaTools backend main.lua
-- All exported functions return JSON-encoded strings, mirroring the Python backend's json.dumps() returns.
-- This is required because Millennium's Lua bridge does not deep-serialize nested Lua tables.

local cjson       = require("json")
local m_utils     = require("utils")
local logger      = require("plugin_logger")
local millennium  = require("millennium")
local fs          = require("fs")
local http_client = require("http_client")
local paths       = require("paths")
local steam_utils = require("steam_utils")
local utils       = require("plugin_utils")
local locales_mod = require("locales.manager")

local api_manifest    = require("api_manifest")
local downloads       = require("downloads")
local fixes           = require("fixes")
local settings_manager = require("settings.manager")
local auto_update     = require("auto_update")

-- ── Helpers ──────────────────────────────────────────────────────────────────

--- Safely encode a Lua table to a JSON string (same as Python json.dumps).
local function json_ok(data)
    local ok, s = pcall(cjson.encode, data)
    if ok then return s end
    logger.warn("json_ok encode failed: " .. tostring(s))
    return '{"success":false,"error":"serialization error"}'
end

local function json_err(msg)
    return json_ok({ success = false, error = tostring(msg) })
end

-- ── Webkit file management ───────────────────────────────────────────────────

local function copy_webkit_files()
    local steam_dir = steam_utils.detect_steam_install_path()
    if not steam_dir or steam_dir == "" then return end

    local target_webkit_dir = fs.join(steam_dir, "steamui", "webkit")
    if not fs.exists(target_webkit_dir) then
        fs.create_directories(target_webkit_dir)
    end

    local public_dir = fs.join(paths.get_plugin_dir(), "public")

    local src_js = fs.join(public_dir, "luatools.js")
    local dst_js = fs.join(target_webkit_dir, "luatools.js")
    if fs.exists(src_js) then
        local content = m_utils.read_file(src_js)
        if content then m_utils.write_file(dst_js, content) end
    end

    local src_css = fs.join(public_dir, "steamdb-webkit.css")
    local dst_css = fs.join(target_webkit_dir, "steamdb-webkit.css")
    if fs.exists(src_css) then
        local content = m_utils.read_file(src_css)
        if content then m_utils.write_file(dst_css, content) end
    end
end

local function inject_webkit_files()
    millennium.add_browser_css("webkit/steamdb-webkit.css")
    millennium.add_browser_js("webkit/luatools.js")
end

-- ── Lifecycle ────────────────────────────────────────────────────────────────

local function on_load()
    logger.log("Bootstrapping LuaTools plugin, millennium " .. millennium.version())
    steam_utils.detect_steam_install_path()
    utils.ensure_temp_download_dir()

    local ok_s, err_s = pcall(settings_manager.init_settings)
    if not ok_s then logger.warn("settings init failed: " .. tostring(err_s)) end

    local ok_u, upd_msg = pcall(auto_update.apply_pending_update_if_any)
    if ok_u and upd_msg and upd_msg ~= "" then
        api_manifest.store_last_message(upd_msg)
    end

    copy_webkit_files()
    inject_webkit_files()

    local res = api_manifest.init_apis()
    logger.log("InitApis (boot) result: " .. tostring(res.message or ""))

    millennium.ready()

    local keys = {}
    for k, v in pairs(millennium) do table.insert(keys, k .. ":" .. type(v)) end
    logger.warn("MILLENNIUM KEYS: " .. table.concat(keys, ", "))
end

local function on_unload()
    logger.log("unloading LuaTools plugin")
end

local function on_frontend_loaded()
    logger.log("Frontend loaded")
    copy_webkit_files()
end

-- ── Logger (called as "Logger.log" from JS) ──────────────────────────────────

Logger = {}

function Logger.log(message)
    local msg = type(message) == "table" and tostring(message.message or "") or tostring(message or "")
    logger.log("[Frontend] " .. msg)
    return json_ok({ success = true })
end

function Logger.warn(message)
    local msg = type(message) == "table" and tostring(message.message or "") or tostring(message or "")
    logger.warn("[Frontend] " .. msg)
    return json_ok({ success = true })
end

function Logger.error(message)
    local msg = type(message) == "table" and tostring(message.message or "") or tostring(message or "")
    logger.error("[Frontend] " .. msg)
    return json_ok({ success = true })
end

-- Millennium looks up "Logger.log" as a dotted global key
_G["Logger.log"]   = Logger.log
_G["Logger.warn"]  = Logger.warn
_G["Logger.error"] = Logger.error

-- ── Exported API Methods ─────────────────────────────────────────────────────
-- Every function returns a JSON string, matching the Python backend exactly.

function GetPluginDir()
    return paths.get_plugin_dir()   -- plain string, matches Python
end

function InitApis()
    local ok, res = pcall(api_manifest.init_apis)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function GetInitApisMessage()
    local ok, res = pcall(api_manifest.get_init_apis_message)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function FetchFreeApisNow()
    local ok, res = pcall(api_manifest.fetch_free_apis_now)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function CheckForUpdatesNow()
    local ok, res = pcall(auto_update.check_for_updates_now)
    if not ok then
        logger.warn("CheckForUpdatesNow failed: " .. tostring(res))
        return json_err(res)
    end
    return json_ok(res)
end

function RestartSteam()
    local ok, success = pcall(auto_update.restart_steam)
    if ok and success then
        return json_ok({ success = true })
    end
    return json_ok({ success = false, error = "Failed to restart Steam" })
end

function HasLuaToolsForApp(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, exists = pcall(steam_utils.has_lua_for_app, tonumber(appid))
    if not ok then return json_err(exists) end
    return json_ok({ success = true, exists = exists == true })
end

function StartAddViaLuaTools(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(downloads.start_add_via_luatools, tonumber(appid))
    if not ok then return json_err(res) end
    return json_ok(res)
end

function GetAddViaLuaToolsStatus(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(downloads.get_add_status, tonumber(appid))
    if not ok then return json_err(res) end
    return json_ok(res)
end

function GetApiList()
    local ok, res = pcall(api_manifest.get_api_list)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function CancelAddViaLuaTools(appid)
    -- No-op cancel stub; download is synchronous in Lua
    return json_ok({ success = true })
end

function CheckApisForApp(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(downloads.check_apis_for_app, tonumber(appid))
    if not ok then return json_err(res) end
    
    -- Ensure empty arrays encode as [] and not {}
    if res and type(res.results) == "table" and #res.results == 0 then
        -- Serialize manually or inject cjson.empty_array
        local success_json = res.success and "true" or "false"
        return '{"success":' .. success_json .. ',"results":[]}'
    end
    
    return json_ok(res)
end

function GetMorrenusStats(api_key, force_refresh)
    if type(api_key) == "table" then
        force_refresh = api_key.force_refresh
        api_key = api_key.api_key
    end
    api_key = tostring(api_key or "")
    if api_key == "" then return json_err("api_key required") end
    local endpoint = "https://hubcapmanifest.com/api/v1/user/stats?api_key=" .. api_key
    local ok, resp = pcall(http_client.get, endpoint, { timeout = 10 })
    if ok and resp and resp.status == 200 then
        return resp.body  -- already JSON string
    end
    return json_err("request failed")
end

function StartAddViaLuaToolsFromUrl(apiName, appid, contentScriptQuery, url)
    -- Millennium's IPC bridge sorts JS object keys alphabetically and passes their values as positional arguments.
    -- The JS passes: { apiName: ..., appid: ..., contentScriptQuery: "", url: ... }
    -- So the Lua signature MUST be (apiName, appid, contentScriptQuery, url)
    
    logger.log("StartAddViaLuaToolsFromUrl CALLED: appid=" .. tostring(appid) .. ", url=" .. tostring(url) .. ", apiName=" .. tostring(apiName))
    
    local ok, res = pcall(downloads.start_add_via_luatools_from_url, appid, url, apiName)
    if not ok then 
        logger.warn("StartAddViaLuaToolsFromUrl CRASHED inside pcall: " .. tostring(res))
        return json_err(res) 
    end
    
    return json_ok(res)
end

function GetIconDataUrl()
    -- Python read an icon file from the public dir and base64-encoded it
    local icon_path = fs.join(paths.get_plugin_dir(), "public", "luatools-icon.png")
    if fs.exists(icon_path) then
        local content = m_utils.read_file(icon_path)
        if content then
            return json_ok({ success = true, dataUrl = "data:image/png;base64," .. (m_utils.base64_encode and m_utils.base64_encode(content) or "") })
        end
    end
    return json_ok({ success = false, error = "icon not found" })
end

function GetGamesDatabase()
    local ok, res = pcall(function()
        local db_path = paths.backend_path("data/applist.json")
        if fs.exists(db_path) then
            local data = utils.read_json(db_path)
            return { success = true, apps = data.apps or data or {} }
        end
        return { success = true, apps = {} }
    end)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function ReadLoadedApps()
    local ok, res = pcall(function()
        local log_path = paths.backend_path("loadedappids.txt")
        local apps = {}
        if fs.exists(log_path) then
            local text = utils.read_text(log_path)
            for line in (text .. "\n"):gmatch("([^\n]*)\n") do
                local appid = tonumber(line:match("^%s*(%d+)%s*$"))
                if appid then table.insert(apps, appid) end
            end
        end
        return { success = true, apps = apps }
    end)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function DismissLoadedApps()
    local ok, err = pcall(function()
        local log_path = paths.backend_path("loadedappids.txt")
        if fs.exists(log_path) then
            m_utils.write_file(log_path, "")
        end
    end)
    if not ok then return json_err(err) end
    return json_ok({ success = true })
end

function DeleteLuaToolsForApp(appid)
    if type(appid) == "table" then appid = appid.appid end
    local base = steam_utils.detect_steam_install_path()
    local target_dir = fs.join(base, "config", "stplug-in")
    local candidates = {
        fs.join(target_dir, tostring(appid) .. ".lua"),
        fs.join(target_dir, tostring(appid) .. ".lua.disabled"),
    }
    local deleted = {}
    for _, p in ipairs(candidates) do
        if fs.exists(p) then
            pcall(fs.remove, p)
            table.insert(deleted, p)
        end
    end
    return json_ok({ success = true, deleted = deleted, count = #deleted })
end

function CheckForFixes(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(fixes.check_for_fixes, tonumber(appid))
    if not ok then return json_err(res) end
    return json_ok(res)
end

function ApplyGameFix(appid, contentScriptQuery, downloadUrl, fixType, gameName, installPath)
    -- Millennium's IPC bridge sorts JS object keys alphabetically and passes their values as positional arguments.
    -- The JS passes: { appid, contentScriptQuery, downloadUrl, fixType, gameName, installPath }
    -- So the Lua signature MUST be (appid, contentScriptQuery, downloadUrl, fixType, gameName, installPath)
    
    local ok, res = pcall(fixes.apply_game_fix,
        tonumber(appid), tostring(downloadUrl or ""),
        tostring(installPath or ""), tostring(fixType or ""), tostring(gameName or ""))
    if not ok then 
        logger.warn("ApplyGameFix CRASHED: " .. tostring(res))
        return json_err(res) 
    end
    return json_ok(res)
end

function GetApplyFixStatus(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(fixes.get_apply_status, tonumber(appid))
    if not ok then return json_err(res) end
    return json_ok(res)
end

function CancelApplyFix(appid)
    return json_ok({ success = true })
end

function UninstallFix(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(fixes.uninstall_fix, tonumber(appid))
    if not ok then return json_err(res) end
    return json_ok(res)
end

function UnFixGame(appid, installPath, fixDate)
    if type(appid) == "table" then
        installPath = appid.installPath; fixDate = appid.fixDate; appid = appid.appid
    end
    -- Stub - unfix logic not yet ported
    return json_ok({ success = false, error = "Not yet implemented" })
end

function GetUnfixStatus(appid)
    return json_ok({ success = true, state = { status = "done" } })
end

function GetInstalledFixes()
    return json_ok({ success = true, fixes = {} })
end

function GetInstalledLuaScripts()
    local ok, res = pcall(function()
        local base = steam_utils.detect_steam_install_path()
        local target_dir = fs.join(base, "config", "stplug-in")
        local scripts = {}
        local ok2, files = pcall(fs.list, target_dir)
        if ok2 and files then
            for _, entry in ipairs(files) do
                local name = entry.name or ""
                if name:match("%.lua$") or name:match("%.lua%.disabled$") then
                    local aid = name:match("^(%d+)%.")
                    if aid then
                        table.insert(scripts, {
                            appid      = tonumber(aid),
                            gameName   = "Unknown Game (" .. aid .. ")",
                            filename   = name,
                            isDisabled = name:match("%.disabled$") ~= nil,
                            path       = entry.path or ""
                        })
                    end
                end
            end
        end
        return { success = true, scripts = scripts }
    end)
    if not ok then return json_err(res) end
    return json_ok(res)
end

function GetGameInstallPath(appid)
    if type(appid) == "table" then appid = appid.appid end
    local ok, res = pcall(steam_utils.get_game_install_path_response, tonumber(appid))
    if not ok then return json_err(res) end
    return json_ok(res)
end

function OpenGameFolder(path)
    if type(path) == "table" then path = path.path end
    local ok, success = pcall(steam_utils.open_game_folder, tostring(path or ""))
    if ok and success then
        return json_ok({ success = true })
    end
    return json_ok({ success = false, error = "Failed to open path" })
end

function OpenExternalUrl(url)
    if type(url) == "table" then url = url.url end
    url = tostring(url or "")
    if not (url:sub(1,7) == "http://" or url:sub(1,8) == "https://") then
        return json_err("Invalid URL")
    end
    local is_win = (m_utils.getenv("OS") or ""):find("Windows") ~= nil
    if is_win then
        pcall(m_utils.exec, 'start "" "' .. url .. '"')
    else
        pcall(m_utils.exec, 'xdg-open "' .. url .. '"')
    end
    return json_ok({ success = true })
end

function GetSettingsConfig()
    local ok, payload = pcall(settings_manager.get_settings_payload)
    if not ok then
        logger.warn("GetSettingsConfig failed: " .. tostring(payload))
        return json_err(payload)
    end
    return json_ok({
        success       = true,
        schemaVersion = payload.version,
        schema        = payload.schema or {},
        values        = payload.values or {},
        language      = payload.language,
        locales       = payload.locales or {},
        translations  = payload.translations or {}
    })
end

function GetThemes()
    return json_ok({ success = true, themes = {} })
end

function ApplySettingsChanges(changes)
    -- Millennium may pass the argument as a JSON string rather than a decoded table.
    -- Mirror the Python version's parsing logic exactly.
    local payload = nil

    if type(changes) == "string" and changes ~= "" then
        -- Try to decode the JSON string
        local ok, decoded = pcall(cjson.decode, changes)
        if not ok then
            logger.warn("ApplySettingsChanges: failed to parse changes string")
            return json_err("Invalid JSON payload")
        end
        -- Unwrap nested wrappers the JS bridge sometimes adds
        if type(decoded) == "table" and decoded.changes then
            payload = decoded.changes
        elseif type(decoded) == "table" and type(decoded.changesJson) == "string" then
            local ok2, inner = pcall(cjson.decode, decoded.changesJson)
            if ok2 then payload = inner else return json_err("Invalid JSON payload") end
        else
            payload = decoded
        end
    elseif type(changes) == "table" then
        -- Already a decoded table – handle wrapper keys
        if changes.changes then
            payload = changes.changes
        elseif type(changes.changesJson) == "string" then
            local ok2, inner = pcall(cjson.decode, changes.changesJson)
            if ok2 then payload = inner else return json_err("Invalid JSON payload") end
        else
            payload = changes
        end
    else
        payload = {}
    end

    if payload == nil then payload = {} end

    if type(payload) ~= "table" then
        logger.warn("ApplySettingsChanges: payload is not a table: " .. tostring(payload))
        return json_err("Invalid payload format")
    end

    logger.log("ApplySettingsChanges payload: " .. (pcall(cjson.encode, payload) and cjson.encode(payload) or "?"))

    local ok, res = pcall(settings_manager.apply_settings_changes, payload)
    if not ok then
        logger.warn("ApplySettingsChanges failed: " .. tostring(res))
        return json_err(res)
    end
    return json_ok(res)
end

function GetAvailableLocales()
    local ok, locs = pcall(settings_manager.get_available_locales)
    if not ok then return json_err(locs) end
    return json_ok({ success = true, locales = locs })
end

function GetTranslations(language)
    -- Handle both {language="en"} table and plain string argument
    if type(language) == "table" then
        language = language.language or language.lang
    end
    language = tostring(language or locales_mod.DEFAULT_LOCALE)

    local ok, strings = pcall(function()
        return locales_mod.get_locale_manager():get_locale_strings(language)
    end)
    if not ok then
        logger.warn("GetTranslations failed: " .. tostring(strings))
        return json_err(strings)
    end

    -- Frontend expects: { success, strings:{...}, language, locales:[...] }
    local ok2, locs = pcall(settings_manager.get_available_locales)
    return json_ok({
        success  = true,
        strings  = strings or {},
        language = language,
        locales  = ok2 and locs or {}
    })
end

function GetAvailableThemes()
    return json_ok({ success = true, themes = {} })
end

-- ── Return lifecycle table ────────────────────────────────────────────────────

return {
    on_load           = on_load,
    on_unload         = on_unload,
    on_frontend_loaded = on_frontend_loaded,
}
