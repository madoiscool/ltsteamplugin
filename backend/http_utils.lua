--- HTTP helper with fallback URL pattern and error handling.

local http = require("http")
local logger = require("logger")
local config = require("config")

local M = {}

--- Make a GET request with optional fallback URL.
-- @param url string Primary URL
-- @param opts table|nil Options: { timeout, headers, fallback_url, follow_redirects }
-- @return table|nil response { status, body, headers }
-- @return string|nil error message
function M.get(url, opts)
    opts = opts or {}
    local timeout = opts.timeout or config.HTTP_TIMEOUT_SECONDS
    local headers = opts.headers or {}
    local follow_redirects = opts.follow_redirects
    if follow_redirects == nil then follow_redirects = true end

    local resp, err = http.get(url, {
        timeout = timeout,
        headers = headers,
        follow_redirects = follow_redirects,
    })

    if resp and resp.status >= 200 and resp.status < 300 then
        return resp, nil
    end

    -- If primary failed and we have a fallback, try it
    if opts.fallback_url then
        local fallback_timeout = opts.fallback_timeout or config.HTTP_PROXY_TIMEOUT_SECONDS
        logger:warn("HTTP primary failed for " .. url .. ", trying fallback: " .. opts.fallback_url)

        local resp2, err2 = http.get(opts.fallback_url, {
            timeout = fallback_timeout,
            headers = headers,
            follow_redirects = follow_redirects,
        })

        if resp2 and resp2.status >= 200 and resp2.status < 300 then
            return resp2, nil
        end

        return nil, "Primary: " .. (err or tostring(resp and resp.status)) .. " | Fallback: " .. (err2 or tostring(resp2 and resp2.status))
    end

    return nil, err or ("HTTP " .. tostring(resp and resp.status) .. " for " .. url)
end

--- Make a POST request.
-- @param url string
-- @param data string Request body
-- @param opts table|nil Options: { timeout, headers }
-- @return table|nil response
-- @return string|nil error message
function M.post(url, data, opts)
    opts = opts or {}
    local timeout = opts.timeout or config.HTTP_TIMEOUT_SECONDS
    local headers = opts.headers or {}

    local resp, err = http.post(url, data, {
        timeout = timeout,
        headers = headers,
    })

    if resp and resp.status >= 200 and resp.status < 300 then
        return resp, nil
    end

    return nil, err or ("HTTP " .. tostring(resp and resp.status) .. " for " .. url)
end

--- Make a HEAD request (for checking existence without downloading).
-- @param url string
-- @param opts table|nil Options: { timeout }
-- @return number|nil status code
-- @return string|nil error message
function M.head(url, opts)
    opts = opts or {}
    local timeout = opts.timeout or 10

    local resp, err = http.request(url, {
        method = "HEAD",
        timeout = timeout,
        follow_redirects = true,
    })

    if resp then
        return resp.status, nil
    end

    return nil, err
end

return M
