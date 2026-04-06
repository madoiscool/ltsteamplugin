--- Steam-related utilities: path detection, VDF parsing, game install paths.

local fs = require("fs")
local millennium = require("millennium")
local logger = require("logger")
local regex = require("regex")
local utils = require("utils")

local M = {}

-- Cached Steam install path
local _steam_install_path = nil

--- Simple VDF parser for libraryfolders.vdf and appmanifest files.
-- @param content string VDF file content
-- @return table Parsed key-value structure
function M.parse_vdf(content)
    local result = {}
    local stack = { result }
    local current_key = nil

    for line in content:gmatch("[^\n]+") do
        line = utils.trim(line)
        if line ~= "" and not utils.startswith(line, "//") then
            -- Extract all "quoted strings", { and } tokens
            local tokens = regex.find_all(line, '"[^"]*"|[{}]')
            if tokens then
                for _, match in ipairs(tokens) do
                    local token = match[0] or match
                    -- Handle string type from regex
                    if type(token) == "table" then token = token[0] or tostring(token) end

                    if token == "{" then
                        if current_key then
                            local new_dict = {}
                            stack[#stack][current_key] = new_dict
                            stack[#stack + 1] = new_dict
                            current_key = nil
                        end
                    elseif token == "}" then
                        if #stack > 1 then
                            stack[#stack] = nil
                        end
                    else
                        -- Strip quotes
                        local value = token:match('^"(.*)"$') or token
                        if current_key == nil then
                            current_key = value
                        else
                            stack[#stack][current_key] = value
                            current_key = nil
                        end
                    end
                end
            end
        end
    end

    return result
end

--- Detect Steam installation path via registry then Millennium fallback.
-- @return string Steam install path (empty string if not found)
function M.detect_steam_install_path()
    if _steam_install_path then
        return _steam_install_path
    end

    -- Try Windows registry (HKCU)
    local ok, output = pcall(utils.exec, 'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath 2>nul')
    if ok and output then
        local path = output:match("SteamPath%s+REG_SZ%s+(.+)")
        if path then
            path = utils.trim(path)
            if path ~= "" and fs.exists(path) then
                _steam_install_path = path
                logger:info("LuaTools: Steam install path (registry HKCU): " .. path)
                return path
            end
        end
    end

    -- Try HKLM
    local ok2, output2 = pcall(utils.exec, 'reg query "HKLM\\Software\\Valve\\Steam" /v InstallPath 2>nul')
    if ok2 and output2 then
        local path = output2:match("InstallPath%s+REG_SZ%s+(.+)")
        if path then
            path = utils.trim(path)
            if path ~= "" and fs.exists(path) then
                _steam_install_path = path
                logger:info("LuaTools: Steam install path (registry HKLM): " .. path)
                return path
            end
        end
    end

    -- Fallback to Millennium
    local ok3, path = pcall(millennium.steam_path)
    if ok3 and path and path ~= "" then
        _steam_install_path = path
        logger:info("LuaTools: Steam install path (millennium): " .. path)
        return path
    end

    logger:warn("LuaTools: Could not detect Steam install path")
    return ""
end

--- Check if a Lua script exists for the given appid.
-- @param appid number
-- @return boolean
function M.has_lua_for_app(appid)
    local base_path = M.detect_steam_install_path()
    if base_path == "" then return false end

    local stplug_path = fs.join(base_path, "config", "stplug-in")
    local lua_file = fs.join(stplug_path, tostring(appid) .. ".lua")
    local disabled_file = fs.join(stplug_path, tostring(appid) .. ".lua.disabled")
    return fs.exists(lua_file) or fs.exists(disabled_file)
end

--- Find the game installation path for a given appid.
-- @param appid number
-- @return table { success, installPath, installDir, libraryPath, path } or { success=false, error }
function M.get_game_install_path(appid)
    appid = tonumber(appid)
    if not appid then
        return { success = false, error = "Invalid appid" }
    end

    local steam_path = M.detect_steam_install_path()
    if steam_path == "" then
        return { success = false, error = "Could not find Steam installation path" }
    end

    local library_vdf_path = fs.join(steam_path, "config", "libraryfolders.vdf")
    if not fs.exists(library_vdf_path) then
        logger:warn("LuaTools: libraryfolders.vdf not found at " .. library_vdf_path)
        return { success = false, error = "Could not find libraryfolders.vdf" }
    end

    local vdf_content, read_err = utils.read_file(library_vdf_path)
    if not vdf_content then
        logger:warn("LuaTools: Failed to read libraryfolders.vdf: " .. (read_err or "unknown"))
        return { success = false, error = "Failed to read libraryfolders.vdf" }
    end

    local ok, library_data = pcall(M.parse_vdf, vdf_content)
    if not ok then
        logger:warn("LuaTools: Failed to parse libraryfolders.vdf: " .. tostring(library_data))
        return { success = false, error = "Failed to parse libraryfolders.vdf" }
    end

    local library_folders = library_data.libraryfolders or {}
    local library_path = nil
    local appid_str = tostring(appid)
    local all_library_paths = {}

    for _, folder_data in pairs(library_folders) do
        if type(folder_data) == "table" then
            local folder_path = folder_data.path or ""
            if folder_path ~= "" then
                folder_path = folder_path:gsub("\\\\", "\\")
                all_library_paths[#all_library_paths + 1] = folder_path
            end

            local apps = folder_data.apps
            if type(apps) == "table" and apps[appid_str] then
                library_path = folder_path
                break
            end
        end
    end

    local appmanifest_path = nil
    if not library_path then
        -- Search all libraries for appmanifest file
        logger:info("LuaTools: appid " .. appid_str .. " not in libraryfolders.vdf, searching all libraries")
        for _, lib_path in ipairs(all_library_paths) do
            local candidate = fs.join(lib_path, "steamapps", "appmanifest_" .. appid_str .. ".acf")
            if fs.exists(candidate) then
                library_path = lib_path
                appmanifest_path = candidate
                logger:info("LuaTools: Found appmanifest at " .. appmanifest_path)
                break
            end
        end
    else
        appmanifest_path = fs.join(library_path, "steamapps", "appmanifest_" .. appid_str .. ".acf")
    end

    if not library_path or not appmanifest_path or not fs.exists(appmanifest_path) then
        logger:info("LuaTools: appmanifest not found for " .. appid_str .. " in any library")
        return { success = false, error = "menu.error.notInstalled" }
    end

    local manifest_content, m_err = utils.read_file(appmanifest_path)
    if not manifest_content then
        logger:warn("LuaTools: Failed to read appmanifest: " .. (m_err or "unknown"))
        return { success = false, error = "Failed to parse appmanifest" }
    end

    local ok2, manifest_data = pcall(M.parse_vdf, manifest_content)
    if not ok2 then
        logger:warn("LuaTools: Failed to parse appmanifest: " .. tostring(manifest_data))
        return { success = false, error = "Failed to parse appmanifest" }
    end

    local app_state = manifest_data.AppState or {}
    local install_dir = app_state.installdir or ""
    if install_dir == "" then
        logger:warn("LuaTools: installdir not found in appmanifest for " .. appid_str)
        return { success = false, error = "Install directory not found" }
    end

    local full_install_path = fs.join(library_path, "steamapps", "common", install_dir)
    if not fs.exists(full_install_path) then
        logger:warn("LuaTools: Game install path does not exist: " .. full_install_path)
        return { success = false, error = "Game directory not found" }
    end

    logger:info("LuaTools: Game install path for " .. appid_str .. ": " .. full_install_path)
    return {
        success = true,
        installPath = full_install_path,
        installDir = install_dir,
        libraryPath = library_path,
        path = full_install_path,
    }
end

--- Open a folder in the system file explorer.
-- @param path string
-- @return boolean success
function M.open_game_folder(path)
    if not path or path == "" or not fs.exists(path) then
        return false
    end

    local ok, _ = pcall(utils.exec, 'explorer "' .. path:gsub("/", "\\") .. '"')
    return ok
end

--- Detect Steam UI language from Windows registry.
-- @return string|nil locale code (e.g. "en", "fr", "pt-BR")
function M.detect_steam_language()
    local STEAM_LANG_TO_LOCALE = {
        arabic = "ar",
        bulgarian = "bg",
        brazilian = "pt-BR",
        czech = "cs",
        danish = "da",
        dutch = "nl",
        english = "en",
        finnish = "fi",
        french = "fr",
        german = "de",
        greek = "el",
        hungarian = "hu",
        indonesian = "id",
        italian = "it",
        japanese = "ja",
        koreana = "ko",
        latam = "es",
        norwegian = "no",
        polish = "pl",
        portuguese = "pt",
        romanian = "ro",
        russian = "ru",
        schinese = "zh-CN",
        spanish = "es",
        swedish = "sv",
        tchinese = "zh-TW",
        thai = "th",
        turkish = "tr",
        ukrainian = "uk",
        vietnamese = "vi",
    }

    local ok, output = pcall(utils.exec, 'reg query "HKCU\\Software\\Valve\\Steam" /v Language 2>nul')
    if ok and output then
        local lang = output:match("Language%s+REG_SZ%s+(%S+)")
        if lang then
            lang = utils.trim(lang):lower()
            return STEAM_LANG_TO_LOCALE[lang]
        end
    end

    return nil
end

return M
