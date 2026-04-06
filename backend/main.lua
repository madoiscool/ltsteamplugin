--- LuaTools main entry point.
--- Returns module table with on_load + all RPC functions exposed to the frontend.

local millennium = require("millennium")
local fs = require("fs")
local json = require("json")
local logger = require("logger")
local utils = require("utils")

local config = require("config")
local paths = require("paths")
local steam_utils = require("steam_utils")
local http_utils = require("http_utils")
local api_manifest = require("api_manifest")
local downloads = require("downloads")
local fixes = require("fixes")
local auto_update = require("auto_update")
local donate_keys = require("donate_keys")
local settings_manager = require("settings.manager")
local locale_loader = require("locales.loader")

-- ─── File copying / injection helpers ───

local function steam_ui_path()
    return fs.join(millennium.steam_path(), "steamui", config.WEBKIT_DIR_NAME)
end

local function copy_webkit_files()
    local plugin_dir = paths.get_plugin_dir()
    local dest = steam_ui_path()

    if not fs.exists(dest) then
        fs.create_directories(dest)
    end

    -- Copy main JS
    local js_src = paths.public_path(config.WEB_UI_JS_FILE)
    local js_dst = fs.join(dest, config.WEB_UI_JS_FILE)
    logger:info("Copying LuaTools web UI from " .. js_src .. " to " .. js_dst)
    local ok, err = pcall(fs.copy, js_src, js_dst)
    if not ok then
        logger:error("Failed to copy LuaTools web UI: " .. tostring(err))
    end

    -- Copy icon
    local icon_src = paths.public_path(config.WEB_UI_ICON_FILE)
    local icon_dst = fs.join(dest, config.WEB_UI_ICON_FILE)
    if fs.exists(icon_src) then
        local ok2, err2 = pcall(fs.copy, icon_src, icon_dst)
        if ok2 then
            logger:info("Copied LuaTools icon to " .. icon_dst)
        else
            logger:error("Failed to copy LuaTools icon: " .. tostring(err2))
        end
    else
        logger:warn("LuaTools icon not found at " .. icon_src)
    end

    -- Copy CSS
    local css_src = paths.public_path(config.WEB_UI_CSS_FILE)
    local css_dst = fs.join(dest, config.WEB_UI_CSS_FILE)
    if fs.exists(css_src) then
        pcall(fs.copy, css_src, css_dst)
    end

    -- Copy theme CSS files
    local themes_src = fs.join(plugin_dir, "public", "themes")
    local themes_dst = fs.join(dest, "themes")
    if fs.exists(themes_src) then
        if not fs.exists(themes_dst) then
            fs.create_directories(themes_dst)
        end
        local ok3, files = pcall(fs.list, themes_src)
        if ok3 and files then
            for _, entry in ipairs(files) do
                local name = entry.name or ""
                if name:match("%.css$") or name == "themes.json" then
                    local src = fs.join(themes_src, name)
                    local dst = fs.join(themes_dst, name)
                    pcall(fs.copy, src, dst)
                end
            end
        end
    end
end

local function inject_webkit_files()
    local js_path = config.WEBKIT_DIR_NAME .. "/" .. config.WEB_UI_JS_FILE
    millennium.add_browser_js(js_path)
    logger:info("LuaTools injected web UI: " .. js_path)
end

local function ensure_temp_download_dir()
    local temp_dir = paths.temp_dl_path("")
    -- Remove trailing separator if any
    temp_dir = temp_dir:gsub("[/\\]$", "")
    if not fs.exists(temp_dir) then
        pcall(fs.create_directories, temp_dir)
    end
end

local function ensure_data_dir()
    local data_dir = paths.data_path("")
    data_dir = data_dir:gsub("[/\\]$", "")
    if not fs.exists(data_dir) then
        pcall(fs.create_directories, data_dir)
    end
end

-- ─── on_load ───

