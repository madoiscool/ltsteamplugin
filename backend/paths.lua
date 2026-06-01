local fs = require("fs")
local m_utils = require("utils")

local paths = {}

-- Fallback logic for when Millennium hasn't set the env var
local function get_current_file_path()
    local info = debug.getinfo(2, "S")
    if info and info.source and info.source:sub(1, 1) == "@" then
        return info.source:sub(2)
    end
    return fs.current_path()
end

local backend_dir = nil
local plugin_dir = nil

function paths.get_backend_dir()
    if backend_dir then return backend_dir end
    
    local be_path = m_utils.get_backend_path()
    if be_path and be_path ~= "" then
        backend_dir = fs.absolute(be_path)
        return backend_dir
    end

    local file_path = get_current_file_path()
    local dir = file_path:match("(.*[/\\])")
    if dir then
        dir = dir:sub(1, -2)
    else
        dir = "."
    end
    backend_dir = fs.absolute(dir)
    return backend_dir
end

function paths.get_plugin_dir()
    if plugin_dir then return plugin_dir end
    local bdir = paths.get_backend_dir()
    plugin_dir = fs.absolute(fs.join(bdir, ".."))
    return plugin_dir
end

function paths.backend_path(filename)
    return fs.join(paths.get_backend_dir(), filename)
end

function paths.public_path(filename)
    return fs.join(paths.get_plugin_dir(), "public", filename)
end

return paths
