--- Filesystem path helpers for the LuaTools backend.

local fs = require("fs")
local utils = require("utils")

local M = {}

function M.get_backend_dir()
    return utils.get_backend_path()
end

function M.get_plugin_dir()
    return fs.parent_path(M.get_backend_dir())
end

function M.backend_path(filename)
    return fs.join(M.get_backend_dir(), filename)
end

function M.public_path(filename)
    return fs.join(M.get_plugin_dir(), "public", filename)
end

function M.data_path(filename)
    return fs.join(M.get_backend_dir(), "data", filename)
end

function M.temp_dl_path(filename)
    return fs.join(M.get_backend_dir(), "temp_dl", filename)
end

function M.locales_dir()
    return fs.join(M.get_backend_dir(), "locales")
end

return M