local function on_load()
    logger:info("bootstrapping LuaTools plugin, millennium " .. (millennium.version() or "unknown"))

    -- Detect Steam path
    pcall(steam_utils.detect_steam_install_path)

    -- Ensure directories
    ensure_data_dir()
    ensure_temp_download_dir()

    -- Initialize settings
    local ok, err = pcall(settings_manager.init_settings)
    if not ok then
        logger:warn("LuaTools: settings initialization failed: " .. tostring(err))
    end

    -- Apply pending update if any
    local ok2, msg = pcall(auto_update.apply_pending_update_if_any)
    if ok2 and msg and msg ~= "" then
        api_manifest.store_last_message(msg)
    end

    -- Init applist + fixes index (non-blocking if they fail)
    pcall(downloads.init_applist)
    pcall(fixes.init_fixes_index)

    -- Copy and inject web UI
    copy_webkit_files()
    inject_webkit_files()

    -- Init APIs
    local ok3, result = pcall(api_manifest.init_apis)
    if ok3 then
        logger:info("InitApis (boot) return: " .. tostring(result))
    else
        logger:error("InitApis (boot) failed: " .. tostring(result))
    end

    -- Run auto-update check (synchronous, on-demand only in Lua)
    pcall(auto_update.start_auto_update_check)

    -- Donate keys if enabled
    pcall(donate_keys.check_and_donate_keys)

    -- Signal ready
    millennium.ready()
end

-- ─── RPC Functions ───
-- All functions return JSON strings. Millennium exposes every key
-- in the returned table (except on_load) as an RPC endpoint.

local function LogFromFrontend(kwargs)
    local message = tostring((kwargs or {}).message or "")
    logger:info("[Frontend] " .. message)
    return json.encode({ success = true })
end

local function InitApis()
    return api_manifest.init_apis()
end

local function GetInitApisMessage()
    return api_manifest.get_init_apis_message()
end

local function FetchFreeApisNow()
    return api_manifest.fetch_free_apis_now()
end

local function GetApiList()
    return api_manifest.get_api_list()
end

local function CheckForUpdatesNow()
    local result = auto_update.check_for_updates_now()
    return json.encode(result)
end

local function RestartSteam()
    local success = auto_update.restart_steam()
    if success then
        return json.encode({ success = true })
    end
    return json.encode({ success = false, error = "Failed to restart Steam" })
end

