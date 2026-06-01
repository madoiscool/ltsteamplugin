local m_http = require("http")
local config = require("config")

local http_client = {}

function http_client.get(url, options)
    options = options or {}
    options.timeout = options.timeout or config.HTTP_TIMEOUT_SECONDS
    return m_http.get(url, options)
end

function http_client.post(url, options)
    options = options or {}
    options.timeout = options.timeout or config.HTTP_TIMEOUT_SECONDS
    local data = options.data
    options.data = nil
    return m_http.post(url, data, options)
end

return http_client
