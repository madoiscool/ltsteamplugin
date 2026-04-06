--- Central configuration constants for the LuaTools backend.

local M = {}

-- Web UI file names
M.WEBKIT_DIR_NAME = "LuaTools"
M.WEB_UI_JS_FILE = "luatools.js"
M.WEB_UI_ICON_FILE = "luatools-icon.png"
M.WEB_UI_CSS_FILE = "steamdb-webkit.css"

-- API manifest
M.API_MANIFEST_URL = "https://raw.githubusercontent.com/madoiscool/lt_api_links/refs/heads/main/load_free_manifest_apis"
M.API_MANIFEST_PROXY_URL = "https://luatools.vercel.app/load_free_manifest_apis"
M.API_JSON_FILE = "api.json"

-- Auto-update
M.UPDATE_CONFIG_FILE = "update.json"
M.UPDATE_PENDING_ZIP = "update_pending.zip"
M.UPDATE_PENDING_INFO = "update_pending.json"

-- HTTP
M.HTTP_TIMEOUT_SECONDS = 15
M.HTTP_PROXY_TIMEOUT_SECONDS = 15

-- User agent
M.USER_AGENT = "discord(dot)gg/luatools"

-- App tracking files
M.LOADED_APPS_FILE = "loadedappids.txt"
M.APPID_LOG_FILE = "appidlogs.txt"

-- Steam API rate limiting
M.API_CALL_MIN_INTERVAL = 0.3 -- 300ms between Steam API calls

-- Fixes
M.FIXES_INDEX_URL = "https://index.luatools.work/fixes-index.json"
M.FIXES_FILES_BASE_URL = "https://files.luatools.work/GameBypasses"

-- Games database
M.GAMES_DB_URL = "https://toolsdb.piqseu.cc/games.json"
M.GAMES_DB_FILE = "games_db.json"
M.GAMES_DB_MAX_AGE_SECONDS = 24 * 60 * 60 -- 24 hours

-- Applist
M.APPLIST_URL = "https://applist.morrenus.xyz/"
M.APPLIST_FILE = "applist.json"

-- Key donation
M.DONATE_KEYS_URL = "http://167.235.229.108/donatekeys/send"

-- Steam store API
M.STEAM_STORE_API_URL = "https://store.steampowered.com/api/appdetails"
M.STEAMCMD_API_URL = "https://api.steamcmd.net/v1/info"

return M