local function HasLuaToolsForApp(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return downloads.has_luatools_for_app(appid)
end

local function StartAddViaLuaTools(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return downloads.start_add_via_luatools(appid)
end

local function GetAddViaLuaToolsStatus(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return downloads.get_add_status(appid)
end

local function CancelAddViaLuaTools(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return downloads.cancel_add_via_luatools(appid)
end

local function GetIconDataUrl()
    return downloads.get_icon_data_url()
end

local function GetGamesDatabase()
    return downloads.get_games_database()
end

local function ReadLoadedApps()
    return downloads.read_loaded_apps()
end

local function DismissLoadedApps()
    return downloads.dismiss_loaded_apps()
end

local function DeleteLuaToolsForApp(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return downloads.delete_luatools_for_app(appid)
end

local function GetInstalledLuaScripts()
    return downloads.get_installed_lua_scripts()
end

local function CheckForFixes(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return fixes.check_for_fixes(appid)
end

local function ApplyGameFix(kwargs)
    kwargs = kwargs or {}
    local appid = tonumber(kwargs.appid)
    local downloadUrl = tostring(kwargs.downloadUrl or "")
    local installPath = tostring(kwargs.installPath or "")
    local fixType = tostring(kwargs.fixType or "")
    local gameName = tostring(kwargs.gameName or "")

    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return fixes.apply_game_fix(appid, downloadUrl, installPath, fixType, gameName)
end

local function GetApplyFixStatus(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return fixes.get_apply_fix_status(appid)
end

local function CancelApplyFix(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return fixes.cancel_apply_fix(appid)
end

local function UnFixGame(kwargs)
    kwargs = kwargs or {}
    local appid = tonumber(kwargs.appid)
    local installPath = tostring(kwargs.installPath or "")
    local fixDate = tostring(kwargs.fixDate or "")

    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return fixes.unfix_game(appid, installPath, fixDate)
end

local function GetUnfixStatus(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    return fixes.get_unfix_status(appid)
end

local function GetInstalledFixes()
    return fixes.get_installed_fixes()
end

local function GetGameInstallPath(kwargs)
    local appid = tonumber((kwargs or {}).appid)
    if not appid then
        return json.encode({ success = false, error = "Invalid appid" })
    end
    local result = steam_utils.get_game_install_path(appid)
    return json.encode(result)
end

local function OpenGameFolder(kwargs)
    local path = tostring((kwargs or {}).path or "")
    local success = steam_utils.open_game_folder(path)
    if success then
        return json.encode({ success = true })
    end
    return json.encode({ success = false, error = "Failed to open path" })
end

local function OpenExternalUrl(kwargs)
    local url = utils.trim(tostring((kwargs or {}).url or ""))

    if not utils.startswith(url, "http://") and not utils.startswith(url, "https://") then
        return json.encode({ success = false, error = "Invalid URL" })
    end

    local ok, _ = pcall(utils.exec, 'start "" "' .. url .. '"')
    if ok then
        return json.encode({ success = true })
    end
    return json.encode({ success = false, error = "Failed to open URL" })
end

local function GetSettingsConfig()
    local ok, payload = pcall(settings_manager.get_settings_payload)
    if not ok then
        logger:warn("LuaTools: GetSettingsConfig failed: " .. tostring(payload))
        return json.encode({ success = false, error = tostring(payload) })
    end

    local response = {
        success = true,
        schemaVersion = payload.version,
        schema = payload.schema or {},
        values = payload.values or {},
        language = payload.language,
        locales = payload.locales or {},
        translations = payload.translations or {},
    }
    return json.encode(response)
end

local function ApplySettingsChanges(kwargs)
    kwargs = kwargs or {}

    -- Extract the changes payload, handling various wrapping patterns
    local payload = nil

    local changes = kwargs.changes
    local changesJson = kwargs.changesJson

    if type(changesJson) == "string" and changesJson ~= "" then
        local ok, parsed = pcall(json.decode, changesJson)
        if ok and type(parsed) == "table" then
            payload = parsed
        else
            return json.encode({ success = false, error = "Invalid JSON payload" })
        end
    elseif type(changes) == "string" and changes ~= "" then
        local ok, parsed = pcall(json.decode, changes)
        if ok and type(parsed) == "table" then
            payload = parsed
            -- Unwrap nested "changes" key if present
            if payload.changes then
                payload = payload.changes
            end
        else
            return json.encode({ success = false, error = "Invalid JSON payload" })
        end
    elseif type(changes) == "table" then
        if changes.changesJson and type(changes.changesJson) == "string" then
            local ok, parsed = pcall(json.decode, changes.changesJson)
            if ok and type(parsed) == "table" then
                payload = parsed
            else
                return json.encode({ success = false, error = "Invalid JSON payload" })
            end
        elseif changes.changes then
            payload = changes.changes
        else
            payload = changes
        end
    else
        -- Try to use kwargs directly as the payload (minus known non-change keys)
        payload = {}
        for k, v in pairs(kwargs) do
            if k ~= "contentScriptQuery" then
                payload[k] = v
            end
        end
    end

    if not payload then payload = {} end

    local ok, result = pcall(settings_manager.apply_settings_changes, payload)
    if not ok then
        logger:warn("LuaTools: ApplySettingsChanges failed: " .. tostring(result))
        return json.encode({ success = false, error = tostring(result) })
    end

    return json.encode(result)
end

local function GetThemes()
    local themes_path = fs.join(paths.get_plugin_dir(), "public", "themes", "themes.json")
    if fs.exists(themes_path) then
        local content, _ = utils.read_file(themes_path)
        if content then
            local ok, data = pcall(json.decode, content)
            if ok then
                return json.encode({ success = true, themes = data })
            end
        end
        return json.encode({ success = false, error = "Failed to read themes.json" })
    end
    return json.encode({ success = true, themes = {} })
end

local function GetAvailableLocales()
    local ok, locales = pcall(settings_manager.get_available_locales)
    if ok then
        return json.encode({ success = true, locales = locales })
    end
    return json.encode({ success = false, error = tostring(locales) })
end

local function GetTranslations(kwargs)
    kwargs = kwargs or {}
    local language = tostring(kwargs.language or "")

    local ok, bundle = pcall(settings_manager.get_translation_map, language)
    if not ok then
        logger:warn("LuaTools: GetTranslations failed: " .. tostring(bundle))
        return json.encode({ success = false, error = tostring(bundle) })
    end

    bundle.success = true
    return json.encode(bundle)
end

local function GetAvailableThemes()
    local themes_dir = fs.join(paths.get_plugin_dir(), "public", "themes")
    local themes = {}

    if fs.exists(themes_dir) then
        local ok, files = pcall(fs.list, themes_dir)
        if ok and files then
            for _, entry in ipairs(files) do
                local name = entry.name or ""
                if name:match("%.css$") then
                    local theme_name = name:sub(1, -5)
                    local display_name = theme_name:sub(1, 1):upper() .. theme_name:sub(2)
                    themes[#themes + 1] = { value = theme_name, label = display_name }
                end
            end
        end
    end

    -- Sort: 'original' first, then alphabetical
    table.sort(themes, function(a, b)
        if a.value == "original" then return true end
        if b.value == "original" then return false end
        return a.label < b.label
    end)

    return json.encode({ success = true, themes = themes })
end

local function GetPluginDir()
    return paths.get_plugin_dir()
end

-- ─── Module exports ───
-- Everything in this table (except on_load) is exposed as an RPC endpoint.

return {
    on_load = on_load,

    -- Logging
    LogFromFrontend = LogFromFrontend,

    -- API manifest
    InitApis = InitApis,
    GetInitApisMessage = GetInitApisMessage,
    FetchFreeApisNow = FetchFreeApisNow,
    GetApiList = GetApiList,

    -- Auto-update
    CheckForUpdatesNow = CheckForUpdatesNow,
    RestartSteam = RestartSteam,

    -- Downloads
    HasLuaToolsForApp = HasLuaToolsForApp,
    StartAddViaLuaTools = StartAddViaLuaTools,
    GetAddViaLuaToolsStatus = GetAddViaLuaToolsStatus,
    CancelAddViaLuaTools = CancelAddViaLuaTools,
    GetIconDataUrl = GetIconDataUrl,
    GetGamesDatabase = GetGamesDatabase,
    ReadLoadedApps = ReadLoadedApps,
    DismissLoadedApps = DismissLoadedApps,
    DeleteLuaToolsForApp = DeleteLuaToolsForApp,
    GetInstalledLuaScripts = GetInstalledLuaScripts,

    -- Fixes
    CheckForFixes = CheckForFixes,
    ApplyGameFix = ApplyGameFix,
    GetApplyFixStatus = GetApplyFixStatus,
    CancelApplyFix = CancelApplyFix,
    UnFixGame = UnFixGame,
    GetUnfixStatus = GetUnfixStatus,
    GetInstalledFixes = GetInstalledFixes,

    -- Game paths
    GetGameInstallPath = GetGameInstallPath,
    OpenGameFolder = OpenGameFolder,
    OpenExternalUrl = OpenExternalUrl,

    -- Settings
    GetSettingsConfig = GetSettingsConfig,
    ApplySettingsChanges = ApplySettingsChanges,
    GetThemes = GetThemes,
    GetAvailableLocales = GetAvailableLocales,
    GetTranslations = GetTranslations,
    GetAvailableThemes = GetAvailableThemes,

    -- Legacy
    GetPluginDir = GetPluginDir,
}
