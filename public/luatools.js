// LuaTools button injection (standalone plugin)
(function() {
    'use strict';
    
    // Forward logs to Millennium backend so they appear in the dev console
    function backendLog(message) {
        try {
            if (typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                Millennium.callServerMethod('luatools', 'Logger.log', { message: String(message) });
            }
        } catch (err) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[LuaTools] backendLog failed', err);
            }
        }
    }
    
    backendLog('LuaTools script loaded');
    // anti-spam state
    const logState = { missingOnce: false, existsOnce: false };
    // click/run debounce state
    const runState = { inProgress: false, appid: null };
    
    const TRANSLATION_PLACEHOLDER = 'translation missing';

    function applyTranslationBundle(bundle) {
        if (!bundle || typeof bundle !== 'object') return;
        const stored = window.__LuaToolsI18n || {};
        if (bundle.language) {
            stored.language = String(bundle.language);
        } else if (!stored.language) {
            stored.language = 'en';
        }
        if (bundle.strings && typeof bundle.strings === 'object') {
            stored.strings = bundle.strings;
        } else if (!stored.strings) {
            stored.strings = {};
        }
        if (Array.isArray(bundle.locales)) {
            stored.locales = bundle.locales;
        } else if (!Array.isArray(stored.locales)) {
            stored.locales = [];
        }
        stored.ready = true;
        stored.lastFetched = Date.now();
        window.__LuaToolsI18n = stored;
    }

    function showSettingsPopup() {
        if (document.querySelector('.luatools-settings-overlay') || settingsMenuPending) return;
        settingsMenuPending = true;
        ensureTranslationsLoaded(false).catch(function(){ return null; }).finally(function(){
            settingsMenuPending = false;
            if (document.querySelector('.luatools-settings-overlay')) return;

            try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}

            const overlay = document.createElement('div');
            overlay.className = 'luatools-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

            const modal = document.createElement('div');
            modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

            const title = document.createElement('div');
            title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
            title.textContent = t('menu.title', 'LuaTools · Menu');

            const body = document.createElement('div');
            body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';

            const container = document.createElement('div');
            container.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center;';

            function createSectionLabel(key, fallback, marginTop) {
                const label = document.createElement('div');
                const topValue = typeof marginTop === 'number' ? marginTop : 8;
                label.style.cssText = 'font-size:13px;color:#8b8b8b;margin-top:' + topValue + 'px;margin-bottom:-6px;font-weight:500;';
                label.textContent = t(key, fallback);
                container.appendChild(label);
                return label;
            }

            function createMenuButton(id, key, fallback) {
                const btn = document.createElement('a');
                btn.id = id;
                btn.href = '#';
                btn.className = 'btnv6_blue_hoverfade btn_medium';
                btn.innerHTML = '<span>' + t(key, fallback) + '</span>';
                container.appendChild(btn);
                return btn;
            }

            createSectionLabel('menu.joinDiscordLabel', 'Join the Discord!', 4);
            const discordBtn = createMenuButton('lt-settings-discord', 'menu.discord', 'Discord');

            createSectionLabel('menu.manageGameLabel', 'Manage Game');
            const removeBtn = createMenuButton('lt-settings-remove-lua', 'menu.removeLuaTools', 'Remove via LuaTools');
            removeBtn.style.display = 'none';
            const fixesMenuBtn = createMenuButton('lt-settings-fixes-menu', 'menu.fixesMenu', 'Fixes Menu');

            createSectionLabel('menu.advancedLabel', 'Advanced');
            const checkBtn = createMenuButton('lt-settings-check', 'menu.checkForUpdates', 'Check For Updates');
            const fetchApisBtn = createMenuButton('lt-settings-fetch-apis', 'menu.fetchFreeApis', 'Fetch Free APIs');
            const settingsManagerBtn = createMenuButton('lt-settings-open-manager', 'menu.settings', 'Settings');

            body.appendChild(container);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
            const closeBtn = document.createElement('a');
            closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
            closeBtn.innerHTML = '<span>' + t('settings.close', 'Close') + '</span>';
            closeBtn.href = '#';
            closeBtn.addEventListener('click', function(e){
                e.preventDefault();
                overlay.remove();
            });
            btnRow.appendChild(closeBtn);

            modal.appendChild(title);
            modal.appendChild(body);
            modal.appendChild(btnRow);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            if (checkBtn) {
                checkBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    try {
                        Millennium.callServerMethod('luatools', 'CheckForUpdatesNow', { contentScriptQuery: '' }).then(function(res){
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                const msg = (payload && payload.message) ? String(payload.message) : lt('No updates available.');
                                try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            } catch(_) {}
                        });
                    } catch(_) {}
                });
            }

            if (discordBtn) {
                discordBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    const url = 'https://discord.gg/luatools';
                    try {
                        Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url, contentScriptQuery: '' });
                    } catch(_) {}
                });
            }

            if (fetchApisBtn) {
                fetchApisBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    try {
                        Millennium.callServerMethod('luatools', 'FetchFreeApisNow', { contentScriptQuery: '' }).then(function(res){
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                const ok = payload && payload.success;
                                const count = payload && payload.count;
                                const successText = lt('Loaded free APIs: {count}').replace('{count}', (count != null ? count : '?'));
                                const failText = (payload && payload.error) ? String(payload.error) : lt('Failed to load free APIs.');
                                const text = ok ? successText : failText;
                                try { ShowAlertDialog && ShowAlertDialog('LuaTools', text); } catch(_) { alert(text); }
                            } catch(_) {}
                        });
                    } catch(_) {}
                });
            }

            if (settingsManagerBtn) {
                settingsManagerBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    showSettingsManagerPopup(false);
                });
            }

            if (fixesMenuBtn) {
                fixesMenuBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try {
                        const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                        const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                        if (isNaN(appid)) {
                            try { overlay.remove(); } catch(_) {}
                            const errText = t('menu.error.noAppId', 'Could not determine game AppID');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', errText); } catch(_) { alert(errText); }
                            return;
                        }

                        Millennium.callServerMethod('luatools', 'GetGameInstallPath', { appid, contentScriptQuery: '' }).then(function(pathRes){
                            try {
                                const pathPayload = typeof pathRes === 'string' ? JSON.parse(pathRes) : pathRes;
                                if (!pathPayload || !pathPayload.success) {
                                    try { overlay.remove(); } catch(_) {}
                                    const errorKey = (pathPayload && pathPayload.error) ? String(pathPayload.error) : 'menu.error.noInstall';
                                    const errorMsg = (errorKey.startsWith('menu.error.') || errorKey.startsWith('common.')) ? t(errorKey) : errorKey;
                                    try { ShowAlertDialog && ShowAlertDialog('LuaTools', errorMsg); } catch(_) { alert(errorMsg); }
                                    return;
                                }

                                window.__LuaToolsGameInstallPath = pathPayload.installPath;

                                try { overlay.remove(); } catch(_) {}
                                showFixesMenuPopup();
                            } catch(err) {
                                backendLog('LuaTools: GetGameInstallPath error: ' + err);
                                try { overlay.remove(); } catch(_) {}
                            }
                        }).catch(function() {
                            try { overlay.remove(); } catch(_) {}
                            const errorText = t('menu.error.getPath', 'Error getting game path');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', errorText); } catch(_) { alert(errorText); }
                        });
                    } catch(err) {
                        backendLog('LuaTools: Fixes Menu button error: ' + err);
                    }
                });
            }

            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    Millennium.callServerMethod('luatools', 'HasLuaToolsForApp', { appid, contentScriptQuery: '' }).then(function(res){
                        try {
                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                            const exists = !!(payload && payload.success && payload.exists === true);
                            if (exists) {
                                removeBtn.style.display = '';
                                removeBtn.onclick = function(e){
                                    e.preventDefault();
                                    closeSettingsOverlay();
                                    const reopen = function(){ try { showSettingsPopup(); } catch(_) {} };
                                    const confirmMessage = t('menu.remove.confirm', 'Remove via LuaTools for this game?');
                                    showLuaToolsConfirm('LuaTools', confirmMessage, function(){
                                        doDelete();
                                    }, function(){
                                        reopen();
                                    });
                                };
                                function doDelete(){
                                    try {
                                        Millennium.callServerMethod('luatools', 'DeleteLuaToolsForApp', { appid, contentScriptQuery: '' }).then(function(){
                                            try {
                                                window.__LuaToolsButtonInserted = false;
                                                window.__LuaToolsPresenceCheckInFlight = false;
                                                window.__LuaToolsPresenceCheckAppId = undefined;
                                                addLuaToolsButton();
                                            } catch(_) {}
                                        }).then(function(){
                                            const successText = t('menu.remove.success', 'LuaTools removed for this app.');
                                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', successText); } catch(_) { alert(successText); }
                                        }).catch(function(err){
                                            const failureText = t('menu.remove.failure', 'Failed to remove LuaTools.');
                                            const errMsg = (err && err.message) ? err.message : failureText;
                                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', errMsg); } catch(_) { alert(errMsg); }
                                        });
                                    } catch(_) {}
                                }
                            } else {
                                removeBtn.style.display = 'none';
                            }
                        } catch(_) {}
                    });
                }
            } catch(_) {}
        });
    }

    function ensureTranslationsLoaded(forceRefresh, preferredLanguage) {
        try {
            if (!forceRefresh && window.__LuaToolsI18n && window.__LuaToolsI18n.ready) {
                return Promise.resolve(window.__LuaToolsI18n);
            }
            if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
                window.__LuaToolsI18n = window.__LuaToolsI18n || { language: 'en', locales: [], strings: {}, ready: false };
                return Promise.resolve(window.__LuaToolsI18n);
            }
            const targetLanguage = (typeof preferredLanguage === 'string' && preferredLanguage) ? preferredLanguage :
                ((window.__LuaToolsI18n && window.__LuaToolsI18n.language) || '');
            return Millennium.callServerMethod('luatools', 'GetTranslations', { language: targetLanguage, contentScriptQuery: '' }).then(function(res){
                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                if (!payload || payload.success !== true || !payload.strings) {
                    throw new Error('Invalid translation payload');
                }
                applyTranslationBundle(payload);
                // Update button text after translations are loaded
                updateButtonTranslations();
                return window.__LuaToolsI18n;
            }).catch(function(err){
                backendLog('LuaTools: translation load failed: ' + err);
                window.__LuaToolsI18n = window.__LuaToolsI18n || { language: 'en', locales: [], strings: {}, ready: false };
                return window.__LuaToolsI18n;
            });
        } catch(err) {
            backendLog('LuaTools: ensureTranslationsLoaded error: ' + err);
            window.__LuaToolsI18n = window.__LuaToolsI18n || { language: 'en', locales: [], strings: {}, ready: false };
            return Promise.resolve(window.__LuaToolsI18n);
        }
    }

    function translateText(key, fallback) {
        if (!key) {
            return typeof fallback !== 'undefined' ? fallback : '';
        }
        try {
            const store = window.__LuaToolsI18n;
            if (store && store.strings && Object.prototype.hasOwnProperty.call(store.strings, key)) {
                const value = store.strings[key];
                if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if (trimmed && trimmed.toLowerCase() !== TRANSLATION_PLACEHOLDER) {
                        return value;
                    }
                }
            }
        } catch(_) {}
        return typeof fallback !== 'undefined' ? fallback : key;
    }

    function t(key, fallback) {
        return translateText(key, fallback);
    }

    function lt(text) {
        return t(text, text);
    }

    // Preload translations asynchronously (no-op if backend unavailable)
    ensureTranslationsLoaded(false);

    let settingsMenuPending = false;
    
    // Helper: show a Steam-style popup with a 10s loading bar (custom UI)
    function showTestPopup() {

        // Avoid duplicates
        if (document.querySelector('.luatools-overlay')) return;
        // Close settings popup if open so modals don't overlap
        try { const s = document.querySelector('.luatools-settings-overlay'); if (s) s.remove(); } catch(_) {}

        const overlay = document.createElement('div');
        overlay.className = 'luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:340px;max-width:560px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.className = 'luatools-title';
        title.textContent = 'LuaTools';

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.4;margin-bottom:12px;';
        body.className = 'luatools-status';
        body.textContent = lt('Working…');

        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = 'background:#2a475e;height:10px;border-radius:4px;overflow:hidden;position:relative;display:none;';
        progressWrap.className = 'luatools-progress-wrap';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'height:100%;width:0%;background:#66c0f4;transition:width 0.1s linear;';
        progressBar.className = 'luatools-progress-bar';
        progressWrap.appendChild(progressBar);

        const percent = document.createElement('div');
        percent.style.cssText = 'text-align:right;color:#8f98a0;margin-top:8px;font-size:12px;display:none;';
        percent.className = 'luatools-percent';
        percent.textContent = '0%';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
        const cancelBtn = document.createElement('a');
        cancelBtn.className = 'btnv6_blue_hoverfade btn_medium luatools-cancel-btn';
        cancelBtn.innerHTML = '<span>' + lt('Cancel') + '</span>';
        cancelBtn.href = '#';
        cancelBtn.style.display = 'none';
        cancelBtn.onclick = function(e){ e.preventDefault(); cancelOperation(); };
        const hideBtn = document.createElement('a');
        hideBtn.className = 'btnv6_blue_hoverfade btn_medium luatools-hide-btn';
        hideBtn.innerHTML = '<span>' + lt('Hide') + '</span>';
        hideBtn.href = '#';
        hideBtn.onclick = function(e){ e.preventDefault(); cleanup(); };
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(hideBtn);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(progressWrap);
        modal.appendChild(percent);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function cleanup(){
            overlay.remove();
        }
        
        function cancelOperation(){
            // Call backend to cancel the operation
            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    Millennium.callServerMethod('luatools', 'CancelAddViaLuaTools', { appid, contentScriptQuery: '' });
                }
            } catch(_) {}
            // Update UI to show cancelled
            const status = overlay.querySelector('.luatools-status');
            if (status) status.textContent = lt('Cancelled');
            const cancelBtn = overlay.querySelector('.luatools-cancel-btn');
            if (cancelBtn) cancelBtn.style.display = 'none';
            const hideBtn = overlay.querySelector('.luatools-hide-btn');
            if (hideBtn) hideBtn.innerHTML = '<span>' + lt('Close') + '</span>';
            // Hide progress UI
            const wrap = overlay.querySelector('.luatools-progress-wrap');
            const percent = overlay.querySelector('.luatools-percent');
            if (wrap) wrap.style.display = 'none';
            if (percent) percent.style.display = 'none';
            // Reset run state
            runState.inProgress = false;
            runState.appid = null;
        }
    }

    // Loading Fixes popup
    function showLoadingFixesPopup() {
        if (document.querySelector('.luatools-loading-fixes-overlay')) return;
        // Close other popups
        try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
        try { const s = document.querySelector('.luatools-settings-overlay'); if (s) s.remove(); } catch(_) {}
        try { const f = document.querySelector('.luatools-fixes-overlay'); if (f) f.remove(); } catch(_) {}
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-loading-fixes-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:420px;max-width:600px;padding:24px 28px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:18px;color:#66c0f4;margin-bottom:24px;font-weight:600;text-align:center;';
        title.textContent = lt('Loading fixes...');

        const statusContainer = document.createElement('div');
        statusContainer.id = 'lt-loading-status';
        statusContainer.style.cssText = 'display:flex;flex-direction:column;gap:14px;margin-bottom:8px;';
        
        // Create status items
        const statusItems = [
            { id: 'status-name', text: lt('Fetching game name...'), icon: '⏳' },
            { id: 'status-generic', text: lt('Checking generic fix...'), icon: '⏳' },
            { id: 'status-online', text: lt('Checking online-fix...'), icon: '⏳' }
        ];
        
        statusItems.forEach(function(item) {
            const statusDiv = document.createElement('div');
            statusDiv.id = item.id;
            statusDiv.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,0.05);border-radius:3px;';
            
            const icon = document.createElement('span');
            icon.className = 'status-icon';
            icon.style.cssText = 'font-size:16px;min-width:20px;text-align:center;';
            icon.textContent = item.icon;
            
            const text = document.createElement('span');
            text.className = 'status-text';
            text.style.cssText = 'font-size:14px;color:#c7d5e0;flex:1;';
            text.textContent = item.text;
            
            statusDiv.appendChild(icon);
            statusDiv.appendChild(text);
            statusContainer.appendChild(statusDiv);
        });

        modal.appendChild(title);
        modal.appendChild(statusContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Helper function to update status
        window.__updateLoadingStatus = function(statusId, newText, newIcon, color) {
            try {
                const statusDiv = document.getElementById(statusId);
                if (statusDiv) {
                    const icon = statusDiv.querySelector('.status-icon');
                    const text = statusDiv.querySelector('.status-text');
                    if (icon && newIcon) icon.textContent = newIcon;
                    if (text && newText) text.textContent = newText;
                    if (color) text.style.color = color;
                }
            } catch(e) {}
        };
    }

    // Fixes Results popup
    function showFixesResultsPopup(data) {
        if (document.querySelector('.luatools-fixes-results-overlay')) return;
        // Close other popups
        try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
        try { const s = document.querySelector('.luatools-settings-overlay'); if (s) s.remove(); } catch(_) {}
        try { const f = document.querySelector('.luatools-fixes-overlay'); if (f) f.remove(); } catch(_) {}
        try { const l = document.querySelector('.luatools-loading-fixes-overlay'); if (l) l.remove(); } catch(_) {}
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-fixes-results-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('LuaTools · Fixes Menu');

        const gameName = document.createElement('div');
        gameName.style.cssText = 'font-size:20px;color:#fff;margin-bottom:24px;font-weight:700;text-align:center;';
        gameName.textContent = data.gameName || lt('Unknown Game');

        const body = document.createElement('div');
        body.style.cssText = 'display:flex;flex-direction:column;gap:16px;align-items:center;margin-bottom:16px;';

        // Generic Fix section
        const genericSection = document.createElement('div');
        genericSection.style.cssText = 'width:100%;text-align:center;';
        const genericLabel = document.createElement('div');
        genericLabel.style.cssText = 'font-size:16px;color:#fff;margin-bottom:8px;font-weight:600;';
        genericLabel.textContent = lt('Generic Fix');
        const genericBtn = document.createElement('a');
        genericBtn.className = 'btnv6_blue_hoverfade btn_medium';
        genericBtn.href = '#';
        
        const genericStatus = data.genericFix.status;
        if (genericStatus === 200) {
            genericBtn.innerHTML = '<span style="color:#fff !important;">' + lt('Apply') + '</span>';
            genericBtn.style.cssText = 'background:#5c9c3e !important;padding:12px 24px;font-size:14px;';
            genericBtn.onclick = function(e){ 
                e.preventDefault(); 
                const genericUrl = 'https://github.com/ShayneVi/Bypasses/releases/download/v1.0/' + data.appid + '.zip';
                applyFix(data.appid, genericUrl, lt('Generic Fix'), data.gameName, overlay);
            };
        } else if (genericStatus === 404) {
            genericBtn.innerHTML = '<span>' + lt('Not found') + '</span>';
            genericBtn.style.cssText = 'padding:12px 24px;font-size:14px;';
            genericBtn.onclick = function(e){ e.preventDefault(); };
        } else {
            genericBtn.innerHTML = '<span>' + lt('Error! Code: {code}').replace('{code}', genericStatus) + '</span>';
            genericBtn.style.cssText = 'padding:12px 24px;font-size:14px;';
            genericBtn.onclick = function(e){ e.preventDefault(); };
        }
        genericSection.appendChild(genericLabel);
        genericSection.appendChild(genericBtn);

        // Online-Fix section
        const onlineSection = document.createElement('div');
        onlineSection.style.cssText = 'width:100%;text-align:center;';
        const onlineLabel = document.createElement('div');
        onlineLabel.style.cssText = 'font-size:16px;color:#fff;margin-bottom:8px;font-weight:600;';
        onlineLabel.textContent = lt('Online Fix');
        const onlineBtn = document.createElement('a');
        onlineBtn.className = 'btnv6_blue_hoverfade btn_medium';
        onlineBtn.href = '#';
        
        const onlineStatus = data.onlineFix.status;
        if (onlineStatus === 200) {
            onlineBtn.innerHTML = '<span style="color:#fff !important;">' + lt('Apply') + '</span>';
            onlineBtn.style.cssText = 'background:#5c9c3e !important;padding:12px 24px;font-size:14px;';
            onlineBtn.onclick = function(e){ 
                e.preventDefault(); 
                const onlineUrl = data.onlineFix.url || ('https://github.com/ShayneVi/OnlineFix1/releases/download/fixes/' + data.appid + '.zip');
                applyFix(data.appid, onlineUrl, lt('Online Fix'), data.gameName, overlay);
            };
        } else if (onlineStatus === 404) {
            onlineBtn.innerHTML = '<span>' + lt('Not found') + '</span>';
            onlineBtn.style.cssText = 'padding:12px 24px;font-size:14px;';
            onlineBtn.onclick = function(e){ e.preventDefault(); };
        } else {
            onlineBtn.innerHTML = '<span>' + lt('Error! Code: {code}').replace('{code}', onlineStatus) + '</span>';
            onlineBtn.style.cssText = 'padding:12px 24px;font-size:14px;';
            onlineBtn.onclick = function(e){ e.preventDefault(); };
        }
        onlineSection.appendChild(onlineLabel);
        onlineSection.appendChild(onlineBtn);

        body.appendChild(genericSection);
        body.appendChild(onlineSection);

        // Credit message
        const creditMsg = document.createElement('div');
        creditMsg.style.cssText = 'margin-top:20px;text-align:center;font-size:13px;color:#8f98a0;';
        const creditTemplate = lt('Only possible thanks to {name} 💜');
        creditMsg.innerHTML = creditTemplate.replace('{name}', '<a href="#" id="lt-shayenvi-link" style="color:#66c0f4;text-decoration:none;font-weight:600;">ShayneVi</a>');
        body.appendChild(creditMsg);
        
        // Wire up ShayneVi link
        setTimeout(function(){
            const shayenviLink = overlay.querySelector('#lt-shayenvi-link');
            if (shayenviLink) {
                shayenviLink.addEventListener('click', function(e){
                    e.preventDefault();
                    try {
                        Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url: 'https://github.com/ShayneVi/', contentScriptQuery: '' });
                    } catch(_) {}
                });
            }
        }, 0);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:center;';
        const backBtn = document.createElement('a');
        backBtn.className = 'btnv6_blue_hoverfade btn_medium';
        backBtn.innerHTML = '<span>' + lt('Back') + '</span>';
        backBtn.href = '#';
        backBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); showFixesMenuPopup(); };
        const gameFolderBtn = document.createElement('a');
        gameFolderBtn.className = 'btnv6_blue_hoverfade btn_medium';
        gameFolderBtn.innerHTML = '<span>' + lt('Game folder') + '</span>';
        gameFolderBtn.href = '#';
        gameFolderBtn.onclick = function(e){ 
            e.preventDefault(); 
            if (window.__LuaToolsGameInstallPath) {
                try {
                    Millennium.callServerMethod('luatools', 'OpenGameFolder', { path: window.__LuaToolsGameInstallPath, contentScriptQuery: '' });
                } catch(err) {
                    backendLog('LuaTools: Failed to open game folder: ' + err);
                }
            }
        };
        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
        closeBtn.href = '#';
        closeBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); };
        btnRow.appendChild(backBtn);
        btnRow.appendChild(gameFolderBtn);
        btnRow.appendChild(closeBtn);

        modal.appendChild(title);
        modal.appendChild(gameName);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    // Apply Fix function
    function applyFix(appid, downloadUrl, fixType, gameName, resultsOverlay) {
        try {
            // Close results overlay
            if (resultsOverlay) {
                resultsOverlay.remove();
            }
            
            // Check if we have the game install path
            if (!window.__LuaToolsGameInstallPath) {
                const msg = lt('Game install path not found');
                try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                return;
            }
            
            backendLog('LuaTools: Applying fix ' + fixType + ' for appid ' + appid);
            
            // Start the download and extraction process
            Millennium.callServerMethod('luatools', 'ApplyGameFix', { 
                appid: appid, 
                downloadUrl: downloadUrl, 
                installPath: window.__LuaToolsGameInstallPath,
                fixType: fixType,
                gameName: gameName || '',
                contentScriptQuery: '' 
            }).then(function(res){
                try {
                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                    if (payload && payload.success) {
                        // Show download progress popup similar to Add via LuaTools
                        showFixDownloadProgress(appid, fixType);
                    } else {
                        const errorKey = (payload && payload.error) ? String(payload.error) : '';
                        const errorMsg = (errorKey && (errorKey.startsWith('menu.error.') || errorKey.startsWith('common.'))) ? t(errorKey) : (errorKey || lt('Failed to start fix download'));
                        try { ShowAlertDialog && ShowAlertDialog('LuaTools', errorMsg); } catch(_) { alert(errorMsg); }
                    }
                } catch(err) {
                    backendLog('LuaTools: ApplyGameFix response error: ' + err);
                    const msg = lt('Error applying fix');
                    try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                }
            }).catch(function(err){
                backendLog('LuaTools: ApplyGameFix error: ' + err);
                const msg = lt('Error applying fix');
                try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
            });
        } catch(err) {
            backendLog('LuaTools: applyFix error: ' + err);
        }
    }

    // Show fix download progress popup
    function showFixDownloadProgress(appid, fixType) {
        // Reuse the download popup UI from Add via LuaTools
        if (document.querySelector('.luatools-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('Applying {fix}').replace('{fix}', fixType);

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';
        body.innerHTML = '<div id="lt-fix-progress-msg">' + lt('Downloading...') + '</div>';

        const btnRow = document.createElement('div');
        btnRow.className = 'lt-fix-btn-row';
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
        const hideBtn = document.createElement('a');
        hideBtn.className = 'btnv6_blue_hoverfade btn_medium';
        hideBtn.innerHTML = '<span>' + lt('Hide') + '</span>';
        hideBtn.href = '#';
        hideBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); };
        btnRow.appendChild(hideBtn);

        const cancelBtn = document.createElement('a');
        cancelBtn.className = 'btnv6_blue_hoverfade btn_medium';
        cancelBtn.innerHTML = '<span>' + lt('Cancel') + '</span>';
        cancelBtn.href = '#';
        cancelBtn.onclick = function(e){
            e.preventDefault();
            if (cancelBtn.dataset.pending === '1') return;
            cancelBtn.dataset.pending = '1';
            const span = cancelBtn.querySelector('span');
            if (span) span.textContent = lt('Cancelling...');
            const msgEl = document.getElementById('lt-fix-progress-msg');
            if (msgEl) msgEl.textContent = lt('Cancelling...');
            Millennium.callServerMethod('luatools', 'CancelApplyFix', { appid: appid, contentScriptQuery: '' }).then(function(res){
                try {
                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                    if (!payload || payload.success !== true) {
                        throw new Error((payload && payload.error) || lt('Cancellation failed'));
                    }
                } catch(err) {
                    cancelBtn.dataset.pending = '0';
                    if (span) span.textContent = lt('Cancel');
                    const msgEl2 = document.getElementById('lt-fix-progress-msg');
                    if (msgEl2 && msgEl2.dataset.last) msgEl2.textContent = msgEl2.dataset.last;
                    backendLog('LuaTools: CancelApplyFix response error: ' + err);
                    const msg = lt('Failed to cancel fix download');
                    try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                }
            }).catch(function(err){
                cancelBtn.dataset.pending = '0';
                const span2 = cancelBtn.querySelector('span');
                if (span2) span2.textContent = lt('Cancel');
                const msgEl2 = document.getElementById('lt-fix-progress-msg');
                if (msgEl2 && msgEl2.dataset.last) msgEl2.textContent = msgEl2.dataset.last;
                backendLog('LuaTools: CancelApplyFix error: ' + err);
                const msg = lt('Failed to cancel fix download');
                try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
            });
        };
        btnRow.appendChild(cancelBtn);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Start polling for progress
        pollFixProgress(appid, fixType);
    }

    function replaceFixButtonsWithClose(overlayEl) {
        if (!overlayEl) return;
        const btnRow = overlayEl.querySelector('.lt-fix-btn-row');
        if (!btnRow) return;
        btnRow.innerHTML = '';
        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
        closeBtn.href = '#';
        closeBtn.onclick = function(e){ e.preventDefault(); overlayEl.remove(); };
        btnRow.appendChild(closeBtn);
    }

    // Poll fix download and extraction progress
    function pollFixProgress(appid, fixType) {
        const poll = function() {
            try {
                const overlayEl = document.querySelector('.luatools-overlay');
                if (!overlayEl) return; // Stop if overlay was closed
                
                Millennium.callServerMethod('luatools', 'GetApplyFixStatus', { appid: appid, contentScriptQuery: '' }).then(function(res){
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        if (payload && payload.success && payload.state) {
                            const state = payload.state;
                            const msgEl = document.getElementById('lt-fix-progress-msg');
                            
                            if (state.status === 'downloading') {
                                const pct = state.totalBytes > 0 ? Math.floor((state.bytesRead / state.totalBytes) * 100) : 0;
                                if (msgEl) { msgEl.textContent = lt('Downloading: {percent}%').replace('{percent}', pct); msgEl.dataset.last = msgEl.textContent; }
                                setTimeout(poll, 500);
                            } else if (state.status === 'extracting') {
                                if (msgEl) { msgEl.textContent = lt('Extracting to game folder...'); msgEl.dataset.last = msgEl.textContent; }
                                setTimeout(poll, 500);
                            } else if (state.status === 'cancelled') {
                                if (msgEl) msgEl.textContent = lt('Cancelled: {reason}').replace('{reason}', state.error || lt('Cancelled by user'));
                                replaceFixButtonsWithClose(overlayEl);
                                return;
                            } else if (state.status === 'done') {
                                if (msgEl) msgEl.textContent = lt('{fix} applied successfully!').replace('{fix}', fixType);
                                replaceFixButtonsWithClose(overlayEl);
                                return; // Stop polling
                            } else if (state.status === 'failed') {
                                if (msgEl) msgEl.textContent = lt('Failed: {error}').replace('{error}', state.error || lt('Unknown error'));
                                replaceFixButtonsWithClose(overlayEl);
                                return; // Stop polling
                            } else {
                                // Continue polling for unknown states
                                setTimeout(poll, 500);
                            }
                        }
                    } catch(err) {
                        backendLog('LuaTools: GetApplyFixStatus error: ' + err);
                    }
                });
            } catch(err) {
                backendLog('LuaTools: pollFixProgress error: ' + err);
            }
        };
        setTimeout(poll, 500);
    }

    // Show un-fix progress popup
    function showUnfixProgress(appid) {
        // Remove any existing popup
        try { const old = document.querySelector('.luatools-unfix-overlay'); if (old) old.remove(); } catch(_) {}
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-unfix-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('Un-Fixing game');

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';
        body.innerHTML = '<div id="lt-unfix-progress-msg">' + lt('Removing fix files...') + '</div>';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
        const hideBtn = document.createElement('a');
        hideBtn.className = 'btnv6_blue_hoverfade btn_medium';
        hideBtn.innerHTML = '<span>' + lt('Hide') + '</span>';
        hideBtn.href = '#';
        hideBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); };
        btnRow.appendChild(hideBtn);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Start polling for progress
        pollUnfixProgress(appid);
    }

    // Poll un-fix progress
    function pollUnfixProgress(appid) {
        const poll = function() {
            try {
                const overlayEl = document.querySelector('.luatools-unfix-overlay');
                if (!overlayEl) return; // Stop if overlay was closed
                
                Millennium.callServerMethod('luatools', 'GetUnfixStatus', { appid: appid, contentScriptQuery: '' }).then(function(res){
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        if (payload && payload.success && payload.state) {
                            const state = payload.state;
                            const msgEl = document.getElementById('lt-unfix-progress-msg');
                            
                            if (state.status === 'removing') {
                                if (msgEl) msgEl.textContent = state.progress || lt('Removing fix files...');
                                // Continue polling
                                setTimeout(poll, 500);
                            } else if (state.status === 'done') {
                                const filesRemoved = state.filesRemoved || 0;
                                if (msgEl) msgEl.textContent = lt('Removed {count} files. Running Steam verification...').replace('{count}', filesRemoved);
                                // Change Hide button to Close button
                                try {
                                    const btnRow = overlayEl.querySelector('div[style*="justify-content:flex-end"]');
                                    if (btnRow) {
                                        btnRow.innerHTML = '';
                                        const closeBtn = document.createElement('a');
                                        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
                                        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
                                        closeBtn.href = '#';
                                        closeBtn.onclick = function(e){ e.preventDefault(); overlayEl.remove(); };
                                        btnRow.appendChild(closeBtn);
                                    }
                                } catch(_) {}
                                
                                // Trigger Steam verification after a short delay
                                setTimeout(function(){
                                    try {
                                        const verifyUrl = 'steam://validate/' + appid;
                                        window.location.href = verifyUrl;
                                        backendLog('LuaTools: Running verify for appid ' + appid);
                                    } catch(_) {}
                                }, 1000);
                                
                                return; // Stop polling
                            } else if (state.status === 'failed') {
                                if (msgEl) msgEl.textContent = lt('Failed: {error}').replace('{error}', state.error || lt('Unknown error'));
                                // Change Hide button to Close button
                                try {
                                    const btnRow = overlayEl.querySelector('div[style*="justify-content:flex-end"]');
                                    if (btnRow) {
                                        btnRow.innerHTML = '';
        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
        closeBtn.href = '#';
                                        closeBtn.onclick = function(e){ e.preventDefault(); overlayEl.remove(); };
        btnRow.appendChild(closeBtn);
                                    }
                                } catch(_) {}
                                return; // Stop polling
                            } else {
                                // Continue polling for unknown states
                                setTimeout(poll, 500);
                            }
                        }
                    } catch(err) {
                        backendLog('LuaTools: GetUnfixStatus error: ' + err);
                    }
                });
            } catch(err) {
                backendLog('LuaTools: pollUnfixProgress error: ' + err);
            }
        };
        setTimeout(poll, 500);
    }

    // Fixes Menu popup
    function showFixesMenuPopup() {
        if (document.querySelector('.luatools-fixes-overlay')) return;
        // Close other popups if open so dialogs don't stack
        try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
        try { const s = document.querySelector('.luatools-settings-overlay'); if (s) s.remove(); } catch(_) {}
        try { const a = document.querySelector('.luatools-aio-overlay'); if (a) a.remove(); } catch(_) {}
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-fixes-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('LuaTools · Fixes Menu');

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';
        body.innerHTML = ''+
            '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center;">\n' +
            '  <a id="lt-fixes-look" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Look for Fixes</span></a>\n' +
            '  <a id="lt-fixes-aio" href="#" class="btnv6_blue_hoverfade btn_medium"><span>All-In-One Fixes</span></a>\n' +
            '  <a id="lt-fixes-unfix" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Un-Fix (verify game)</span></a>\n' +
            '</div>';
        const lookSpan = body.querySelector('#lt-fixes-look span');
        if (lookSpan) lookSpan.textContent = lt('Look for Fixes');
        const aioSpan = body.querySelector('#lt-fixes-aio span');
        if (aioSpan) aioSpan.textContent = lt('All-In-One Fixes');
        const unfixSpan = body.querySelector('#lt-fixes-unfix span');
        if (unfixSpan) unfixSpan.textContent = lt('Un-Fix (verify game)');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
        closeBtn.href = '#';
        closeBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); };
        btnRow.appendChild(closeBtn);
        
        // Wire up Fixes Menu buttons after modal is added to DOM
        setTimeout(function(){
            const lookBtn = overlay.querySelector('#lt-fixes-look');
            if (lookBtn) {
                lookBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    // Get current appid
                    try {
                        const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                        const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                        if (isNaN(appid)) {
                            const msg = lt('Could not determine game AppID');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            return;
                        }
                        // Close fixes menu and show loading popup
            overlay.remove();
                        showLoadingFixesPopup();
                        
                        // Track if request has completed to prevent animation from overwriting results
                        var requestComplete = false;
                        var animationTimers = [];
                        
                        // Simulate progressive updates for better UX (only if request hasn't completed yet)
                        animationTimers.push(setTimeout(function() {
                            if (!requestComplete && window.__updateLoadingStatus) {
                                window.__updateLoadingStatus('status-name', lt('Fetching game name...'), '🔄', '#c7d5e0');
                            }
                        }, 0));
                        animationTimers.push(setTimeout(function() {
                            if (!requestComplete && window.__updateLoadingStatus) {
                                window.__updateLoadingStatus('status-generic', lt('Checking generic fix...'), '🔄', '#c7d5e0');
                            }
                        }, 300));
                        animationTimers.push(setTimeout(function() {
                            if (!requestComplete && window.__updateLoadingStatus) {
                                window.__updateLoadingStatus('status-online', lt('Checking online-fix...'), '🔄', '#c7d5e0');
                            }
                        }, 600));
                        
                        // Call backend to check for fixes
                        Millennium.callServerMethod('luatools', 'CheckForFixes', { appid, contentScriptQuery: '' }).then(function(res){
                            try {
                                requestComplete = true;
                                // Clear any pending animation timers
                                animationTimers.forEach(function(t) { clearTimeout(t); });
                                
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                if (payload && payload.success) {
                                    // Update statuses based on results
                                    if (window.__updateLoadingStatus) {
                                        window.__updateLoadingStatus('status-name', payload.gameName || lt('Unknown Game'), '✅', '#a4d007');
                                        
                                        if (payload.genericFix && payload.genericFix.available) {
                                            window.__updateLoadingStatus('status-generic', lt('Generic fix found!'), '✅', '#a4d007');
                                        } else {
                                            window.__updateLoadingStatus('status-generic', lt('No generic fix'), '❌', '#8b8b8b');
                                        }
                                        
                                        if (payload.onlineFix && payload.onlineFix.available) {
                                            window.__updateLoadingStatus('status-online', lt('Online-fix found!'), '✅', '#a4d007');
                                        } else {
                                            window.__updateLoadingStatus('status-online', lt('No online-fix'), '❌', '#8b8b8b');
                                        }
                                    }
                                    
                                    // Show results immediately
                                    showFixesResultsPopup(payload);
                                } else {
                                    try { const l = document.querySelector('.luatools-loading-fixes-overlay'); if (l) l.remove(); } catch(_) {}
                                    const errText = (payload && payload.error) ? String(payload.error) : lt('Failed to check for fixes.');
                                    try { ShowAlertDialog && ShowAlertDialog('LuaTools', errText); } catch(_) { alert(errText); }
                                }
                            } catch(err) {
                                try { const l = document.querySelector('.luatools-loading-fixes-overlay'); if (l) l.remove(); } catch(_) {}
                                const msg = lt('Error checking for fixes');
                                try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            }
                        }).catch(function(err) {
                            requestComplete = true;
                            animationTimers.forEach(function(t) { clearTimeout(t); });
                            try { const l = document.querySelector('.luatools-loading-fixes-overlay'); if (l) l.remove(); } catch(_) {}
                            const msg = lt('Error checking for fixes');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                        });
                    } catch(err) {
                        backendLog('LuaTools: Look for Fixes error: ' + err);
                    }
                });
            }
            const aioBtn = overlay.querySelector('#lt-fixes-aio');
            if (aioBtn) {
                aioBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    showAioFixesMenuPopup();
                });
            }
            const unfixBtn = overlay.querySelector('#lt-fixes-unfix');
            if (unfixBtn) {
                unfixBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    // Get current appid
                    try {
                        const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                        const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                        if (isNaN(appid)) {
                            const msg = lt('Could not determine game AppID');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            return;
                        }
                        
                        // Check if we have the game install path (should have been set when Fixes Menu opened)
                        if (!window.__LuaToolsGameInstallPath) {
                            const msg = lt('Game install path not found');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            return;
                        }
                        
                        // Close the Fixes Menu popup before showing confirmation
                        try { overlay.remove(); } catch(_) {}
                        
                        // Show confirmation dialog
                        if (typeof ShowConfirmDialog === 'function') {
                            setTimeout(function(){
                                try {
                                    const p = ShowConfirmDialog('LuaTools', lt('Are you sure you want to un-fix? This will remove fix files and verify game files.'));
                                    if (p && typeof p.then === 'function') {
                                        p.then(function(){ 
                                            // User clicked OK - start un-fix process
                                            try {
                                                backendLog('LuaTools: Starting un-fix for appid ' + appid);
                                                Millennium.callServerMethod('luatools', 'UnFixGame', { 
                                                    appid: appid, 
                                                    installPath: window.__LuaToolsGameInstallPath,
                                                    contentScriptQuery: '' 
                                                }).then(function(res){
                                                    try {
                                                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                                        if (payload && payload.success) {
                                                            // Show progress popup
                                                            showUnfixProgress(appid);
                                                        } else {
                                                            const errorKey = (payload && payload.error) ? String(payload.error) : '';
                                                            const errorMsg = (errorKey && (errorKey.startsWith('menu.error.') || errorKey.startsWith('common.'))) ? t(errorKey) : (errorKey || lt('Failed to start un-fix'));
                                                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', errorMsg); } catch(_) { alert(errorMsg); }
                                                            // Don't reopen Fixes Menu - let user see the error
                                                        }
                                                    } catch(err) {
                                                        backendLog('LuaTools: UnFixGame response error: ' + err);
                                                    const msg = lt('Error starting un-fix');
                                                    try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                                                        // Don't reopen Fixes Menu - let user see the error
                                                    }
                                                }).catch(function(err){
                                                    backendLog('LuaTools: UnFixGame error: ' + err);
                                                const msg = lt('Error starting un-fix');
                                                try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                                                    // Don't reopen Fixes Menu - let user see the error
                                                });
                                            } catch(err) {
                                                backendLog('LuaTools: Un-Fix start error: ' + err);
                                            }
                                        }, function(){
                                            // User clicked Cancel - reopen Fixes Menu
                                            try { showFixesMenuPopup(); } catch(_) {}
                                        });
                                    }
                                } catch(_) {}
                            }, 0);
                        } else if (window.confirm(lt('Are you sure you want to un-fix? This will remove fix files and verify game files.'))) {
                            try {
                                backendLog('LuaTools: Starting un-fix for appid ' + appid);
                                Millennium.callServerMethod('luatools', 'UnFixGame', { 
                                    appid: appid, 
                                    installPath: window.__LuaToolsGameInstallPath,
                                    contentScriptQuery: '' 
                                }).then(function(res){
                                    try {
                                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                        if (payload && payload.success) {
                                            showUnfixProgress(appid);
                                        } else {
                                            const errorMsg = (payload && payload.error) ? String(payload.error) : lt('Failed to start un-fix');
                                            alert(errorMsg);
                                            // Don't reopen Fixes Menu - let user see the error
                                        }
                                    } catch(err) {
                                        backendLog('LuaTools: UnFixGame response error: ' + err);
                                        alert(lt('Error starting un-fix'));
                                        // Don't reopen Fixes Menu - let user see the error
                                    }
                                }).catch(function(err){
                                    backendLog('LuaTools: UnFixGame error: ' + err);
                                    alert(lt('Error starting un-fix'));
                                    // Don't reopen Fixes Menu - let user see the error
                                });
                            } catch(err) {
                                backendLog('LuaTools: Un-Fix start error: ' + err);
                            }
                        } else {
                            // User cancelled - reopen Fixes Menu
                            try { showFixesMenuPopup(); } catch(_) {}
                        }
                    } catch(err) {
                        backendLog('LuaTools: Un-Fix error: ' + err);
                    }
                });
            }
        }, 0);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    function fetchSettingsConfig(forceRefresh) {
        try {
            if (!forceRefresh && window.__LuaToolsSettings && Array.isArray(window.__LuaToolsSettings.schema)) {
                return Promise.resolve(window.__LuaToolsSettings);
            }
        } catch(_) {}

        if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
            return Promise.reject(new Error(lt('LuaTools backend unavailable')));
        }

        return Millennium.callServerMethod('luatools', 'GetSettingsConfig', { contentScriptQuery: '' }).then(function(res){
            const payload = typeof res === 'string' ? JSON.parse(res) : res;
            if (!payload || payload.success !== true) {
                const errorMsg = (payload && payload.error) ? String(payload.error) : t('settings.error', 'Failed to load settings.');
                throw new Error(errorMsg);
            }
            const config = {
                schemaVersion: payload.schemaVersion || 0,
                schema: Array.isArray(payload.schema) ? payload.schema : [],
                values: (payload && payload.values && typeof payload.values === 'object') ? payload.values : {},
                language: payload && payload.language ? String(payload.language) : 'en',
                locales: Array.isArray(payload && payload.locales) ? payload.locales : [],
                translations: (payload && payload.translations && typeof payload.translations === 'object') ? payload.translations : {},
                lastFetched: Date.now()
            };
            applyTranslationBundle({
                language: config.language,
                locales: config.locales,
                strings: config.translations
            });
            window.__LuaToolsSettings = config;
            return config;
        });
    }

    function initialiseSettingsDraft(config) {
        const values = JSON.parse(JSON.stringify((config && config.values) || {}));
        if (!config || !Array.isArray(config.schema)) {
            return values;
        }
        for (let i = 0; i < config.schema.length; i++) {
            const group = config.schema[i];
            if (!group || !group.key) continue;
            if (typeof values[group.key] !== 'object' || values[group.key] === null || Array.isArray(values[group.key])) {
                values[group.key] = {};
            }
            const options = Array.isArray(group.options) ? group.options : [];
            for (let j = 0; j < options.length; j++) {
                const option = options[j];
                if (!option || !option.key) continue;
                if (typeof values[group.key][option.key] === 'undefined') {
                    values[group.key][option.key] = option.default;
                }
            }
        }
        return values;
    }

    function showSettingsManagerPopup(forceRefresh) {
        if (document.querySelector('.luatools-settings-manager-overlay')) return;

        try { const mainOverlay = document.querySelector('.luatools-settings-overlay'); if (mainOverlay) mainOverlay.remove(); } catch(_) {}

        const overlay = document.createElement('div');
        overlay.className = 'luatools-settings-manager-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:420px;max-width:640px;max-height:80vh;display:flex;flex-direction:column;padding:18px 20px;box-shadow:0 10px 28px rgba(0,0,0,.65);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:12px;font-weight:600;';
        title.textContent = t('settings.title', 'LuaTools · Settings');

        const statusLine = document.createElement('div');
        statusLine.style.cssText = 'font-size:13px;margin-bottom:10px;color:#c7d5e0;min-height:18px;';

        const contentWrap = document.createElement('div');
        contentWrap.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding-right:6px;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';

        const refreshBtn = document.createElement('a');
        refreshBtn.className = 'btnv6_blue_hoverfade btn_medium';
        refreshBtn.innerHTML = '<span>' + t('settings.refresh', 'Refresh') + '</span>';
        refreshBtn.href = '#';

        const saveBtn = document.createElement('a');
        saveBtn.className = 'btnv6_blue_hoverfade btn_medium';
        saveBtn.innerHTML = '<span>' + t('settings.save', 'Save Settings') + '</span>';
        saveBtn.href = '#';
        saveBtn.dataset.disabled = '1';

        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + t('settings.close', 'Close') + '</span>';
        closeBtn.href = '#';

        btnRow.appendChild(refreshBtn);
        btnRow.appendChild(saveBtn);
        btnRow.appendChild(closeBtn);

        modal.appendChild(title);
        modal.appendChild(statusLine);
        modal.appendChild(contentWrap);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const state = {
            config: null,
            draft: {},
        };

        let refreshDefaultLabel = '';
        let saveDefaultLabel = '';
        let closeDefaultLabel = '';

        function applyStaticTranslations() {
            title.textContent = t('settings.title', 'LuaTools · Settings');
            refreshDefaultLabel = '<span>' + t('settings.refresh', 'Refresh') + '</span>';
            saveDefaultLabel = '<span>' + t('settings.save', 'Save Settings') + '</span>';
            closeDefaultLabel = '<span>' + t('settings.close', 'Close') + '</span>';
            refreshBtn.innerHTML = refreshDefaultLabel;
            saveBtn.innerHTML = saveDefaultLabel;
            closeBtn.innerHTML = closeDefaultLabel;
        }
        applyStaticTranslations();

        function setStatus(text, color) {
            statusLine.textContent = text || '';
            statusLine.style.color = color || '#c7d5e0';
        }

        function ensureDraftGroup(groupKey) {
            if (!state.draft[groupKey] || typeof state.draft[groupKey] !== 'object') {
                state.draft[groupKey] = {};
            }
            return state.draft[groupKey];
        }

        function collectChanges() {
            if (!state.config || !Array.isArray(state.config.schema)) {
                return {};
            }
            const changes = {};
            for (let i = 0; i < state.config.schema.length; i++) {
                const group = state.config.schema[i];
                if (!group || !group.key) continue;
                const options = Array.isArray(group.options) ? group.options : [];
                const draftGroup = state.draft[group.key] || {};
                const originalGroup = (state.config.values && state.config.values[group.key]) || {};
                const groupChanges = {};
                for (let j = 0; j < options.length; j++) {
                    const option = options[j];
                    if (!option || !option.key) continue;
                    const newValue = draftGroup.hasOwnProperty(option.key) ? draftGroup[option.key] : option.default;
                    const oldValue = originalGroup.hasOwnProperty(option.key) ? originalGroup[option.key] : option.default;
                    if (newValue !== oldValue) {
                        groupChanges[option.key] = newValue;
                    }
                }
                if (Object.keys(groupChanges).length > 0) {
                    changes[group.key] = groupChanges;
                }
            }
            return changes;
        }

        function updateSaveState() {
            const hasChanges = Object.keys(collectChanges()).length > 0;
            const isBusy = saveBtn.dataset.busy === '1';
            if (hasChanges && !isBusy) {
                saveBtn.dataset.disabled = '0';
                saveBtn.style.opacity = '';
            } else {
                saveBtn.dataset.disabled = '1';
                saveBtn.style.opacity = '0.6';
            }
        }

        function optionLabelKey(groupKey, optionKey) {
            if (groupKey === 'general') {
                if (optionKey === 'language') return 'settings.language.label';
                if (optionKey === 'donateKeys') return 'settings.donateKeys.label';
            }
            return null;
        }

        function optionDescriptionKey(groupKey, optionKey) {
            if (groupKey === 'general') {
                if (optionKey === 'language') return 'settings.language.description';
                if (optionKey === 'donateKeys') return 'settings.donateKeys.description';
            }
            return null;
        }

        function renderSettings() {
            contentWrap.innerHTML = '';
            if (!state.config || !Array.isArray(state.config.schema) || state.config.schema.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.style.cssText = 'padding:14px;background:#102039;border:1px solid #2a475e;border-radius:4px;color:#c7d5e0;';
                emptyState.textContent = t('settings.empty', 'No settings available yet.');
                contentWrap.appendChild(emptyState);
                updateSaveState();
                return;
            }

            for (let i = 0; i < state.config.schema.length; i++) {
                const group = state.config.schema[i];
                if (!group || !group.key) continue;

                const groupEl = document.createElement('div');
                groupEl.style.cssText = 'margin-bottom:18px;padding:14px;border:1px solid #2a475e;border-radius:4px;background:#0b141e;';

                const groupTitle = document.createElement('div');
                groupTitle.style.cssText = 'font-size:15px;font-weight:600;color:#66c0f4;';
                groupTitle.textContent = t('settings.' + group.key, group.label || group.key);
                groupEl.appendChild(groupTitle);

                if (group.description) {
                    const groupDesc = document.createElement('div');
                    groupDesc.style.cssText = 'margin-top:4px;font-size:13px;color:#c7d5e0;';
                    groupDesc.textContent = t('settings.' + group.key + 'Description', group.description);
                    groupEl.appendChild(groupDesc);
                }

                const options = Array.isArray(group.options) ? group.options : [];
                for (let j = 0; j < options.length; j++) {
                    const option = options[j];
                    if (!option || !option.key) continue;

                    ensureDraftGroup(group.key);
                    if (!state.draft[group.key].hasOwnProperty(option.key)) {
                        const sourceGroup = (state.config.values && state.config.values[group.key]) || {};
                        const initialValue = sourceGroup.hasOwnProperty(option.key) ? sourceGroup[option.key] : option.default;
                        state.draft[group.key][option.key] = initialValue;
                    }

                    const optionEl = document.createElement('div');
                    optionEl.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid rgba(102,192,244,0.1);';
                    if (j === 0) {
                        optionEl.style.borderTop = 'none';
                        optionEl.style.paddingTop = '8px';
                    }

                    const optionLabel = document.createElement('div');
                    optionLabel.style.cssText = 'font-size:14px;font-weight:500;';
                    const labelKey = optionLabelKey(group.key, option.key);
                    optionLabel.textContent = t(labelKey || ('settings.' + group.key + '.' + option.key + '.label'), option.label || option.key);
                    optionEl.appendChild(optionLabel);

                    if (option.description) {
                        const optionDesc = document.createElement('div');
                        optionDesc.style.cssText = 'margin-top:2px;font-size:12px;color:#a9b2c3;';
                        const descKey = optionDescriptionKey(group.key, option.key);
                        optionDesc.textContent = t(descKey || ('settings.' + group.key + '.' + option.key + '.description'), option.description);
                        optionEl.appendChild(optionDesc);
                    }

                    const controlWrap = document.createElement('div');
                    controlWrap.style.cssText = 'margin-top:8px;';

                    if (option.type === 'select') {
                        const selectEl = document.createElement('select');
                        selectEl.style.cssText = 'width:100%;padding:6px 8px;background:#16202d;color:#dfe6f0;border:1px solid #2a475e;border-radius:3px;';

                        const choices = Array.isArray(option.choices) ? option.choices : [];
                        for (let c = 0; c < choices.length; c++) {
                            const choice = choices[c];
                            if (!choice) continue;
                            const choiceOption = document.createElement('option');
                            choiceOption.value = String(choice.value);
                            choiceOption.textContent = choice.label || choice.value;
                            selectEl.appendChild(choiceOption);
                        }

                        const currentValue = state.draft[group.key][option.key];
                        if (typeof currentValue !== 'undefined') {
                            selectEl.value = String(currentValue);
                        }

                        selectEl.addEventListener('change', function(){
                            state.draft[group.key][option.key] = selectEl.value;
                            try { backendLog('LuaTools: language select changed to ' + selectEl.value); } catch(_) {}
                            updateSaveState();
                            setStatus(t('settings.unsaved', 'Unsaved changes'), '#c7d5e0');
                        });

                        controlWrap.appendChild(selectEl);
                    } else if (option.type === 'toggle') {
                        const toggleWrap = document.createElement('div');
                        toggleWrap.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

                        let yesLabel = option.metadata && option.metadata.yesLabel ? String(option.metadata.yesLabel) : 'Yes';
                        let noLabel = option.metadata && option.metadata.noLabel ? String(option.metadata.noLabel) : 'No';
                        if (group.key === 'general' && option.key === 'donateKeys') {
                            yesLabel = t('settings.donateKeys.yes', yesLabel);
                            noLabel = t('settings.donateKeys.no', noLabel);
                        }

                        const yesBtn = document.createElement('a');
                        yesBtn.className = 'btnv6_blue_hoverfade btn_small';
                        yesBtn.href = '#';
                        yesBtn.innerHTML = '<span>' + yesLabel + '</span>';

                        const noBtn = document.createElement('a');
                        noBtn.className = 'btnv6_blue_hoverfade btn_small';
                        noBtn.href = '#';
                        noBtn.innerHTML = '<span>' + noLabel + '</span>';

                        const yesSpan = yesBtn.querySelector('span');
                        const noSpan = noBtn.querySelector('span');

                        function refreshToggleButtons() {
                            const currentValue = state.draft[group.key][option.key] === true;
                            if (currentValue) {
                                yesBtn.style.background = '#66c0f4';
                                yesBtn.style.color = '#0b141e';
                                if (yesSpan) yesSpan.style.color = '#0b141e';
                                noBtn.style.background = '';
                                noBtn.style.color = '';
                                if (noSpan) noSpan.style.color = '';
                            } else {
                                noBtn.style.background = '#66c0f4';
                                noBtn.style.color = '#0b141e';
                                if (noSpan) noSpan.style.color = '#0b141e';
                                yesBtn.style.background = '';
                                yesBtn.style.color = '';
                                if (yesSpan) yesSpan.style.color = '';
                            }
                        }

                        yesBtn.addEventListener('click', function(e){
                            e.preventDefault();
                            state.draft[group.key][option.key] = true;
                            refreshToggleButtons();
                            updateSaveState();
                            setStatus(t('settings.unsaved', 'Unsaved changes'), '#c7d5e0');
                        });

                        noBtn.addEventListener('click', function(e){
                            e.preventDefault();
                            state.draft[group.key][option.key] = false;
                            refreshToggleButtons();
                            updateSaveState();
                            setStatus(t('settings.unsaved', 'Unsaved changes'), '#c7d5e0');
                        });

                        toggleWrap.appendChild(yesBtn);
                        toggleWrap.appendChild(noBtn);
                        controlWrap.appendChild(toggleWrap);
                        refreshToggleButtons();
                    } else {
                        const unsupported = document.createElement('div');
                        unsupported.style.cssText = 'font-size:12px;color:#ffb347;';
                        unsupported.textContent = lt('common.error.unsupportedOption').replace('{type}', option.type);
                        controlWrap.appendChild(unsupported);
                    }

                    optionEl.appendChild(controlWrap);
                    groupEl.appendChild(optionEl);
                }

                contentWrap.appendChild(groupEl);
            }

            updateSaveState();
        }

        function handleLoad(force) {
            setStatus(t('settings.loading', 'Loading settings...'), '#c7d5e0');
            saveBtn.dataset.disabled = '1';
            saveBtn.style.opacity = '0.6';
            contentWrap.innerHTML = '<div style="padding:20px;color:#c7d5e0;">' + t('common.status.loading', 'Loading...') + '</div>';

            return fetchSettingsConfig(force).then(function(config){
                state.config = {
                    schemaVersion: config.schemaVersion,
                    schema: Array.isArray(config.schema) ? config.schema : [],
                    values: initialiseSettingsDraft(config),
                    language: config.language,
                    locales: config.locales,
                };
                state.draft = initialiseSettingsDraft(config);
                applyStaticTranslations();
                renderSettings();
                setStatus('', '#c7d5e0');
            }).catch(function(err){
                const message = err && err.message ? err.message : t('settings.error', 'Failed to load settings.');
                contentWrap.innerHTML = '<div style="padding:20px;color:#ff5c5c;">' + message + '</div>';
                setStatus(t('common.status.error', 'Error') + ': ' + message, '#ff5c5c');
            });
        }

        refreshBtn.addEventListener('click', function(e){
            e.preventDefault();
            if (refreshBtn.dataset.busy === '1') return;
            refreshBtn.dataset.busy = '1';
            const refreshingLabel = '<span>' + t('settings.refreshing', 'Refreshing...') + '</span>';
            refreshBtn.innerHTML = refreshingLabel;
            handleLoad(true).finally(function(){
                refreshBtn.dataset.busy = '0';
                applyStaticTranslations();
            });
        });

        saveBtn.addEventListener('click', function(e){
            e.preventDefault();
            if (saveBtn.dataset.disabled === '1' || saveBtn.dataset.busy === '1') return;

            const changes = collectChanges();
            try { backendLog('LuaTools: collectChanges payload ' + JSON.stringify(changes)); } catch(_) {}
            if (!changes || Object.keys(changes).length === 0) {
                setStatus(t('settings.noChanges', 'No changes to save.'), '#c7d5e0');
                updateSaveState();
                return;
            }

            saveBtn.dataset.busy = '1';
            const savingLabel = '<span>' + t('settings.saving', 'Saving...') + '</span>';
            saveBtn.innerHTML = savingLabel;
            setStatus(t('settings.saving', 'Saving...'), '#c7d5e0');
            saveBtn.style.opacity = '0.6';

            const payloadToSend = JSON.parse(JSON.stringify(changes));
            try { backendLog('LuaTools: sending settings payload ' + JSON.stringify(payloadToSend)); } catch(_) {}
            // Pass flattened keys so Millennium handles the RPC arguments as expected.
            Millennium.callServerMethod('luatools', 'ApplySettingsChanges', {
                contentScriptQuery: '',
                changesJson: JSON.stringify(payloadToSend)
            }).then(function(res){
                const response = typeof res === 'string' ? JSON.parse(res) : res;
                if (!response || response.success !== true) {
                    if (response && response.errors) {
                        const errorParts = [];
                        for (const groupKey in response.errors) {
                            if (!Object.prototype.hasOwnProperty.call(response.errors, groupKey)) continue;
                            const optionErrors = response.errors[groupKey];
                            for (const optionKey in optionErrors) {
                                if (!Object.prototype.hasOwnProperty.call(optionErrors, optionKey)) continue;
                                const errorMsg = optionErrors[optionKey];
                                errorParts.push(groupKey + '.' + optionKey + ': ' + errorMsg);
                            }
                        }
                        const errText = errorParts.length ? errorParts.join('\n') : 'Validation failed.';
                        setStatus(errText, '#ff5c5c');
                    } else {
                        const message = (response && response.error) ? response.error : t('settings.saveError', 'Failed to save settings.');
                        setStatus(message, '#ff5c5c');
                    }
                    return;
                }

                const newValues = (response && response.values && typeof response.values === 'object') ? response.values : state.draft;
                state.config.values = initialiseSettingsDraft({ schema: state.config.schema, values: newValues });
                state.draft = initialiseSettingsDraft({ schema: state.config.schema, values: newValues });

                try {
                    if (window.__LuaToolsSettings) {
                        window.__LuaToolsSettings.values = JSON.parse(JSON.stringify(state.config.values));
                        window.__LuaToolsSettings.schemaVersion = state.config.schemaVersion;
                        window.__LuaToolsSettings.lastFetched = Date.now();
                        if (response && response.translations && typeof response.translations === 'object') {
                            window.__LuaToolsSettings.translations = response.translations;
                        }
                        if (response && response.language) {
                            window.__LuaToolsSettings.language = response.language;
                        }
                    }
                } catch(_) {}

                if (response && response.translations && typeof response.translations === 'object') {
                    applyTranslationBundle({
                        language: response.language || (window.__LuaToolsI18n && window.__LuaToolsI18n.language) || 'en',
                        locales: (window.__LuaToolsI18n && window.__LuaToolsI18n.locales) || (state.config && state.config.locales) || [],
                        strings: response.translations
                    });
                    applyStaticTranslations();
                    updateButtonTranslations();
                }

                renderSettings();
                setStatus(t('settings.saveSuccess', 'Settings saved successfully.'), '#8bc34a');
            }).catch(function(err){
                const message = err && err.message ? err.message : t('settings.saveError', 'Failed to save settings.');
                setStatus(message, '#ff5c5c');
            }).finally(function(){
                saveBtn.dataset.busy = '0';
                applyStaticTranslations();
                updateSaveState();
            });
        });

        closeBtn.addEventListener('click', function(e){
            e.preventDefault();
            overlay.remove();
        });

        overlay.addEventListener('click', function(e){
            if (e.target === overlay) {
            overlay.remove();
        }
        });

        handleLoad(!!forceRefresh);
    }

    // Main LuaTools menu popup
    function _legacyShowSettingsPopup() {
        if (document.querySelector('.luatools-settings-overlay')) return;
        // Close the download/progress popup if open so dialogs don't stack
        try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
        const overlay = document.createElement('div');
        overlay.className = 'luatools-settings-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('LuaTools · Menu');

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';
        body.innerHTML = ''+
            '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center;">\n' +
            '  <div style="font-size:13px;color:#8b8b8b;margin-top:4px;margin-bottom:-6px;font-weight:500;">Join the Discord!</div>\n' +
            '  <a id="lt-settings-discord" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Discord</span></a>\n' +
            '  <div style="font-size:13px;color:#8b8b8b;margin-top:8px;margin-bottom:-6px;font-weight:500;">Manage Game</div>\n' +
            '  <a id="lt-settings-remove-lua" href="#" class="btnv6_blue_hoverfade btn_medium" style="display:none;"><span>Remove via LuaTools</span></a>\n' +
            '  <a id="lt-settings-fixes-menu" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Fixes Menu</span></a>\n' +
            '  <div style="font-size:13px;color:#8b8b8b;margin-top:8px;margin-bottom:-6px;font-weight:500;">Advanced</div>\n' +
            '  <a id="lt-settings-check" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Check For Updates</span></a>\n' +
            '  <a id="lt-settings-fetch-apis" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Fetch Free API\'s</span></a>\n' +
            '  <a id="lt-settings-open-manager" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Settings</span></a>\n' +
            '</div>';
        const containerDiv = body.querySelector('div');
        if (containerDiv) {
            const groupLabels = containerDiv.querySelectorAll(':scope > div');
            if (groupLabels[0]) groupLabels[0].textContent = lt('Join the Discord!');
            if (groupLabels[1]) groupLabels[1].textContent = lt('Manage Game');
            if (groupLabels[2]) groupLabels[2].textContent = lt('Advanced');
        }
        const discordSpan = body.querySelector('#lt-settings-discord span');
        if (discordSpan) discordSpan.textContent = lt('Discord');
        const removeSpan = body.querySelector('#lt-settings-remove-lua span');
        if (removeSpan) removeSpan.textContent = lt('Remove via LuaTools');
        const fixesSpan = body.querySelector('#lt-settings-fixes-menu span');
        if (fixesSpan) fixesSpan.textContent = lt('Fixes Menu');
        const checkSpan = body.querySelector('#lt-settings-check span');
        if (checkSpan) checkSpan.textContent = lt('Check for updates');
        const fetchSpan = body.querySelector('#lt-settings-fetch-apis span');
        if (fetchSpan) fetchSpan.textContent = lt("Fetch Free API's");
        const settingsSpan = body.querySelector('#lt-settings-open-manager span');
        if (settingsSpan) settingsSpan.textContent = lt('Settings');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
        closeBtn.href = '#';
        closeBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); };
        btnRow.appendChild(closeBtn);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Wire settings
        // (Auto-update is always on; only actions remain)

        const checkBtn = overlay.querySelector('#lt-settings-check');
        if (checkBtn) {
            checkBtn.addEventListener('click', function(e){
                e.preventDefault();
                // Close settings first so any dialog appears on top
                try { overlay.remove(); } catch(_) {}
                try {
                    Millennium.callServerMethod('luatools', 'CheckForUpdatesNow', { contentScriptQuery: '' }).then(function(res){
                        try {
                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                            const msg = (payload && payload.message) ? String(payload.message) : 'No updates available.';
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                        } catch(_) {}
                    });
                } catch(_) {}
            });
        }

        const discordBtn = overlay.querySelector('#lt-settings-discord');
        if (discordBtn) {
            discordBtn.addEventListener('click', function(e){
                e.preventDefault();
                try { overlay.remove(); } catch(_) {}
                const url = 'https://discord.gg/luatools';
                try {
                    Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url, contentScriptQuery: '' });
                } catch(_) {}
            });
        }

        const fetchApisBtn = overlay.querySelector('#lt-settings-fetch-apis');
        if (fetchApisBtn) {
            fetchApisBtn.addEventListener('click', function(e){
                e.preventDefault();
                // Close settings first so any dialog appears on top
                try { overlay.remove(); } catch(_) {}
                try {
                    Millennium.callServerMethod('luatools', 'FetchFreeApisNow', { contentScriptQuery: '' }).then(function(res){
                        try {
                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                            const ok = payload && payload.success;
                            const count = payload && payload.count;
                            const successText = lt('Loaded free APIs: {count}').replace('{count}', (count != null ? count : '?'));
                            const failText = (payload && payload.error) ? String(payload.error) : lt('Failed to load free APIs.');
                            const text = ok ? successText : failText;
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', text); } catch(_) { alert(text); }
                        } catch(_) {}
                    });
                } catch(_) {}
            });
        }

        const settingsManagerBtn = overlay.querySelector('#lt-settings-open-manager');
        if (settingsManagerBtn) {
            settingsManagerBtn.addEventListener('click', function(e){
                e.preventDefault();
                try { overlay.remove(); } catch(_) {}
                showSettingsManagerPopup(false);
            });
        }

        const fixesMenuBtn = overlay.querySelector('#lt-settings-fixes-menu');
        if (fixesMenuBtn) {
            fixesMenuBtn.addEventListener('click', function(e){
                e.preventDefault();
                // Get current appid
                try {
                    const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                    const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                    if (isNaN(appid)) {
                        try { overlay.remove(); } catch(_) {}
                        const msg = lt('Could not determine game AppID');
                        try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                        return;
                    }
                    
                    // First, check if game is installed and get install path
                    Millennium.callServerMethod('luatools', 'GetGameInstallPath', { appid, contentScriptQuery: '' }).then(function(pathRes){
                        try {
                            const pathPayload = typeof pathRes === 'string' ? JSON.parse(pathRes) : pathRes;
                            if (!pathPayload || !pathPayload.success) {
                                // Game not installed or error - close menu and show error
                                try { overlay.remove(); } catch(_) {}
                            const errorKey = (pathPayload && pathPayload.error) ? String(pathPayload.error) : 'menu.error.noInstall';
                            const errorMsg = (errorKey.startsWith('menu.error.') || errorKey.startsWith('common.')) ? t(errorKey) : errorKey;
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', errorMsg); } catch(_) { alert(errorMsg); }
                                return;
                            }
                            
                            // Game is installed, store the install path and continue
                            window.__LuaToolsGameInstallPath = pathPayload.installPath;
                            
                            // Close settings first so fixes menu appears on top
                            try { overlay.remove(); } catch(_) {}
                            showFixesMenuPopup();
                        } catch(err) {
                            backendLog('LuaTools: GetGameInstallPath error: ' + err);
                            try { overlay.remove(); } catch(_) {}
                        }
                    }).catch(function(err) {
                        try { overlay.remove(); } catch(_) {}
                        const msg = lt('Error getting game path');
                        try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                    });
                } catch(err) {
                    backendLog('LuaTools: Fixes Menu button error: ' + err);
                }
            });
        }

        // Determine current appid and whether Lua exists; toggle remove button
        try {
            const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
            const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
            const removeBtn = overlay.querySelector('#lt-settings-remove-lua');
            if (!isNaN(appid) && removeBtn && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                Millennium.callServerMethod('luatools', 'HasLuaToolsForApp', { appid, contentScriptQuery: '' }).then(function(res){
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        const exists = !!(payload && payload.success && payload.exists === true);
                        removeBtn.style.display = exists ? '' : 'none';
                        if (exists) {
                            removeBtn.onclick = function(e){
                                e.preventDefault();
                                // Force close all settings overlays so confirm is visible
                                closeSettingsOverlay();
                                const reopen = function(){ try { showSettingsPopup(); } catch(_) {} };
                                const confirmMessage = t('menu.remove.confirm', 'Remove via LuaTools for this game?');
                                showLuaToolsConfirm('LuaTools', confirmMessage, function(){
                                    doDelete();
                                }, function(){
                                    reopen();
                                });
                            };
                            function doDelete(){
                                try {
                                    Millennium.callServerMethod('luatools', 'DeleteLuaToolsForApp', { appid, contentScriptQuery: '' }).then(function(){
                                        // Refresh presence and buttons: clear flags and try insertion again
                                        try {
                                            window.__LuaToolsButtonInserted = false;
                                            window.__LuaToolsPresenceCheckInFlight = false;
                                            window.__LuaToolsPresenceCheckAppId = undefined;
                                            addLuaToolsButton();
                                        } catch(_) {}
                                    });
                                } catch(_) {}
                            }
                        }
                    } catch(_) {}
                });
            }
        } catch(_) {}
    }

    // Force-close any open settings overlays to avoid stacking
    function closeSettingsOverlay() {
        try {
            // Remove all settings overlays (robust against older NodeList forEach support)
            var list = document.getElementsByClassName('luatools-settings-overlay');
            while (list && list.length > 0) {
                try { list[0].remove(); } catch(_) { break; }
            }
            // Also remove any download/progress overlays if present
            var list2 = document.getElementsByClassName('luatools-overlay');
            while (list2 && list2.length > 0) {
                try { list2[0].remove(); } catch(_) { break; }
            }
        } catch(_) {}
    }

    // Steam-style confirm helper (ShowConfirmDialog only)
    function showLuaToolsConfirm(title, message, onConfirm, onCancel) {
        // Always close settings popup first so the confirm is visible on top
        closeSettingsOverlay();
        try {
            if (typeof ShowConfirmDialog === 'function') {
                // Defer to next tick to ensure DOM removals take effect before showing dialog
                setTimeout(function(){
                    try {
                        const p = ShowConfirmDialog(String(title || 'LuaTools'), String(message || lt('Are you sure?')));
                        if (p && typeof p.then === 'function') {
                            p.then(function(){ try { onConfirm && onConfirm(); } catch(_) {} })
                             .catch(function(){ try { onCancel && onCancel(); } catch(_) {} });
                        }
                    } catch(_) {}
                }, 0);
                return;
            }
        } catch(_) {}
        // If not available, just cancel silently to avoid duplicate native prompts
        try { onCancel && onCancel(); } catch(_) {}
    }

    // Ensure consistent spacing for our buttons
    function ensureStyles() {
        if (!document.getElementById('luatools-styles')) {
            const style = document.createElement('style');
            style.id = 'luatools-styles';
            style.textContent = '.luatools-restart-button, .luatools-button, .luatools-icon-button{ margin-left:6px !important; }';
            document.head.appendChild(style);
        }
    }

    // Function to update button text with current translations
    function updateButtonTranslations() {
        try {
            // Update Restart Steam button
            const restartBtn = document.querySelector('.luatools-restart-button');
            if (restartBtn) {
                const restartText = lt('Restart Steam');
                restartBtn.title = restartText;
                restartBtn.setAttribute('data-tooltip-text', restartText);
                const rspan = restartBtn.querySelector('span');
                if (rspan) {
                    rspan.textContent = restartText;
                }
            }
            
            // Update Add via LuaTools button
            const luatoolsBtn = document.querySelector('.luatools-button');
            if (luatoolsBtn) {
                const addViaText = lt('Add via LuaTools');
                luatoolsBtn.title = addViaText;
                luatoolsBtn.setAttribute('data-tooltip-text', addViaText);
                const span = luatoolsBtn.querySelector('span');
                if (span) {
                    span.textContent = addViaText;
                }
            }
        } catch(err) {
            backendLog('LuaTools: updateButtonTranslations error: ' + err);
        }
    }

    // Function to add the LuaTools button
    function addLuaToolsButton() {
        // Track current URL to detect page changes
        const currentUrl = window.location.href;
        if (window.__LuaToolsLastUrl !== currentUrl) {
            // Page changed - reset button insertion flag and update translations
            window.__LuaToolsLastUrl = currentUrl;
            window.__LuaToolsButtonInserted = false;
            window.__LuaToolsRestartInserted = false;
            window.__LuaToolsIconInserted = false;
            window.__LuaToolsPresenceCheckInFlight = false;
            window.__LuaToolsPresenceCheckAppId = undefined;
            // Ensure translations are loaded and update existing buttons
            ensureTranslationsLoaded(false).then(function() {
                updateButtonTranslations();
            });
        }
        
        // Look for the SteamDB buttons container
        const steamdbContainer = document.querySelector('.steamdb-buttons') || 
                                document.querySelector('[data-steamdb-buttons]') ||
                                document.querySelector('.apphub_OtherSiteInfo');

        if (steamdbContainer) {
            // Always update translations for existing buttons (even if not a page change)
            const existingBtn = document.querySelector('.luatools-button');
            if (existingBtn) {
                ensureTranslationsLoaded(false).then(function() {
                    updateButtonTranslations();
                });
            }
            
            // Check if button already exists to avoid duplicates
            if (existingBtn || window.__LuaToolsButtonInserted) {
                if (!logState.existsOnce) { backendLog('LuaTools button already exists, skipping'); logState.existsOnce = true; }
                // Even if LuaTools exists, ensure Restart button is present and translations are updated
                return;
            }

            // Insert a Restart Steam button between Community Hub and our LuaTools button
            try {
                if (!document.querySelector('.luatools-restart-button') && !window.__LuaToolsRestartInserted) {
                    ensureStyles();
                    const referenceBtn = steamdbContainer.querySelector('a');
                    const restartBtn = document.createElement('a');
                    if (referenceBtn && referenceBtn.className) {
                        restartBtn.className = referenceBtn.className + ' luatools-restart-button';
                    } else {
                        restartBtn.className = 'btnv6_blue_hoverfade btn_medium luatools-restart-button';
                    }
                    restartBtn.href = '#';
                    const restartText = lt('Restart Steam');
                    restartBtn.title = restartText;
                    restartBtn.setAttribute('data-tooltip-text', restartText);
                    const rspan = document.createElement('span');
                    rspan.textContent = restartText;
                    restartBtn.appendChild(rspan);
                    // Normalize margins to match native buttons
                    try {
                        if (referenceBtn) {
                            const cs = window.getComputedStyle(referenceBtn);
                            restartBtn.style.marginLeft = cs.marginLeft;
                            restartBtn.style.marginRight = cs.marginRight;
                        }
                    } catch(_) {}

                    restartBtn.addEventListener('click', function(e){
                        e.preventDefault();
                        try {
                            // Ensure any settings overlays are closed before confirm
                            closeSettingsOverlay();
                            if (typeof ShowConfirmDialog === 'function') {
                                // ShowConfirmDialog(title, message) returns a promise when confirmed
                                const p = ShowConfirmDialog('LuaTools', lt('Restart Steam now?'));
                                if (p && typeof p.then === 'function') {
                                    p.then(function(){ try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {} });
                                }
                            } else {
                                if (window.confirm(lt('Restart Steam now?'))) { try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {} }
                            }
                        } catch(_) {
                            if (window.confirm(lt('Restart Steam now?'))) { try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {} }
                        }
                    });

                    if (referenceBtn && referenceBtn.parentElement) {
                        referenceBtn.after(restartBtn);
                    } else {
                        steamdbContainer.appendChild(restartBtn);
                    }
                    // Insert icon button right after Restart (only once)
                    try {
                        if (!document.querySelector('.luatools-icon-button') && !window.__LuaToolsIconInserted) {
                            const iconBtn = document.createElement('a');
                            if (referenceBtn && referenceBtn.className) {
                                iconBtn.className = referenceBtn.className + ' luatools-icon-button';
                            } else {
                                iconBtn.className = 'btnv6_blue_hoverfade btn_medium luatools-icon-button';
                            }
                            iconBtn.href = '#';
                            iconBtn.title = 'LuaTools Helper';
                            iconBtn.setAttribute('data-tooltip-text', 'LuaTools Helper');
                            // Normalize margins to match native buttons
                            try {
                                if (referenceBtn) {
                                    const cs = window.getComputedStyle(referenceBtn);
                                    iconBtn.style.marginLeft = cs.marginLeft;
                                    iconBtn.style.marginRight = cs.marginRight;
                                }
                            } catch(_) {}
                            const ispan = document.createElement('span');
                            const img = document.createElement('img');
                            img.alt = '';
                            img.style.height = '16px';
                            img.style.width = '16px';
                            img.style.verticalAlign = 'middle';
                            // Try to fetch data URL for the icon from backend to avoid path issues
                            try {
                                Millennium.callServerMethod('luatools', 'GetIconDataUrl', { contentScriptQuery: '' }).then(function(res){
                                    try {
                                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                        if (payload && payload.success && payload.dataUrl) {
                                            img.src = payload.dataUrl;
                                        } else {
                                            img.src = 'LuaTools/luatools-icon.png';
                                        }
                                    } catch(_) { img.src = 'LuaTools/luatools-icon.png'; }
                                });
                            } catch(_) {
                                img.src = 'LuaTools/luatools-icon.png';
                            }
                            // If image fails, fallback to inline SVG gear
                            img.onerror = function(){
                                ispan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.94 3.06l-2.12-.35a7.962 7.962 0 00-1.02-2.46l1.29-1.72a.75.75 0 00-.09-.97l-1.41-1.41a.75.75 0 00-.97-.09l-1.72 1.29c-.77-.44-1.6-.78-2.46-1.02L13.06 2.06A.75.75 0 0012.31 2h-1.62a.75.75 0 00-.75.65l-.35 2.12a7.962 7.962 0 00-2.46 1.02L5 4.6a.75.75 0 00-.97.09L2.62 6.1a.75.75 0 00-.09.97l1.29 1.72c-.44.77-.78 1.6-1.02 2.46l-2.12.35a.75.75 0 00-.65.75v1.62c0 .37.27.69.63.75l2.14.36c.24.86.58 1.69 1.02 2.46L2.53 18a.75.75 0 00.09.97l1.41 1.41c.26.26.67.29.97.09l1.72-1.29c.77.44 1.6.78 2.46 1.02l.35 2.12c.06.36.38.63.75.63h1.62c.37 0 .69-.27.75-.63l.36-2.14c.86-.24 1.69-.58 2.46-1.02l1.72 1.29c.3.2.71.17.97-.09l1.41-1.41c.26-.26.29-.67.09-.97l-1.29-1.72c.44-.77.78-1.6 1.02-2.46l2.12-.35c.36-.06.63-.38.63-.75v-1.62a.75.75 0 00-.65-.75z"/></svg>';
                            };
                            ispan.appendChild(img);
                            iconBtn.appendChild(ispan);
                            iconBtn.addEventListener('click', function(e){ e.preventDefault(); backendLog('LuaTools settings button clicked'); showSettingsPopup(); });
                            restartBtn.after(iconBtn);
                            window.__LuaToolsIconInserted = true;
                            backendLog('Inserted Icon button');
                        }
                    } catch(_) {}
                    window.__LuaToolsRestartInserted = true;
                    backendLog('Inserted Restart Steam button');
                }
            } catch(_) {}

            // If LuaTools button already existed, stop here
            if (document.querySelector('.luatools-button') || window.__LuaToolsButtonInserted) {
                return;
            }
            
            // Create the LuaTools button modeled after existing SteamDB/PCGW buttons
            let referenceBtn = steamdbContainer.querySelector('a');
            const luatoolsButton = document.createElement('a');
            luatoolsButton.href = '#';
            // Copy classes from an existing button to match look-and-feel, but set our own label
            if (referenceBtn && referenceBtn.className) {
                luatoolsButton.className = referenceBtn.className + ' luatools-button';
            } else {
                luatoolsButton.className = 'btnv6_blue_hoverfade btn_medium luatools-button';
            }
            const span = document.createElement('span');
            const addViaText = lt('Add via LuaTools');
            span.textContent = addViaText;
            luatoolsButton.appendChild(span);
            // Tooltip/title
            luatoolsButton.title = addViaText;
            luatoolsButton.setAttribute('data-tooltip-text', addViaText);
            // Normalize margins to match native buttons
            try {
                if (referenceBtn) {
                    const cs = window.getComputedStyle(referenceBtn);
                    luatoolsButton.style.marginLeft = cs.marginLeft;
                    luatoolsButton.style.marginRight = cs.marginRight;
                }
            } catch(_) {}
            
            // Local click handler suppressed; delegated handler manages actions
            luatoolsButton.addEventListener('click', function(e) {
                e.preventDefault();
                backendLog('LuaTools button clicked (delegated handler will process)');
            });
            
            // Before inserting, ask backend if LuaTools already exists for this appid
            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : NaN;
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    // prevent multiple concurrent checks
                    if (window.__LuaToolsPresenceCheckInFlight && window.__LuaToolsPresenceCheckAppId === appid) {
                        return;
                    }
                    window.__LuaToolsPresenceCheckInFlight = true;
                    window.__LuaToolsPresenceCheckAppId = appid;
                    window.__LuaToolsCurrentAppId = appid;
                    Millennium.callServerMethod('luatools', 'HasLuaToolsForApp', { appid, contentScriptQuery: '' }).then(function(res){
                        try {
                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                            if (payload && payload.success && payload.exists === true) {
                                backendLog('LuaTools already present for this app; not inserting button');
                                window.__LuaToolsPresenceCheckInFlight = false;
                                return; // do not insert
                            }
                            // Re-check in case another caller inserted during async
                            if (!document.querySelector('.luatools-button') && !window.__LuaToolsButtonInserted) {
                                const restartExisting = steamdbContainer.querySelector('.luatools-restart-button');
                                if (restartExisting && restartExisting.after) {
                                    restartExisting.after(luatoolsButton);
                                } else if (referenceBtn && referenceBtn.after) {
                                    referenceBtn.after(luatoolsButton);
                                } else {
                                    steamdbContainer.appendChild(luatoolsButton);
                                }
                                window.__LuaToolsButtonInserted = true;
                                backendLog('LuaTools button inserted');
                            }
                            window.__LuaToolsPresenceCheckInFlight = false;
                        } catch(_) {
                            if (!document.querySelector('.luatools-button') && !window.__LuaToolsButtonInserted) {
                                steamdbContainer.appendChild(luatoolsButton);
                                window.__LuaToolsButtonInserted = true;
                                backendLog('LuaTools button inserted');
                            }
                            window.__LuaToolsPresenceCheckInFlight = false;
                        }
                    });
                } else {
                    if (!document.querySelector('.luatools-button') && !window.__LuaToolsButtonInserted) {
                        const restartExisting = steamdbContainer.querySelector('.luatools-restart-button');
                        if (restartExisting && restartExisting.after) {
                            restartExisting.after(luatoolsButton);
                        } else if (referenceBtn && referenceBtn.after) {
                            referenceBtn.after(luatoolsButton);
                        } else {
                            steamdbContainer.appendChild(luatoolsButton);
                        }
                        window.__LuaToolsButtonInserted = true;
                        backendLog('LuaTools button inserted');
                    }
                }
            } catch(_) {
                if (!document.querySelector('.luatools-button') && !window.__LuaToolsButtonInserted) {
                    const restartExisting = steamdbContainer.querySelector('.luatools-restart-button');
                    if (restartExisting && restartExisting.after) {
                        restartExisting.after(luatoolsButton);
                    } else if (referenceBtn && referenceBtn.after) {
                        referenceBtn.after(luatoolsButton);
                    } else {
                        steamdbContainer.appendChild(luatoolsButton);
                    }
                    window.__LuaToolsButtonInserted = true;
                    backendLog('LuaTools button inserted');
                }
            }
        } else {
            if (!logState.missingOnce) { backendLog('LuaTools: steamdbContainer not found on this page'); logState.missingOnce = true; }
        }
    }
    
    // Try to add the button immediately if DOM is ready
    function onFrontendReady() {
        addLuaToolsButton();
        // Ask backend if there is a queued startup message from InitApis
        try {
            if (typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                Millennium.callServerMethod('luatools', 'GetInitApisMessage', { contentScriptQuery: '' }).then(function(res){
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        if (payload && payload.message) {
                            const msg = String(payload.message);
                            // Check if this is an update message (contains "update" or "restart")
                            const isUpdateMsg = msg.toLowerCase().includes('update') || msg.toLowerCase().includes('restart');
                            
                            if (isUpdateMsg && typeof ShowConfirmDialog === 'function') {
                                // For update messages, use confirm dialog with OK (restart) and Cancel options
                                const p = ShowConfirmDialog('LuaTools', msg);
                                if (p && typeof p.then === 'function') {
                                    p.then(function(){ 
                                        // User clicked OK - restart Steam
                                        try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {} 
                                    });
                                    // User clicked Cancel - do nothing (just closes dialog)
                                }
                            } else if (typeof ShowAlertDialog === 'function') {
                                // For non-update messages, use regular alert
                                ShowAlertDialog('LuaTools', msg);
                            } else {
                                backendLog('InitApis queued message: ' + msg);
                            }
                        }
                    } catch(_){ }
                });
                // Also show loaded apps list if present (only once per session)
                try {
                    if (!sessionStorage.getItem('LuaToolsLoadedAppsGate')) {
                        sessionStorage.setItem('LuaToolsLoadedAppsGate', '1');
                        Millennium.callServerMethod('luatools', 'ReadLoadedApps', { contentScriptQuery: '' }).then(function(res){
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                const apps = (payload && payload.success && Array.isArray(payload.apps)) ? payload.apps : [];
                                if (apps.length > 0) {
                                    showLoadedAppsPopup(apps);
                                }
                            } catch(_){ }
                        });
                    }
                } catch(_){ }
            }
        } catch(_) { }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onFrontendReady);
    } else {
        onFrontendReady();
    }
    
    // Delegate click handling in case the DOM is re-rendered and listeners are lost
    document.addEventListener('click', function(evt) {
        const anchor = evt.target && (evt.target.closest ? evt.target.closest('.luatools-button') : null);
        if (anchor) {
            evt.preventDefault();
            backendLog('LuaTools delegated click');
            // Use the same loading modal on delegated clicks
            if (!document.querySelector('.luatools-overlay')) {
                showTestPopup();
            }
            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : NaN;
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    if (runState.inProgress && runState.appid === appid) {
                        backendLog('LuaTools: operation already in progress for this appid');
                        return;
                    }
                    runState.inProgress = true;
                    runState.appid = appid;
                    Millennium.callServerMethod('luatools', 'StartAddViaLuaTools', { appid, contentScriptQuery: '' });
                    startPolling(appid);
                }
            } catch(_) {}
        }
    }, true);

    // Poll backend for progress and update progress bar and text
    function startPolling(appid){
        let done = false;
        const timer = setInterval(() => {
            if (done) { clearInterval(timer); return; }
            try {
                Millennium.callServerMethod('luatools', 'GetAddViaLuaToolsStatus', { appid, contentScriptQuery: '' }).then(function(res){
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        const st = payload && payload.state ? payload.state : {};
                        
                        // Try to find overlay (may or may not be visible)
                        const overlay = document.querySelector('.luatools-overlay');
                        const title = overlay ? overlay.querySelector('.luatools-title') : null;
                        const status = overlay ? overlay.querySelector('.luatools-status') : null;
                        const wrap = overlay ? overlay.querySelector('.luatools-progress-wrap') : null;
                        const percent = overlay ? overlay.querySelector('.luatools-percent') : null;
                        const bar = overlay ? overlay.querySelector('.luatools-progress-bar') : null;
                        
                        // Update UI if overlay is present
                        if (st.currentApi && title) title.textContent = lt('LuaTools · {api}').replace('{api}', st.currentApi);
                        if (status) {
                            if (st.status === 'checking') status.textContent = lt('Checking availability…');
                            if (st.status === 'downloading') status.textContent = lt('Downloading…');
                            if (st.status === 'processing') status.textContent = lt('Processing package…');
                            if (st.status === 'installing') status.textContent = lt('Installing…');
                            if (st.status === 'done') status.textContent = lt('Finishing…');
                            if (st.status === 'failed') status.textContent = lt('Failed');
                        }
                        if (st.status === 'downloading'){
                            // reveal progress UI on first download tick (if overlay visible)
                            if (wrap && wrap.style.display === 'none') wrap.style.display = 'block';
                            if (percent && percent.style.display === 'none') percent.style.display = 'block';
                            const total = st.totalBytes || 0; const read = st.bytesRead || 0;
                            let pct = total > 0 ? Math.floor((read/total)*100) : (read ? 1 : 0);
                            if (pct > 100) pct = 100; if (pct < 0) pct = 0;
                            if (bar) bar.style.width = pct + '%';
                            if (percent) percent.textContent = pct + '%';
                            // Show Cancel button during download
                            const cancelBtn = overlay ? overlay.querySelector('.luatools-cancel-btn') : null;
                            if (cancelBtn) cancelBtn.style.display = '';
                        }
                        if (st.status === 'done'){
                            // Update popup if visible
                            if (bar) bar.style.width = '100%';
                            if (percent) percent.textContent = '100%';
                            if (status) status.textContent = lt('Game added!');
                            // Hide Cancel button and update Hide to Close
                            const cancelBtn = overlay ? overlay.querySelector('.luatools-cancel-btn') : null;
                            if (cancelBtn) cancelBtn.style.display = 'none';
                            const hideBtn = overlay ? overlay.querySelector('.luatools-hide-btn') : null;
                            if (hideBtn) hideBtn.innerHTML = '<span>' + lt('Close') + '</span>';
                            // hide progress visuals after a short beat
                            if (wrap || percent) {
                            setTimeout(function(){ if (wrap) wrap.style.display = 'none'; if (percent) percent.style.display = 'none'; }, 300);
                            }
                            done = true; clearInterval(timer);
                            runState.inProgress = false; runState.appid = null;
                            // remove button since game is added (works even if popup is hidden)
                            const btnEl = document.querySelector('.luatools-button');
                            if (btnEl && btnEl.parentElement) {
                                btnEl.parentElement.removeChild(btnEl);
                            }
                        }
                        if (st.status === 'failed'){
                            // show error in the popup if visible
                            if (status) status.textContent = lt('Failed: {error}').replace('{error}', st.error || lt('Unknown error'));
                            // Hide Cancel button and update Hide to Close
                            const cancelBtn = overlay ? overlay.querySelector('.luatools-cancel-btn') : null;
                            if (cancelBtn) cancelBtn.style.display = 'none';
                            const hideBtn = overlay ? overlay.querySelector('.luatools-hide-btn') : null;
                            if (hideBtn) hideBtn.innerHTML = '<span>' + lt('Close') + '</span>';
                            if (wrap) wrap.style.display = 'none';
                            if (percent) percent.style.display = 'none';
                            done = true; clearInterval(timer);
                            runState.inProgress = false; runState.appid = null;
                        }
                    } catch(_){ }
                });
            } catch(_){ clearInterval(timer); }
        }, 300);
    }
    
    // Also try after a delay to catch dynamically loaded content
    setTimeout(addLuaToolsButton, 1000);
    setTimeout(addLuaToolsButton, 3000);
    
    // Listen for URL changes (Steam uses pushState for navigation)
    let lastUrl = window.location.href;
    function checkUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            // URL changed - reset flags and update buttons
            window.__LuaToolsButtonInserted = false;
            window.__LuaToolsRestartInserted = false;
            window.__LuaToolsIconInserted = false;
            window.__LuaToolsPresenceCheckInFlight = false;
            window.__LuaToolsPresenceCheckAppId = undefined;
            // Update translations and re-add buttons
            ensureTranslationsLoaded(false).then(function() {
                updateButtonTranslations();
                addLuaToolsButton();
            });
        }
    }
    // Check URL changes periodically and on popstate
    setInterval(checkUrlChange, 500);
    window.addEventListener('popstate', checkUrlChange);
    // Override pushState/replaceState to detect navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function() {
        originalPushState.apply(history, arguments);
        setTimeout(checkUrlChange, 100);
    };
    history.replaceState = function() {
        originalReplaceState.apply(history, arguments);
        setTimeout(checkUrlChange, 100);
    };
    
    // Use MutationObserver to catch dynamically added content
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Always update translations when DOM changes
                    updateButtonTranslations();
                    addLuaToolsButton();
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // All-in-one fixes menu popup
    function showAioFixesMenuPopup() {
        if (document.querySelector('.luatools-aio-overlay')) return;
        try { const f = document.querySelector('.luatools-fixes-overlay'); if (f) f.remove(); } catch(_) {}
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-aio-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:600px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('LuaTools · AIO Fixes Menu');

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';
        body.innerHTML = ''+
            '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:center;">\n' +
            '  <a id="lt-aio-online" href="#" class="btnv6_blue_hoverfade btn_medium"><span>Online Fix (Unsteam)</span></a>\n' +
            '</div>';
        const aioOnlineSpan = body.querySelector('#lt-aio-online span');
        if (aioOnlineSpan) aioOnlineSpan.textContent = lt('Online Fix (Unsteam)');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;';
        const backBtn = document.createElement('a');
        backBtn.className = 'btnv6_blue_hoverfade btn_medium';
        backBtn.innerHTML = '<span>' + lt('Back') + '</span>';
        backBtn.href = '#';
        backBtn.onclick = function(e){
            e.preventDefault();
            try { overlay.remove(); } catch(_) {}
            showFixesMenuPopup();
        };
        btnRow.appendChild(backBtn);

        const closeBtn = document.createElement('a');
        closeBtn.className = 'btnv6_blue_hoverfade btn_medium';
        closeBtn.innerHTML = '<span>' + lt('Close') + '</span>';
        closeBtn.href = '#';
        closeBtn.onclick = function(e){
            e.preventDefault();
            overlay.remove();
        };
        btnRow.appendChild(closeBtn);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(function(){
            const onlineBtn = overlay.querySelector('#lt-aio-online');
            if (onlineBtn) {
                onlineBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try {
                        const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                        const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                        if (isNaN(appid)) {
                            try { overlay.remove(); } catch(_) {}
                            const msg = lt('Could not determine game AppID');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            return;
                        }

                        if (!window.__LuaToolsGameInstallPath) {
                            try { overlay.remove(); } catch(_) {}
                            const msg = lt('Game install path not found');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                            return;
                        }

                        var gameName = '';
                        try {
                            var nameEl = document.querySelector('.apphub_AppName') || document.querySelector('.apphub_AppNameLeft') || document.querySelector('.page_title') || document.querySelector('[data-luatools-appname]');
                            if (nameEl && nameEl.textContent) {
                                gameName = String(nameEl.textContent).trim();
                            }
                        } catch(_) {}

                        try { overlay.remove(); } catch(_) {}

                        const downloadUrl = 'https://github.com/madoiscool/lt_api_links/releases/download/unsteam/Win64.zip';
                        applyFix(appid, downloadUrl, lt('Online Fix (Unsteam)'), gameName, null);
                    } catch(err) {
                        backendLog('LuaTools: AIO Online Fix error: ' + err);
                            try { overlay.remove(); } catch(_) {}
                            const msg = lt('Error starting Online Fix');
                            try { ShowAlertDialog && ShowAlertDialog('LuaTools', msg); } catch(_) { alert(msg); }
                    }
                });
            }
        }, 0);
    }

    function showLoadedAppsPopup(apps) {
        // Avoid duplicates
        if (document.querySelector('.luatools-loadedapps-overlay')) return;
        const overlay = document.createElement('div');
        overlay.className = 'luatools-loadedapps-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
        const modal = document.createElement('div');
        modal.style.cssText = 'background:#1b2838;color:#fff;border:1px solid #2a475e;border-radius:4px;min-width:360px;max-width:640px;padding:18px 20px;box-shadow:0 8px 24px rgba(0,0,0,.6);';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;color:#66c0f4;margin-bottom:10px;font-weight:600;';
        title.textContent = lt('LuaTools · Added Games');
        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;max-height:300px;overflow:auto;text-align:center;';
        if (apps && apps.length) {
            const list = document.createElement('div');
            apps.forEach(function(item){
                const a = document.createElement('a');
                a.href = 'steam://install/' + String(item.appid);
                a.textContent = String(item.name || item.appid);
                a.style.cssText = 'display:block;color:#c7d5e0;text-decoration:none;padding:6px 0;';
                a.onclick = function(e){ e.preventDefault(); try { window.location.href = a.href; } catch(_) {} };
                a.oncontextmenu = function(e){ e.preventDefault(); const url = 'https://steamdb.info/app/' + String(item.appid) + '/';
                    try { Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url, contentScriptQuery: '' }); } catch(_) {}
                };
                list.appendChild(a);
            });
            body.appendChild(list);
        } else {
            body.textContent = lt('No games found.');
        }
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:space-between;align-items:center;';
        const instructionText = document.createElement('div');
        instructionText.style.cssText = 'font-size:12px;color:#8f98a0;';
        instructionText.textContent = lt('Left click to install, Right click for SteamDB');
        const dismissBtn = document.createElement('a');
        dismissBtn.className = 'btnv6_blue_hoverfade btn_medium';
        dismissBtn.innerHTML = '<span>' + lt('Dismiss') + '</span>';
        dismissBtn.href = '#';
        dismissBtn.onclick = function(e){ e.preventDefault(); try { Millennium.callServerMethod('luatools', 'DismissLoadedApps', { contentScriptQuery: '' }); } catch(_) {} try { sessionStorage.setItem('LuaToolsLoadedAppsShown', '1'); } catch(_) {} overlay.remove(); };
        btnRow.appendChild(instructionText);
        btnRow.appendChild(dismissBtn);
        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }
})();


