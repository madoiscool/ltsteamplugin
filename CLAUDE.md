# LTSP_FrontEnd — project instructions

## What this is

This repo is the source of truth for the LuaTools **Millennium plugin**: a Lua backend
(`backend/main.lua` + a few small helper modules) and the browser-injected frontend
(`public/luatools.js`, `public/steamdb-webkit.css`, `public/themes/`) that Millennium delivers into
Steam's CEF pages. See `K:\CRACK STUYFF\LTSP\LuaTools GUI\CLAUDE.md` (the companion desktop-app repo) for
how the same `luatools.js` also gets injected under the non-Millennium "LuaLoader" mode, and for the full
writeup of Millennium's own CDP `Fetch`-domain delivery mechanism.

`backend/main.lua` is intentionally a thin **injector stub**, not a full plugin: it copies the webkit
files into Steam's `steamui/webkit/`, registers them via `millennium.add_browser_css/js`, and relays RPC
calls (`HasLuaToolsForApp`, `StartLuaToolsAdd`, etc. — global Lua functions Millennium dispatches to by
name) to the real backend, which is the separate LuaTools GUI desktop app's HTTP API on
`127.0.0.1:6767`. The plugin used to be a full self-contained implementation (auto-update, downloads,
fixes, settings, 40+ locale files, etc.) — that's all gone now, moved into the desktop app. If you see
references to `downloads.lua`, `fixes.lua`, `settings/`, or similar elsewhere, that's the old
pre-rewrite architecture; don't resurrect it here.

## The live copy and this repo can drift — always sync before you deploy

The plugin actually running in Steam lives at `K:\Steam client\millennium\plugins\luatools`. It is
**not** automatically kept in sync with this repo. It's easy — and has happened — to hotfix something
directly in the live folder while iterating against a running Steam client, verify it works, and forget
to carry the fix back here, leaving this repo stale and the fix unversioned.

- `scripts\sync-from-live.ps1` — pulls live → this repo. Run this if you (or a past session) may have
  edited the live copy directly, before trusting `git diff` to reflect reality.
- `scripts\deploy.ps1` — pushes this repo → live (plus promotes the newest built Millennium core
  DLL/EXEs into the Steam install; see that script's header for details). This is the normal "ship my
  changes" step. **Run `sync-from-live.ps1` first if there's any chance live is ahead** — `deploy.ps1`
  will silently overwrite live with whatever's in the repo.

Both scripts back up whatever they overwrite (timestamped, under
`K:\Steam client\millennium\.deploy-backups\` or alongside the repo copy) before writing.

## Module-name gotcha: `require("json")`, not `require("cjson")`

Millennium's Lua host registers the bundled cjson library into `package.preload` under the key
`"json"` (`Millennium\src\lua_host\main.cc`, `register_preloaded_module(L, "json", luaopen_cjson)`),
**not** `"cjson"`. `require("cjson")` throws at module-load time — since that's a top-level `require` in
`main.lua`, it kills the whole plugin before `on_load` even gets registered, and Millennium reports it as
a generic exit code 1 with nothing useful in `luatools_log.log` (the error only goes to stderr, uncaught).
Always `require("json")` here.

## RPC methods need a handler in two places

Any new RPC method added to `public/luatools.js` (called via `Millennium.callServerMethod("luatools",
"<Name>", args)`) needs a matching handler in **both**:
- `backend/main.lua` here — a **global** Lua function named exactly `<Name>` (Millennium dispatches by
  name, not as a table member).
- `CefInjectorService.CallBackendMethod`'s `methodMap` in the LuaTools GUI repo (`Services\CefInjectorService.cs`) —
  the equivalent bridge for LuaLoader/non-Millennium mode.

Miss one and the method silently no-ops or errors under exactly one of the two install modes — see the
LuaTools GUI CLAUDE.md for how easy this failure mode is to miss (fails-open presence checks, swallowed
exceptions, etc.).
