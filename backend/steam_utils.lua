local m_utils = require("utils")
local millennium = require("millennium")
local fs = require("fs")
local logger = require("plugin_logger")
local paths = require("paths")

local steam_utils = {}

local STEAM_INSTALL_PATH = nil

function steam_utils.detect_steam_install_path()
    if STEAM_INSTALL_PATH then return STEAM_INSTALL_PATH end
    local success, path = pcall(millennium.steam_path)
    if success and path then
        STEAM_INSTALL_PATH = path
        logger.log("LuaTools: Steam install path set to " .. tostring(STEAM_INSTALL_PATH))
        return STEAM_INSTALL_PATH
    end
    return ""
end

function steam_utils.has_lua_for_app(appid)
    local base_path = steam_utils.detect_steam_install_path()
    if not base_path or base_path == "" then return false end

    local stplug_path = fs.join(base_path, "config", "stplug-in")
    local lua_file = fs.join(stplug_path, tostring(appid) .. ".lua")
    local disabled_file = fs.join(stplug_path, tostring(appid) .. ".lua.disabled")

    return fs.exists(lua_file) or fs.exists(disabled_file)
end

function steam_utils.get_game_install_path_response(appid)
    appid = tostring(appid)
    local steam_path = steam_utils.detect_steam_install_path()
    if not steam_path or steam_path == "" then
        return { success = false, error = "Could not find Steam installation path" }
    end

    local library_vdf_path = fs.join(steam_path, "config", "libraryfolders.vdf")
    if not fs.exists(library_vdf_path) then
        return { success = false, error = "Could not find libraryfolders.vdf" }
    end
    
    local vdf_content = m_utils.read_file(library_vdf_path)
    if not vdf_content then
        return { success = false, error = "Failed to read libraryfolders.vdf" }
    end
    
    local all_library_paths = {}
    for path in vdf_content:gmatch('"path"%s+"([^"]+)"') do
        path = path:gsub("\\\\", "\\")
        table.insert(all_library_paths, path)
    end
    
    local library_path = nil
    local appmanifest_path = nil
    
    for _, lib_path in ipairs(all_library_paths) do
        local candidate = fs.join(lib_path, "steamapps", "appmanifest_" .. appid .. ".acf")
        if fs.exists(candidate) then
            library_path = lib_path
            appmanifest_path = candidate
            break
        end
    end
    
    if not library_path or not appmanifest_path then
        return { success = false, error = "menu.error.notInstalled" }
    end
    
    local manifest_content = m_utils.read_file(appmanifest_path)
    if not manifest_content then
        return { success = false, error = "Failed to parse appmanifest" }
    end
    
    local install_dir = manifest_content:match('"installdir"%s+"([^"]+)"')
    if not install_dir then
        return { success = false, error = "Install directory not found" }
    end
    
    local full_install_path = fs.join(library_path, "steamapps", "common", install_dir)
    if not fs.exists(full_install_path) then
        return { success = false, error = "Game directory not found" }
    end
    
    return {
        success = true,
        installPath = full_install_path,
        installDir = install_dir,
        libraryPath = library_path,
        path = full_install_path
    }
end

function steam_utils.open_game_folder(path)
    if not path or path == "" or not fs.exists(path) then return false end
    
    -- In Windows, explorer accepts backslashes
    path = path:gsub("/", "\\")
    local cmd = 'explorer "' .. path .. '"'
    m_utils.exec(cmd)
    return true
end

return steam_utils
