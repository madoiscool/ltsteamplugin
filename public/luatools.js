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
    
    try {
        backendLog('LuaTools script loaded');
    } catch(e) {
        // Fallback if backendLog fails during initialization
        if (typeof console !== 'undefined' && console.log) {
            console.log('[LuaTools] Script loaded');
        }
    }
    
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

    function ensureLuaToolsStyles() {
        if (document.getElementById('luatools-styles')) return;
        try {
            const style = document.createElement('style');
            style.id = 'luatools-styles';
            style.textContent = `
                .luatools-btn {
                    padding: 12px 24px;
                    background: rgba(102,192,244,0.15);
                    border: 2px solid rgba(102,192,244,0.4);
                    border-radius: 12px;
                    color: #66c0f4;
                    font-size: 15px;
                    font-weight: 600;
                    text-decoration: none;
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    letter-spacing: 0.3px;
                }
                .luatools-btn:hover:not([data-disabled="1"]) {
                    background: rgba(102,192,244,0.25);
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(102,192,244,0.3);
                    border-color: #66c0f4;
                }
                .luatools-btn.primary {
                    background: linear-gradient(135deg, #66c0f4 0%, #4a9ece 100%);
                    border-color: #66c0f4;
                    color: #0f1923;
                    font-weight: 700;
                    box-shadow: 0 4px 15px rgba(102,192,244,0.4), inset 0 1px 0 rgba(255,255,255,0.3);
                    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                }
                .luatools-btn.primary:hover:not([data-disabled="1"]) {
                    background: linear-gradient(135deg, #7dd4ff 0%, #5ab3e8 100%);
                    transform: translateY(-3px) scale(1.03);
                    box-shadow: 0 8px 25px rgba(102,192,244,0.6), inset 0 1px 0 rgba(255,255,255,0.4);
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `;
            document.head.appendChild(style);
        } catch(err) { backendLog('LuaTools: Styles injection failed: ' + err); }
    }

    function ensureFontAwesome() {
        if (document.getElementById('luatools-fontawesome')) return;
        try {
            const link = document.createElement('link');
            link.id = 'luatools-fontawesome';
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
            link.integrity = 'sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==';
            link.crossOrigin = 'anonymous';
            link.referrerPolicy = 'no-referrer';
            document.head.appendChild(link);
        } catch(err) { backendLog('LuaTools: Font Awesome injection failed: ' + err); }
    }

    // Function to discover available Steam Client APIs
    function discoverSteamClientAPIs() {
        const discovered = [];
        try {
            // Check window for Steam-related objects
            const steamObjects = ['SteamClient', 'g_SteamClient', 'Steam', 'g_Steam', 'SteamUI', 'g_SteamUI'];
            for (let i = 0; i < steamObjects.length; i++) {
                const objName = steamObjects[i];
                if (typeof window[objName] !== 'undefined') {
                    discovered.push(objName + ' exists');
                    const obj = window[objName];
                    if (typeof obj === 'object') {
                        // List all properties
                        try {
                            const keys = Object.keys(obj);
                            for (let j = 0; j < Math.min(keys.length, 20); j++) {
                                const key = keys[j];
                                if (key.toLowerCase().includes('achievement') || key.toLowerCase().includes('stats') || key.toLowerCase().includes('app')) {
                                    discovered.push(objName + '.' + key);
                                }
                            }
                        } catch(e) {}
                    }
                }
            }
            
            // Try to find ISteamUserStats interface
            const statsInterfaces = [
                'ISteamUserStats',
                'SteamClient.UserStats',
                'SteamClient.Stats',
                'SteamClient.Apps',
                'window.ISteamUserStats'
            ];
            
            for (let i = 0; i < statsInterfaces.length; i++) {
                try {
                    const path = statsInterfaces[i].split('.');
                    let obj = window;
                    for (let j = 0; j < path.length; j++) {
                        obj = obj[path[j]];
                        if (!obj) break;
                    }
                    if (obj && typeof obj === 'object') {
                        discovered.push('Found: ' + statsInterfaces[i]);
                        // List methods
                        const methods = Object.keys(obj);
                        for (let j = 0; j < methods.length; j++) {
                            if (methods[j].toLowerCase().includes('achievement') || methods[j].toLowerCase().includes('get')) {
                                discovered.push(statsInterfaces[i] + '.' + methods[j]);
                            }
                        }
                    }
                } catch(e) {}
            }
        } catch(err) {
            backendLog('LuaTools: Error discovering APIs: ' + err);
        }
        
        if (discovered.length > 0) {
            backendLog('LuaTools: Discovered Steam APIs: ' + discovered.join(', '));
        }
        return discovered;
    }
    
    // Function to fetch achievements via SteamClient API or page DOM
    function fetchAchievementsViaSteamClient(appid, loadingOverlay) {
        try {
            backendLog('LuaTools: Attempting to fetch achievements for appid ' + appid);
            
            // Discover available APIs first
            discoverSteamClientAPIs();
            
            // Method 1: Try SteamClient API (if available in Millennium context)
            try {
                if (typeof SteamClient !== 'undefined') {
                    backendLog('LuaTools: SteamClient is available');
                    
                    // Expanded list of possible methods to try
                    const methods = [
                        'SteamClient.Apps.GetAchievementProgress',
                        'SteamClient.Apps.GetAchievements',
                        'SteamClient.Stats.GetAchievements',
                        'SteamClient.UserStats.GetAchievements',
                        'SteamClient.UserStats.GetPlayerAchievements',
                        'SteamClient.Apps.GetAppStats',
                        'SteamClient.Apps.GetGameAchievements',
                        'SteamClient.LocalAchievements.Get',
                        'SteamClient.LocalStats.GetAchievements',
                        'ISteamUserStats.GetPlayerAchievements',
                        'ISteamUserStats.GetAchievementProgress',
                        'g_SteamClient.UserStats.GetAchievements',
                        'window.SteamClient.UserStats.GetAchievements'
                    ];
                    
                    for (let i = 0; i < methods.length; i++) {
                        try {
                            const methodPath = methods[i].split('.');
                            let obj = window;
                            for (let j = 0; j < methodPath.length; j++) {
                                obj = obj[methodPath[j]];
                                if (!obj) break;
                            }
                            
                            if (typeof obj === 'function') {
                                backendLog('LuaTools: Found method: ' + methods[i]);
                                const result = obj(appid);
                                if (result && typeof result.then === 'function') {
                                    // It's a promise
                                    backendLog('LuaTools: Method returns promise, waiting for result...');
                                    result.then(function(achievements) {
                                        try {
                                            if (loadingOverlay && typeof loadingOverlay.remove === 'function') loadingOverlay.remove();
                                            backendLog('LuaTools: Got achievements data: ' + JSON.stringify(achievements).substring(0, 200));
                                            if (achievements && Array.isArray(achievements)) {
                                                const unlocked = achievements.filter(function(ach) {
                                                    return ach && (ach.bUnlocked === true || ach.unlocked === true || ach.achieved === true || ach.unlocktime > 0);
                                                });
                                                backendLog('LuaTools: Filtered to ' + unlocked.length + ' unlocked achievements');
                                                if (typeof showAchievementsPopup === 'function') {
                                                    showAchievementsPopup(appid, {
                                                        success: true,
                                                        achievements: unlocked.map(function(ach) {
                                                            return {
                                                                id: ach.apiname || ach.id || ach.achievement_id || '',
                                                                name: ach.name || ach.displayName || ach.localized_name || '',
                                                                unlocktime: ach.unlocktime || ach.rtimeUnlocked || '1'
                                                            };
                                                        }),
                                                        total_count: unlocked.length,
                                                        source: 'SteamClient API: ' + methods[i]
                                                    });
                                                    return; // Success!
                                                }
                                            } else if (achievements && typeof achievements === 'object') {
                                                // Try to extract achievements from object
                                                backendLog('LuaTools: Achievements is object, trying to extract...');
                                                const achievementsList = achievements.achievements || achievements.playerstats || achievements.stats || [];
                                                if (Array.isArray(achievementsList) && achievementsList.length > 0) {
                                                    const unlocked = achievementsList.filter(function(ach) {
                                                        return ach && (ach.bUnlocked === true || ach.unlocked === true || ach.achieved === true || ach.rtimeUnlocked > 0);
                                                    });
                                                    if (typeof showAchievementsPopup === 'function') {
                                                        showAchievementsPopup(appid, {
                                                            success: true,
                                                            achievements: unlocked.map(function(ach) {
                                                                return {
                                                                    id: ach.apiname || ach.id || ach.achievement_id || '',
                                                                    name: ach.name || ach.displayName || ach.localized_name || '',
                                                                    unlocktime: ach.unlocktime || ach.rtimeUnlocked || '1'
                                                                };
                                                            }),
                                                            total_count: unlocked.length,
                                                            source: 'SteamClient API: ' + methods[i]
                                                        });
                                                        return; // Success!
                                                    }
                                                }
                                            }
                                            // If we got here, didn't work with this method
                                            if (i === methods.length - 1 && typeof tryAlternativeAchievementMethod === 'function') {
                                                tryAlternativeAchievementMethod(appid, loadingOverlay, null);
                                            }
                                        } catch(e) {
                                            backendLog('LuaTools: Error in promise handler: ' + e);
                                            if (i === methods.length - 1 && typeof tryAlternativeAchievementMethod === 'function') {
                                                tryAlternativeAchievementMethod(appid, loadingOverlay, null);
                                            }
                                        }
                                    }).catch(function(err) {
                                        backendLog('LuaTools: Method ' + methods[i] + ' failed: ' + err);
                                        if (i === methods.length - 1 && typeof tryAlternativeAchievementMethod === 'function') {
                                            tryAlternativeAchievementMethod(appid, loadingOverlay, null);
                                        }
                                    });
                                    return; // Don't try other methods, wait for promise
                                } else if (result && typeof result === 'object') {
                                    // Synchronous result
                                    backendLog('LuaTools: Method returned synchronous result');
                                    // Process synchronously (same logic as promise handler above)
                                }
                            }
                        } catch(e) {
                            // Method not available, continue
                        }
                    }
                } else {
                    backendLog('LuaTools: SteamClient is not available in window');
                }
            } catch(err) {
                backendLog('LuaTools: Error checking SteamClient: ' + err);
            }
            
            // Method 2: Try to read from current page DOM immediately
            if (typeof tryAlternativeAchievementMethod === 'function') {
                tryAlternativeAchievementMethod(appid, loadingOverlay, null);
            } else {
                backendLog('LuaTools: tryAlternativeAchievementMethod not available');
                if (loadingOverlay && typeof loadingOverlay.remove === 'function') loadingOverlay.remove();
            }
        } catch(err) {
            backendLog('LuaTools: Error in fetchAchievementsViaSteamClient: ' + err);
            if (loadingOverlay && typeof loadingOverlay.remove === 'function') loadingOverlay.remove();
        }
    }
    
    // Alternative method: Try to get achievements from page or navigate to achievements page
    function tryAlternativeAchievementMethod(appid, loadingOverlay, steamid) {
        // Debug: Log current page info
        const currentUrl = window.location.href;
        backendLog('LuaTools: Current page URL: ' + currentUrl);
        backendLog('LuaTools: Looking for achievements on page for appid: ' + appid);
        
        // Method 1: Try to get achievements from current page DOM
        try {
            // Check multiple possible selectors for achievements on Steam pages
            // Steam uses different selectors in different contexts:
            // - Library achievements page: .achieveRow, .achieveRow.unlocked
            // - Community achievements: .achievement, .achievement.unlocked
            // - Stats page: .achieveRow, [data-achievement-id]
            const selectors = [
                '.achieveRow',
                '.achievement',
                '[data-achievement-id]',
                '.achieveRow.unlocked',
                '.achievement.unlocked',
                '.achieveRow.achieved',
                '.achievement.achieved',
                'div[class*="achieve"]',
                'div[class*="achievement"]'
            ];
            
            let achievementElements = [];
            let foundSelector = null;
            
            backendLog('LuaTools: Trying to find achievement elements on page...');
            for (let i = 0; i < selectors.length; i++) {
                try {
                    const elements = document.querySelectorAll(selectors[i]);
                    if (elements && elements.length > 0) {
                        achievementElements = Array.from(elements);
                        foundSelector = selectors[i];
                        backendLog('LuaTools: Found ' + elements.length + ' elements using selector: ' + selectors[i]);
                        break;
                    } else {
                        backendLog('LuaTools: Selector "' + selectors[i] + '" found 0 elements');
                    }
                } catch(e) {
                    backendLog('LuaTools: Error with selector "' + selectors[i] + '": ' + e);
                }
            }
            
            // If no elements found, log page structure for debugging
            if (achievementElements.length === 0) {
                backendLog('LuaTools: No achievement elements found. Page structure debug:');
                backendLog('LuaTools: - Page title: ' + (document.title || 'N/A'));
                backendLog('LuaTools: - Body classes: ' + (document.body ? document.body.className : 'N/A'));
                
                // Try to find any achievement-related text or elements
                const allDivs = document.querySelectorAll('div');
                let achievementRelatedCount = 0;
                for (let i = 0; i < Math.min(allDivs.length, 100); i++) {
                    const text = allDivs[i].textContent || '';
                    const className = allDivs[i].className || '';
                    if (text.toLowerCase().includes('achievement') || className.toLowerCase().includes('achieve')) {
                        achievementRelatedCount++;
                    }
                }
                backendLog('LuaTools: - Found ' + achievementRelatedCount + ' divs with "achievement" in text/class (checked first 100)');
            }
            
            if (achievementElements.length > 0) {
                const unlockedAchievements = [];
                
                achievementElements.forEach(function(el) {
                    try {
                        // Check if achievement is unlocked
                        const isUnlocked = el.classList.contains('unlocked') || 
                                         el.classList.contains('achieved') ||
                                         el.querySelector('.achieveUnlockTime') !== null ||
                                         el.querySelector('.achieveUnlockDate') !== null ||
                                         (el.getAttribute('data-achievement-unlocked') === 'true');
                        
                        if (isUnlocked) {
                            // Try to get achievement name
                            const nameSelectors = [
                                '.achieveTxtHolder h3',
                                '.achievementName',
                                'h3',
                                '.achieveTxt',
                                '[data-achievement-name]'
                            ];
                            
                            let name = 'Unknown Achievement';
                            for (let j = 0; j < nameSelectors.length; j++) {
                                const nameEl = el.querySelector(nameSelectors[j]);
                                if (nameEl && nameEl.textContent) {
                                    name = nameEl.textContent.trim();
                                    break;
                                }
                            }
                            
                            // Try to get achievement ID
                            let id = '';
                            const idEl = el.querySelector('[data-achievement-id]');
                            if (idEl) {
                                id = idEl.getAttribute('data-achievement-id');
                            } else if (el.getAttribute('data-achievement-id')) {
                                id = el.getAttribute('data-achievement-id');
                            } else {
                                id = name; // Use name as ID if no ID found
                            }
                            
                            // Try to get unlock time
                            let unlocktime = '1';
                            const timeEl = el.querySelector('.achieveUnlockTime, .achieveUnlockDate');
                            if (timeEl && timeEl.textContent) {
                                // Try to parse date
                                try {
                                    const dateText = timeEl.textContent.trim();
                                    unlocktime = dateText;
                                } catch(e) {}
                            }
                            
                            unlockedAchievements.push({
                                id: id,
                                name: name,
                                unlocktime: unlocktime
                            });
                        }
                    } catch(e) {
                        backendLog('LuaTools: Error parsing achievement element: ' + e);
                    }
                });
                
                if (unlockedAchievements.length > 0) {
                    loadingOverlay.remove();
                    backendLog('LuaTools: Found ' + unlockedAchievements.length + ' unlocked achievements from page DOM');
                    showAchievementsPopup(appid, {
                        success: true,
                        achievements: unlockedAchievements,
                        total_count: unlockedAchievements.length
                    });
                    return;
                } else {
                    backendLog('LuaTools: Found achievement elements but none are marked as unlocked');
                }
            }
        } catch(err) {
            backendLog('LuaTools: Error reading achievements from page: ' + err);
        }
        
        // Method 2: Try to fetch from Steam Web API (public, no key needed for global stats)
        // But we need SteamID for player-specific achievements
        // For now, show message with option to navigate to achievements page
        loadingOverlay.remove();
        
        // Try to get SteamID from page (if not already provided as parameter)
        if (!steamid) {
            try {
                if (window.g_steamID) {
                    steamid = window.g_steamID;
                } else if (window.g_CurrentUser && window.g_CurrentUser.steamid) {
                    steamid = window.g_CurrentUser.steamid;
                } else if (typeof SteamClient !== 'undefined' && SteamClient.User && SteamClient.User.GetSteamId) {
                    steamid = SteamClient.User.GetSteamId();
                }
            } catch(e) {
                backendLog('LuaTools: Could not get SteamID: ' + e);
            }
        }
        
        // Show popup with option to navigate to achievements page
        const popup = document.createElement('div');
        popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;';
        
        const content = document.createElement('div');
        content.style.cssText = 'background:#1b2838;border-radius:8px;padding:24px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
        
        const title = document.createElement('div');
        title.style.cssText = 'font-size:20px;font-weight:600;color:#fff;margin-bottom:16px;';
        title.textContent = 'Achievements';
        content.appendChild(title);
        
        const msg = document.createElement('div');
        msg.style.cssText = 'font-size:14px;color:#8f98a0;margin-bottom:20px;line-height:1.5;';
        
        // Create detailed explanation
        const explanation = document.createElement('div');
        explanation.style.cssText = 'margin-bottom:16px;';
        
        const reasonTitle = document.createElement('div');
        reasonTitle.style.cssText = 'font-weight:600;color:#66c0f4;margin-bottom:8px;';
        reasonTitle.textContent = 'Por que não conseguiu encontrar?';
        explanation.appendChild(reasonTitle);
        
        const reasonList = document.createElement('ul');
        reasonList.style.cssText = 'margin:0;padding-left:20px;color:#8f98a0;';
        
        const reasons = [
            'Você precisa estar na página de achievements do jogo na biblioteca do Steam',
            'O código procura por elementos HTML específicos (.achieveRow, .achievement) que só existem na página de achievements',
            'Se você está na página da loja ou na biblioteca geral, esses elementos não existem',
            'Steam não armazena achievements em arquivos locais - eles são carregados dinamicamente quando você abre a página de achievements'
        ];
        
        reasons.forEach(function(reason) {
            const li = document.createElement('li');
            li.style.cssText = 'margin-bottom:4px;';
            li.textContent = reason;
            reasonList.appendChild(li);
        });
        
        explanation.appendChild(reasonList);
        msg.appendChild(explanation);
        
        const solution = document.createElement('div');
        solution.style.cssText = 'margin-top:12px;padding:12px;background:rgba(102,192,244,0.1);border-radius:4px;border:1px solid rgba(102,192,244,0.2);';
        solution.textContent = 'Solução: Clique no botão abaixo para abrir a página de achievements do jogo, depois use o botão "List Achievements" novamente.';
        msg.appendChild(solution);
        
        content.appendChild(msg);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;';
        
        const openBtn = document.createElement('button');
        openBtn.style.cssText = 'background:#66c0f4;color:#1b2838;border:none;padding:10px 20px;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;';
        openBtn.textContent = 'Open Achievements Page';
        openBtn.onclick = function() {
            // Try to open achievements page
            const achievementsUrl = 'steam://url/GameAchievementsPage/' + appid;
            try {
                window.location.href = achievementsUrl;
            } catch(e) {
                // Fallback: try to navigate to web page
                window.open('https://steamcommunity.com/profiles/' + (steamid || '') + '/stats/' + appid + '/achievements', '_blank');
            }
            popup.remove();
        };
        buttonContainer.appendChild(openBtn);
        
        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:rgba(255,255,255,0.1);color:#fff;border:none;padding:10px 20px;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = function() {
            popup.remove();
        };
        buttonContainer.appendChild(closeBtn);
        
        content.appendChild(buttonContainer);
        popup.appendChild(content);
        
        popup.onclick = function(e) {
            if (e.target === popup) {
                popup.remove();
            }
        };
        
        document.body.appendChild(popup);
    }

    // Function to show achievements popup
    function showAchievementsPopup(appid, achievementsData) {
        // Avoid duplicates
        if (document.querySelector('.luatools-achievements-overlay')) return;
        
        ensureLuaToolsAnimations();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-achievements-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        
        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:500px;max-width:700px;max-height:80vh;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;overflow-y:auto;';
        
        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;color:#fff;margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.textContent = 'Achievements';
        
        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'position:absolute;top:16px;right:16px;background:none;border:none;color:#66c0f4;font-size:24px;cursor:pointer;padding:4px 8px;';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = function() { overlay.remove(); };
        
        const content = document.createElement('div');
        content.style.cssText = 'max-height:60vh;overflow-y:auto;';
        
        if (achievementsData && achievementsData.success && achievementsData.achievements && achievementsData.achievements.length > 0) {
            // Filter only unlocked achievements
            const unlockedAchievements = achievementsData.achievements.filter(ach => ach.unlocked === true);

            if (unlockedAchievements.length > 0) {
                const count = document.createElement('div');
                count.style.cssText = 'font-size:14px;color:#8f98a0;margin-bottom:16px;';
                count.textContent = `You have unlocked ${unlockedAchievements.length} achievement(s)`;
                content.appendChild(count);

                const list = document.createElement('div');
                list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

                unlockedAchievements.forEach(function(ach) {
                    const item = document.createElement('div');
                    item.style.cssText = 'background:rgba(42,71,94,0.5);padding:12px;border-radius:6px;border:1px solid rgba(102,192,244,0.2);';

                    const name = document.createElement('div');
                    name.style.cssText = 'font-size:14px;font-weight:600;color:#fff;margin-bottom:4px;';
                    name.textContent = ach.name || ach.id || 'Unknown Achievement';

                    const unlockInfo = document.createElement('div');
                    unlockInfo.style.cssText = 'font-size:12px;color:#66c0f4;';
                    if (ach.unlocktime && ach.unlocktime !== '0' && ach.unlocktime !== 0) {
                        const unlockDate = new Date(parseInt(ach.unlocktime) * 1000);
                        unlockInfo.textContent = `Unlocked: ${unlockDate.toLocaleDateString()} ${unlockDate.toLocaleTimeString()}`;
                    } else {
                        unlockInfo.textContent = 'Unlocked';
                    }

                    item.appendChild(name);
                    item.appendChild(unlockInfo);
                    list.appendChild(item);
                });

                content.appendChild(list);
            } else {
                const noAchievementsMsg = document.createElement('div');
                noAchievementsMsg.style.cssText = 'padding:20px;text-align:center;color:#8f98a0;';
                noAchievementsMsg.textContent = 'No achievements unlocked yet for this game.';
                content.appendChild(noAchievementsMsg);
            }
        } else {
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'padding:20px;text-align:center;color:#8f98a0;';
            if (achievementsData && achievementsData.error) {
                errorMsg.textContent = `Error: ${achievementsData.error}`;
            } else if (achievementsData && achievementsData.achievements && achievementsData.achievements.length === 0) {
                errorMsg.textContent = 'No achievements unlocked yet for this game.';
            } else {
                errorMsg.textContent = 'Failed to load achievements. Make sure you have played this game.';
            }
            content.appendChild(errorMsg);
        }
        
        modal.appendChild(title);
        modal.appendChild(closeBtn);
        modal.appendChild(content);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Close on overlay click (outside modal)
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // Dev Console - estilo Chrome DevTools
    function showDevConsole() {
        if (document.querySelector('.luatools-dev-console-overlay')) return;
        
        ensureLuaToolsAnimations();
        ensureFontAwesome();
        
        const overlay = document.createElement('div');
        overlay.className = 'luatools-dev-console-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;font-family:"Consolas","Monaco","Courier New",monospace;';
        
        const header = document.createElement('div');
        header.style.cssText = 'background:#1b2838;padding:12px 16px;border-bottom:2px solid #66c0f4;display:flex;justify-content:space-between;align-items:center;';
        
        const title = document.createElement('div');
        title.style.cssText = 'color:#66c0f4;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;';
        title.innerHTML = '<i class="fa-solid fa-terminal"></i> LuaTools Dev Console';
        header.appendChild(title);
        
        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'background:none;border:none;color:#66c0f4;font-size:20px;cursor:pointer;padding:4px 8px;';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = function() { overlay.remove(); };
        header.appendChild(closeBtn);
        
        const output = document.createElement('div');
        output.className = 'luatools-console-output';
        output.style.cssText = 'flex:1;overflow-y:auto;background:#0d1117;color:#c9d1d9;padding:16px;font-size:13px;line-height:1.5;';
        
        const inputContainer = document.createElement('div');
        inputContainer.style.cssText = 'background:#161b22;border-top:2px solid #66c0f4;padding:12px;display:flex;gap:8px;align-items:center;position:relative;';
        
        const prompt = document.createElement('span');
        prompt.style.cssText = 'color:#66c0f4;font-weight:600;user-select:none;';
        prompt.textContent = '> ';
        
        const inputWrapper = document.createElement('div');
        inputWrapper.style.cssText = 'flex:1;position:relative;';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'luatools-console-input';
        input.style.cssText = 'width:100%;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:8px 12px;border-radius:4px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box;';
        input.placeholder = 'Digite comandos JavaScript aqui... (ex: window.SteamClient)';
        
        // Autocomplete dropdown
        const autocompleteDropdown = document.createElement('div');
        autocompleteDropdown.className = 'luatools-autocomplete-dropdown';
        autocompleteDropdown.style.cssText = 'position:absolute;bottom:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#161b22;border:1px solid #66c0f4;border-radius:4px;margin-bottom:4px;display:none;z-index:100000;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(autocompleteDropdown);
        
        const history = [];
        let historyIndex = -1;
        let autocompleteSuggestions = [];
        let autocompleteIndex = -1;
        let currentText = '';
        
        // Lista de objetos e propriedades conhecidos para autocomplete
        const knownGlobals = [
            'window', 'document', 'console', 'SteamClient', 'Millennium',
            'g_steamID', 'g_CurrentUser', 'location', 'history'
        ];
        
        const steamClientMethods = [
            'Apps', 'User', 'Stats', 'UserStats', 'LocalStorage', 'Settings'
        ];
        
        // Função para obter propriedades de um objeto
        function getObjectProperties(obj, maxDepth, currentDepth) {
            if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') return [];
            const props = [];
            try {
                const keys = Object.keys(obj);
                for (let i = 0; i < Math.min(keys.length, 50); i++) {
                    props.push(keys[i]);
                }
            } catch(e) {}
            return props;
        }
        
        // Função para buscar sugestões
        function getSuggestions(text) {
            if (!text || text.trim() === '') return [];
            
            const suggestions = [];
            const parts = text.split('.');
            const lastPart = parts[parts.length - 1];
            const prefix = parts.slice(0, -1).join('.');
            
            // Se está digitando uma propriedade (tem ponto)
            if (parts.length > 1 && prefix) {
                try {
                    // Tenta avaliar o prefixo para obter o objeto
                    const obj = eval(prefix);
                    if (obj && typeof obj === 'object') {
                        const props = getObjectProperties(obj, 2, 0);
                        props.forEach(function(prop) {
                            const propLower = prop.toLowerCase();
                            const lastLower = lastPart.toLowerCase();
                            if (propLower.includes(lastLower) || lastPart === '') {
                                const type = typeof obj[prop];
                                let typeLabel = type;
                                if (Array.isArray(obj[prop])) typeLabel = 'array';
                                else if (type === 'function') typeLabel = 'function';
                                
                                suggestions.push({
                                    text: prefix + '.' + prop,
                                    label: prop,
                                    type: typeLabel,
                                    priority: propLower.startsWith(lastLower) ? 1 : 2
                                });
                            }
                        });
                    }
                } catch(e) {
                    // Prefixo inválido, ignorar
                }
            } else {
                // Buscar em globais conhecidos
                knownGlobals.forEach(function(global) {
                    const globalLower = global.toLowerCase();
                    const lastLower = lastPart.toLowerCase();
                    if (globalLower.includes(lastLower) || lastPart === '') {
                        try {
                            if (typeof window[global] !== 'undefined') {
                                suggestions.push({
                                    text: global,
                                    label: global,
                                    type: typeof window[global],
                                    priority: globalLower.startsWith(lastLower) ? 1 : 2
                                });
                            }
                        } catch(e) {}
                    }
                });
                
                // Adicionar métodos conhecidos do SteamClient
                if (lastPart.toLowerCase().includes('steam') || lastPart === '') {
                    steamClientMethods.forEach(function(method) {
                        const methodLower = method.toLowerCase();
                        const lastLower = lastPart.toLowerCase();
                        if (methodLower.includes(lastLower) || lastPart === '') {
                            suggestions.push({
                                text: 'SteamClient.' + method,
                                label: 'SteamClient.' + method,
                                type: 'object',
                                priority: methodLower.startsWith(lastLower) ? 1 : 2
                            });
                        }
                    });
                }
                
                // Buscar propriedades de SteamClient se existir
                if (typeof SteamClient !== 'undefined') {
                    try {
                        const props = getObjectProperties(SteamClient, 1, 0);
                        props.forEach(function(prop) {
                            const propLower = prop.toLowerCase();
                            const lastLower = lastPart.toLowerCase();
                            if (propLower.includes(lastLower) || lastPart === '') {
                                const type = typeof SteamClient[prop];
                                suggestions.push({
                                    text: 'SteamClient.' + prop,
                                    label: 'SteamClient.' + prop,
                                    type: type === 'function' ? 'function' : type,
                                    priority: propLower.startsWith(lastLower) ? 1 : 2
                                });
                            }
                        });
                    } catch(e) {}
                }
                
                // Sugerir Millennium se relevante
                if (typeof Millennium !== 'undefined' && (lastPart === '' || 'millennium'.includes(lastPart.toLowerCase()))) {
                    try {
                        const props = getObjectProperties(Millennium, 1, 0);
                        props.forEach(function(prop) {
                            const propLower = prop.toLowerCase();
                            const lastLower = lastPart.toLowerCase();
                            if (propLower.includes(lastLower) || lastPart === '') {
                                suggestions.push({
                                    text: 'Millennium.' + prop,
                                    label: 'Millennium.' + prop,
                                    type: typeof Millennium[prop],
                                    priority: propLower.startsWith(lastLower) ? 1 : 2
                                });
                            }
                        });
                    } catch(e) {}
                }
            }
            
            // Ordenar por prioridade e remover duplicatas
            suggestions.sort(function(a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.label.localeCompare(b.label);
            });
            
            const unique = [];
            const seen = {};
            suggestions.forEach(function(sug) {
                if (!seen[sug.text] && unique.length < 20) {
                    seen[sug.text] = true;
                    unique.push(sug);
                }
            });
            
            return unique;
        }
        
        // Função para mostrar autocomplete
        function showAutocomplete(suggestions) {
            if (suggestions.length === 0) {
                autocompleteDropdown.style.display = 'none';
                return;
            }
            
            autocompleteDropdown.innerHTML = '';
            autocompleteSuggestions = suggestions;
            autocompleteIndex = -1;
            
            suggestions.forEach(function(sug, index) {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid #30363d;color:#c9d1d9;display:flex;justify-content:space-between;align-items:center;';
                item.onmouseover = function() {
                    item.style.background = '#1f6feb';
                    item.style.color = '#fff';
                };
                item.onmouseout = function() {
                    item.style.background = 'transparent';
                    item.style.color = '#c9d1d9';
                };
                item.onclick = function() {
                    input.value = sug.text;
                    hideAutocomplete();
                    input.focus();
                };
                
                const label = document.createElement('span');
                label.textContent = sug.label;
                label.style.cssText = 'font-weight:500;';
                
                const type = document.createElement('span');
                type.textContent = sug.type;
                type.style.cssText = 'font-size:11px;color:#8b949e;margin-left:8px;';
                
                item.appendChild(label);
                item.appendChild(type);
                autocompleteDropdown.appendChild(item);
            });
            
            autocompleteDropdown.style.display = 'block';
        }
        
        // Função para esconder autocomplete
        function hideAutocomplete() {
            autocompleteDropdown.style.display = 'none';
            autocompleteIndex = -1;
        }
        
        // Atualizar autocomplete enquanto digita
        input.oninput = function(e) {
            const text = input.value;
            currentText = text;
            
            // Não mostrar autocomplete se estiver vazio ou se acabou de executar comando
            if (!text || text.trim() === '') {
                hideAutocomplete();
                return;
            }
            
            // Obter sugestões
            const suggestions = getSuggestions(text);
            showAutocomplete(suggestions);
        };
        
        function addOutput(text, type) {
            const line = document.createElement('div');
            line.style.cssText = 'margin-bottom:4px;word-wrap:break-word;';
            
            if (type === 'error') {
                line.style.color = '#f85149';
                line.textContent = '✗ ' + text;
            } else if (type === 'warn') {
                line.style.color = '#d29922';
                line.textContent = '⚠ ' + text;
            } else if (type === 'info') {
                line.style.color = '#58a6ff';
                line.textContent = 'ℹ ' + text;
            } else if (type === 'command') {
                line.style.color = '#7c3aed';
                line.textContent = '> ' + text;
            } else if (type === 'result') {
                line.style.color = '#c9d1d9';
                line.textContent = text;
            } else {
                line.textContent = text;
            }
            
            output.appendChild(line);
            output.scrollTop = output.scrollHeight;
        }
        
        function executeCommand(cmd) {
            if (!cmd || !cmd.trim()) return;
            
            addOutput(cmd, 'command');
            history.push(cmd);
            historyIndex = history.length;
            
            // Comandos especiais
            const trimmedCmd = cmd.trim();
            if (trimmedCmd === 'clear' || trimmedCmd === 'cls') {
                output.innerHTML = '';
                addOutput('Console cleared', 'info');
                return;
            }
            if (trimmedCmd === 'help') {
                addOutput('Comandos disponíveis:', 'info');
                addOutput('  clear / cls - Limpa o console', 'info');
                addOutput('  help - Mostra esta ajuda', 'info');
                addOutput('  inspect(obj) - Inspeciona um objeto detalhadamente', 'info');
                addOutput('  steam() - Mostra informações do Steam Client', 'info');
                addOutput('  vars() - Lista variáveis globais úteis', 'info');
                addOutput('', 'result');
                addOutput('Exemplos:', 'info');
                addOutput('  SteamClient - Ver o objeto SteamClient', 'info');
                addOutput('  inspect(SteamClient) - Inspecionar SteamClient detalhadamente', 'info');
                addOutput('  window.g_steamID - Ver SteamID', 'info');
                addOutput('  typeof SteamClient.Apps - Verificar tipo', 'info');
                return;
            }
            if (trimmedCmd === 'steam()' || trimmedCmd === 'steam') {
                addOutput('Steam Client Info:', 'info');
                if (typeof SteamClient !== 'undefined') {
                    try {
                        const keys = Object.keys(SteamClient).slice(0, 20);
                        addOutput('SteamClient properties: ' + keys.join(', '), 'result');
                    } catch(e) {
                        addOutput('SteamClient exists but error accessing: ' + e, 'warn');
                    }
                } else {
                    addOutput('SteamClient not found', 'warn');
                }
                return;
            }
            if (trimmedCmd === 'vars()' || trimmedCmd === 'vars') {
                addOutput('Variáveis globais úteis:', 'info');
                const usefulVars = ['window', 'document', 'SteamClient', 'g_steamID', 'g_CurrentUser', 'Millennium'];
                usefulVars.forEach(function(v) {
                    if (typeof window[v] !== 'undefined') {
                        addOutput('  ' + v + ': exists', 'result');
                    } else {
                        addOutput('  ' + v + ': not found', 'warn');
                    }
                });
                return;
            }
            
            // Executar JavaScript
            try {
                // Check if it's an inspect command
                if (trimmedCmd.startsWith('inspect(') && trimmedCmd.endsWith(')')) {
                    const objToInspect = trimmedCmd.substring(8, trimmedCmd.length - 1);
                    try {
                        const obj = eval(objToInspect);
                        const inspected = inspect(obj, 0, objToInspect);
                        addOutput(inspected, 'result');
                    } catch(inspectErr) {
                        addOutput('Error inspecting: ' + inspectErr.message, 'error');
                    }
                    return;
                }
                
                // Tenta eval primeiro (para expressões)
                let result;
                try {
                    // Make inspect available in eval context
                    result = eval('(function(inspect) { return ' + cmd + ' })(' + inspect.toString() + ')');
                } catch(evalErr) {
                    // Se eval falhar, tenta Function constructor
                    try {
                        result = (new Function('inspect', 'return (' + cmd + ')')(inspect));
                    } catch(funcErr) {
                        throw evalErr; // Use original error
                    }
                }
                
                // Formatar resultado
                if (result === undefined) {
                    addOutput('undefined', 'result');
                } else if (result === null) {
                    addOutput('null', 'result');
                } else if (typeof result === 'object') {
                    try {
                        const json = JSON.stringify(result, null, 2);
                        if (json.length > 1000) {
                            addOutput(json.substring(0, 1000) + '... (truncated, use inspect() for details)', 'result');
                        } else {
                            addOutput(json, 'result');
                        }
                    } catch(jsonErr) {
                        addOutput(result.toString() + ' [Object]', 'result');
                        addOutput('Use inspect(' + cmd + ') para ver detalhes', 'info');
                    }
                } else {
                    addOutput(String(result), 'result');
                }
            } catch(err) {
                addOutput('Error: ' + err.message, 'error');
                if (err.stack) {
                    addOutput(err.stack, 'error');
                }
            }
        }
        
        // Função helper para inspecionar objetos
        function inspect(obj, depth, path) {
            depth = depth || 0;
            path = path || '';
            if (depth > 3) return '... (max depth)';
            
            let output = '';
            if (obj === null) return 'null';
            if (obj === undefined) return 'undefined';
            if (typeof obj === 'function') return '[Function]';
            
            if (typeof obj === 'object') {
                if (Array.isArray(obj)) {
                    output = 'Array[' + obj.length + '] {\n';
                    for (let i = 0; i < Math.min(obj.length, 10); i++) {
                        output += '  '.repeat(depth + 1) + i + ': ' + inspect(obj[i], depth + 1, path + '[' + i + ']') + ',\n';
                    }
                    if (obj.length > 10) {
                        output += '  '.repeat(depth + 1) + '... (' + (obj.length - 10) + ' more)\n';
                    }
                    output += '  '.repeat(depth) + '}';
                } else {
                    output = 'Object {\n';
                    const keys = Object.keys(obj).slice(0, 20);
                    for (let i = 0; i < keys.length; i++) {
                        const key = keys[i];
                        try {
                            const value = obj[key];
                            if (typeof value === 'function') {
                                output += '  '.repeat(depth + 1) + key + ': [Function],\n';
                            } else {
                                output += '  '.repeat(depth + 1) + key + ': ' + inspect(value, depth + 1, path + '.' + key) + ',\n';
                            }
                        } catch(e) {
                            output += '  '.repeat(depth + 1) + key + ': [Error accessing],\n';
                        }
                    }
                    if (Object.keys(obj).length > 20) {
                        output += '  '.repeat(depth + 1) + '... (' + (Object.keys(obj).length - 20) + ' more properties)\n';
                    }
                    output += '  '.repeat(depth) + '}';
                }
            } else {
                output = String(obj);
            }
            
            return output;
        }
        
        // Tornar inspect() disponível globalmente no console
        window.luatools_inspect = inspect;
        
        // Mensagem de boas-vindas
        addOutput('LuaTools Dev Console v1.0', 'info');
        addOutput('Digite comandos JavaScript ou "help" para ajuda', 'info');
        addOutput('', 'result');
        
        input.onkeydown = function(e) {
            // Se autocomplete está visível, tratar navegação no autocomplete
            if (autocompleteDropdown.style.display === 'block' && autocompleteSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    autocompleteIndex = (autocompleteIndex + 1) % autocompleteSuggestions.length;
                    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
                    items.forEach(function(item, idx) {
                        if (idx === autocompleteIndex) {
                            item.style.background = '#1f6feb';
                            item.style.color = '#fff';
                            item.scrollIntoView({ block: 'nearest' });
                        } else {
                            item.style.background = 'transparent';
                            item.style.color = '#c9d1d9';
                        }
                    });
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (autocompleteIndex <= 0) {
                        autocompleteIndex = autocompleteSuggestions.length - 1;
                    } else {
                        autocompleteIndex--;
                    }
                    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
                    items.forEach(function(item, idx) {
                        if (idx === autocompleteIndex) {
                            item.style.background = '#1f6feb';
                            item.style.color = '#fff';
                            item.scrollIntoView({ block: 'nearest' });
                        } else {
                            item.style.background = 'transparent';
                            item.style.color = '#c9d1d9';
                        }
                    });
                    return;
                } else if (e.key === 'Enter' && autocompleteIndex >= 0) {
                    e.preventDefault();
                    const selected = autocompleteSuggestions[autocompleteIndex];
                    input.value = selected.text;
                    hideAutocomplete();
                    input.focus();
                    return;
                } else if (e.key === 'Tab' && autocompleteIndex >= 0) {
                    e.preventDefault();
                    const selected = autocompleteSuggestions[autocompleteIndex];
                    input.value = selected.text;
                    hideAutocomplete();
                    input.focus();
                    return;
                } else if (e.key === 'Escape') {
                    hideAutocomplete();
                    return;
                }
            }
            
            if (e.key === 'Enter') {
                hideAutocomplete();
                executeCommand(input.value);
                input.value = '';
                currentText = '';
            } else if (e.key === 'ArrowUp' && autocompleteDropdown.style.display !== 'block') {
                e.preventDefault();
                if (historyIndex > 0) {
                    historyIndex--;
                    input.value = history[historyIndex];
                }
            } else if (e.key === 'ArrowDown' && autocompleteDropdown.style.display !== 'block') {
                e.preventDefault();
                if (historyIndex < history.length - 1) {
                    historyIndex++;
                    input.value = history[historyIndex] || '';
                } else {
                    historyIndex = history.length;
                    input.value = '';
                }
            } else if (e.key === 'Escape') {
                if (autocompleteDropdown.style.display === 'block') {
                    hideAutocomplete();
                } else {
                    overlay.remove();
                }
            }
        };
        
        // Esconder autocomplete ao clicar fora
        overlay.addEventListener('click', function(e) {
            if (!inputWrapper.contains(e.target)) {
                hideAutocomplete();
            }
        });
        
        inputContainer.appendChild(prompt);
        inputContainer.appendChild(inputWrapper);
        
        overlay.appendChild(header);
        overlay.appendChild(output);
        overlay.appendChild(inputContainer);
        
        document.body.appendChild(overlay);
        input.focus();
        
        // Adicionar comandos especiais ao window para facilitar
        window.luatools_exec = executeCommand;
        window.luatools_inspect = inspect;
        
        addOutput('Dica: Use inspect(obj) para inspecionar objetos detalhadamente', 'info');
        addOutput('Exemplo: inspect(SteamClient)', 'info');
    }

    function showSettingsPopup() {
        if (document.querySelector('.luatools-settings-overlay') || settingsMenuPending) return;
        settingsMenuPending = true;
        ensureTranslationsLoaded(false).catch(function(){ return null; }).finally(function(){
            settingsMenuPending = false;
            if (document.querySelector('.luatools-settings-overlay')) return;

            try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
            ensureLuaToolsStyles();
            ensureFontAwesome();

            const overlay = document.createElement('div');
            overlay.className = 'luatools-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.1s ease-out;';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

            const modal = document.createElement('div');
            modal.style.cssText = 'position:relative;background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:420px;max-width:600px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid rgba(102,192,244,0.3);';

            const title = document.createElement('div');
            title.style.cssText = 'font-size:24px;color:#fff;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
            title.textContent = t('menu.title', 'LuaTools · Menu');

            const iconButtons = document.createElement('div');
            iconButtons.style.cssText = 'display:flex;gap:12px;';

            function createIconButton(id, iconClass, titleKey, titleFallback) {
                const btn = document.createElement('a');
                btn.id = id;
                btn.href = '#';
                btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(102,192,244,0.1);border:1px solid rgba(102,192,244,0.3);border-radius:10px;color:#66c0f4;font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;';
                btn.innerHTML = '<i class="fa-solid ' + iconClass + '"></i>';
                btn.title = t(titleKey, titleFallback);
                btn.onmouseover = function() { this.style.background = 'rgba(102,192,244,0.25)'; this.style.transform = 'translateY(-2px) scale(1.05)'; this.style.boxShadow = '0 8px 16px rgba(102,192,244,0.3)'; this.style.borderColor = '#66c0f4'; };
                btn.onmouseout = function() { this.style.background = 'rgba(102,192,244,0.1)'; this.style.transform = 'translateY(0) scale(1)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(102,192,244,0.3)'; };
                iconButtons.appendChild(btn);
                return btn;
            }

            const body = document.createElement('div');
            body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';

            const container = document.createElement('div');
            container.style.cssText = 'margin-top:16px;display:flex;flex-direction:column;gap:12px;align-items:stretch;';

            function createSectionLabel(key, fallback, marginTop) {
                const label = document.createElement('div');
                const topValue = typeof marginTop === 'number' ? marginTop : 12;
                label.style.cssText = 'font-size:12px;color:#66c0f4;margin-top:' + topValue + 'px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;text-align:center;';
                label.textContent = t(key, fallback);
                container.appendChild(label);
                return label;
            }

            function createMenuButton(id, key, fallback, iconClass, isPrimary) {
                const btn = document.createElement('a');
                btn.id = id;
                btn.href = '#';
                btn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 24px;background:linear-gradient(135deg, rgba(102,192,244,0.15) 0%, rgba(102,192,244,0.05) 100%);border:1px solid rgba(102,192,244,0.3);border-radius:12px;color:#fff;font-size:15px;font-weight:500;text-decoration:none;transition:all 0.3s ease;cursor:pointer;position:relative;overflow:hidden;text-align:center;';
                const iconHtml = iconClass ? '<i class="fa-solid ' + iconClass + '" style="font-size:16px;"></i>' : '';
                const textSpan = '<span style="text-align:center;">' + t(key, fallback) + '</span>';
                btn.innerHTML = iconHtml + textSpan;
                btn.onmouseover = function() { this.style.background = 'linear-gradient(135deg, rgba(102,192,244,0.3) 0%, rgba(102,192,244,0.15) 100%)'; this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 8px 20px rgba(102,192,244,0.25)'; this.style.borderColor = '#66c0f4'; };
                btn.onmouseout = function() { this.style.background = 'linear-gradient(135deg, rgba(102,192,244,0.15) 0%, rgba(102,192,244,0.05) 100%)'; this.style.transform = 'translateY(0)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(102,192,244,0.3)'; };
                container.appendChild(btn);
                return btn;
            }

            const discordBtn = createIconButton('lt-settings-discord', 'fa-brands fa-discord', 'menu.discord', 'Discord');
            const settingsManagerBtn = createIconButton('lt-settings-open-manager', 'fa-gear', 'menu.settings', 'Settings');
            const closeBtn = createIconButton('lt-settings-close', 'fa-xmark', 'settings.close', 'Close');

            createSectionLabel('menu.manageGameLabel', 'Manage Game');

            const removeBtn = createMenuButton('lt-settings-remove-lua', 'menu.removeLuaTools', 'Remove via LuaTools', 'fa-trash-can');
            removeBtn.style.display = 'none';

            const fixesMenuBtn = createMenuButton('lt-settings-fixes-menu', 'menu.fixesMenu', 'Fixes Menu', 'fa-wrench');

            createSectionLabel('menu.advancedLabel', 'Advanced');
            const checkBtn = createMenuButton('lt-settings-check', 'menu.checkForUpdates', 'Check For Updates', 'fa-cloud-arrow-down');
            const fetchApisBtn = createMenuButton('lt-settings-fetch-apis', 'menu.fetchFreeApis', 'Fetch Free APIs', 'fa-server');

            createSectionLabel('menu.debugLabel', 'MISC');
            const exportAchievementsBtn = createMenuButton('lt-settings-export-achievements', 'menu.exportAchievements', 'Export Achievements', 'fa-download');
            const importAchievementsBtn = createMenuButton('lt-settings-import-achievements', 'menu.importAchievements', 'Import Achievements', 'fa-upload');
            const devConsoleBtn = createMenuButton('lt-settings-dev-console', 'menu.devConsole', 'Dev Console', 'fa-terminal');
            backendLog('LuaTools: Dev Console button created: ' + (devConsoleBtn ? 'success' : 'failed'));

            body.appendChild(container);

            header.appendChild(title);
            header.appendChild(iconButtons);
            modal.appendChild(header);
            modal.appendChild(body);
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
                                ShowLuaToolsAlert('LuaTools', msg);
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
                                ShowLuaToolsAlert('LuaTools', text);
                            } catch(_) {}
                        });
                    } catch(_) {}
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    overlay.remove();
                });
            }

            if (settingsManagerBtn) { // This is the icon button now
                settingsManagerBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    showSettingsManagerPopup(false, showSettingsPopup);
                });
            }

            if (exportAchievementsBtn) {
                exportAchievementsBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    // Get appid from current page
                    const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                    const appid = match ? parseInt(match[1], 10) : NaN;
                    if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                        // Show loading
                        const loadingOverlay = document.createElement('div');
                        loadingOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99998;display:flex;align-items:center;justify-content:center;';
                        const loadingText = document.createElement('div');
                        loadingText.style.cssText = 'color:#fff;font-size:18px;';
                        loadingText.textContent = 'Exporting achievements...';
                        loadingOverlay.appendChild(loadingText);
                        document.body.appendChild(loadingOverlay);

                        // Get all achievements (including locked ones for backup)
                        Millennium.callServerMethod('luatools', 'GetAllAchievementsForApp', { appid, contentScriptQuery: '' }).then(function(res){
                            loadingOverlay.remove();
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                if (payload && payload.success && payload.achievements && payload.achievements.length > 0) {
                                    // Create backup JSON
                                    const backupData = {
                                        appid: appid,
                                        export_date: new Date().toISOString(),
                                        achievements: payload.achievements
                                    };

                                    // Download as JSON file
                                    const dataStr = JSON.stringify(backupData, null, 2);
                                    const dataBlob = new Blob([dataStr], {type: 'application/json'});
                                    const url = URL.createObjectURL(dataBlob);

                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `achievements_${appid}.json`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    URL.revokeObjectURL(url);

                                    ShowLuaToolsAlert('LuaTools', `Exported ${payload.achievements.length} achievements to achievements_${appid}.json`);
                                } else {
                                    ShowLuaToolsAlert('LuaTools', 'No achievements found to export.');
                                }
                            } catch (parseErr) {
                                backendLog('LuaTools: Failed to parse export response: ' + parseErr);
                                ShowLuaToolsAlert('LuaTools', 'Failed to export achievements.');
                            }
                        }).catch(function(err){
                            loadingOverlay.remove();
                            backendLog('LuaTools: Failed to export achievements: ' + err);
                            ShowLuaToolsAlert('LuaTools', 'Failed to export achievements.');
                        });
                    } else {
                        backendLog('LuaTools: Could not determine appid from URL');
                        ShowLuaToolsAlert('LuaTools', 'Could not determine game ID from URL. Please navigate to the game\'s store page or community page.');
                    }
                });
            }

            if (importAchievementsBtn) {
                importAchievementsBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}

                    // Create file input for JSON selection
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.json';
                    fileInput.style.display = 'none';

                    fileInput.addEventListener('change', function(){
                        const file = fileInput.files[0];
                        if (!file) return;

                        const reader = new FileReader();
                        reader.onload = function(e) {
                            try {
                                const backupData = JSON.parse(e.target.result);
                                backendLog('LuaTools: Loaded backup data: ' + JSON.stringify(backupData).substring(0, 200) + '...');

                                if (!backupData.achievements || !Array.isArray(backupData.achievements)) {
                                    backendLog('LuaTools: Invalid backup format - no achievements array');
                                    ShowLuaToolsAlert('LuaTools', 'Invalid backup file format.');
                                    return;
                                }

                                backendLog('LuaTools: Found ' + backupData.achievements.length + ' achievements in backup');

                                const unlockedAchievements = backupData.achievements.filter(a => a.unlocked === true);
                                const unlockedIds = unlockedAchievements.map(a => a.id);

                                backendLog('LuaTools: Found ' + unlockedIds.length + ' unlocked achievements in backup');

                                if (unlockedIds.length === 0) {
                                    ShowLuaToolsAlert('LuaTools', 'No unlocked achievements found in backup.');
                                    return;
                                }

                                // Show confirmation
                                const confirmMsg = `Found ${unlockedIds.length} unlocked achievements in backup. Import them?`;
                                if (!confirm(confirmMsg)) return;

                                // Get appid from current page
                                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                                const appid = match ? parseInt(match[1], 10) : NaN;
                                backendLog('LuaTools: Determined appid: ' + appid);

                                if (isNaN(appid)) {
                                    ShowLuaToolsAlert('LuaTools', 'Could not determine game ID from URL.');
                                    return;
                                }

                                // Show loading with progress
                                const loadingOverlay = document.createElement('div');
                                loadingOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
                                document.body.appendChild(loadingOverlay);

                                const loadingText = document.createElement('div');
                                loadingText.style.cssText = 'color:#fff;font-size:18px;text-align:center;';
                                loadingText.textContent = 'Importing achievements...';
                                loadingOverlay.appendChild(loadingText);

                                // Progress bar container
                                const progressContainer = document.createElement('div');
                                progressContainer.style.cssText = 'width:300px;height:20px;background:rgba(255,255,255,0.2);border-radius:10px;overflow:hidden;';
                                loadingOverlay.appendChild(progressContainer);

                                // Progress bar
                                const progressBar = document.createElement('div');
                                progressBar.style.cssText = 'width:0%;height:100%;background:linear-gradient(90deg, #66c0f4 0%, #4a90e2 100%);border-radius:10px;transition:width 0.3s ease;';
                                progressContainer.appendChild(progressBar);

                                // Progress text
                                const progressText = document.createElement('div');
                                progressText.style.cssText = 'color:#fff;font-size:14px;margin-top:10px;text-align:center;';
                                progressText.textContent = '0 / ' + unlockedIds.length;
                                loadingOverlay.appendChild(progressText);

                                // Animate progress bar
                                let progressPercent = 0;
                                const progressInterval = setInterval(() => {
                                    if (progressPercent < 90) { // Don't go to 100% until actually done
                                        progressPercent += Math.random() * 5; // Random increment for visual effect
                                        if (progressPercent > 90) progressPercent = 90;
                                        progressBar.style.width = progressPercent + '%';
                                        progressText.textContent = Math.floor((progressPercent / 100) * unlockedIds.length) + ' / ' + unlockedIds.length;
                                    }
                                }, 200);

                                const importData = {
                                    appid: appid,
                                    achievements_list: unlockedIds,
                                    contentScriptQuery: ''
                                };

                                backendLog('LuaTools: Calling ImportAchievements with ' + unlockedIds.length + ' unlocked achievement IDs');

                                // Import achievements
                                Millennium.callServerMethod('luatools', 'ImportAchievements', importData).then(function(res){
                                    // Stop progress animation and complete it
                                    clearInterval(progressInterval);
                                    progressBar.style.width = '100%';
                                    progressText.textContent = unlockedIds.length + ' / ' + unlockedIds.length;

                                    // Wait a moment to show completion, then remove overlay and show result
                                    setTimeout(() => {
                                        loadingOverlay.remove();
                                        backendLog('LuaTools: ImportAchievements response: ' + res);
                                        try {
                                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                            if (payload && payload.success) {
                                                const msg = `Successfully imported ${payload.imported || 0} achievements`;
                                                if (payload.failed > 0) {
                                                    msg += `, ${payload.failed} failed`;
                                                }
                                                ShowLuaToolsAlert('LuaTools', msg);
                                            } else {
                                                ShowLuaToolsAlert('LuaTools', payload.error || 'Import failed');
                                            }
                                        } catch (parseErr) {
                                            backendLog('LuaTools: Failed to parse import response: ' + parseErr);
                                            ShowLuaToolsAlert('LuaTools', 'Import completed but response could not be parsed.');
                                        }
                                    }, 500);
                                }).catch(function(err){
                                    clearInterval(progressInterval);
                                    loadingOverlay.remove();
                                    backendLog('LuaTools: Failed to import achievements: ' + err);
                                    ShowLuaToolsAlert('LuaTools', 'Failed to import achievements.');
                                });

                            } catch (parseErr) {
                                backendLog('LuaTools: JSON parse error: ' + parseErr.message);
                                ShowLuaToolsAlert('LuaTools', 'Invalid JSON file: ' + parseErr.message);
                            }
                        };

                        reader.readAsText(file);
                    });

                    // Trigger file selection
                    document.body.appendChild(fileInput);
                    fileInput.click();
                    document.body.removeChild(fileInput);
                });
            }

            if (devConsoleBtn) {
                devConsoleBtn.addEventListener('click', function(e){
                    e.preventDefault();
                    try { overlay.remove(); } catch(_) {}
                    showDevConsole();
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
                            ShowLuaToolsAlert('LuaTools', errText);
                            return;
                        }

                        Millennium.callServerMethod('luatools', 'GetGameInstallPath', { appid, contentScriptQuery: '' }).then(function(pathRes){
                            try {
                                let isGameInstalled = false;
                                const pathPayload = typeof pathRes === 'string' ? JSON.parse(pathRes) : pathRes;
                                if (pathPayload && pathPayload.success && pathPayload.installPath) {
                                    isGameInstalled = true;
                                    window.__LuaToolsGameInstallPath = pathPayload.installPath;
                                }
                                window.__LuaToolsGameIsInstalled = isGameInstalled;
                                try { overlay.remove(); } catch(_) {}
                                showFixesLoadingPopupAndCheck(appid);
                            } catch(err) {
                                backendLog('LuaTools: GetGameInstallPath error: ' + err);
                                try { overlay.remove(); } catch(_) {}
                            }
                        }).catch(function() {
                            try { overlay.remove(); } catch(_) {}
                            const errorText = t('menu.error.getPath', 'Error getting game path');
                            ShowLuaToolsAlert('LuaTools', errorText);
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
                                const doDelete = function() {
                                    try {
                                        Millennium.callServerMethod('luatools', 'DeleteLuaToolsForApp', { appid, contentScriptQuery: '' }).then(function(){
                                            try {
                                                window.__LuaToolsButtonInserted = false;
                                                window.__LuaToolsPresenceCheckInFlight = false;
                                                window.__LuaToolsPresenceCheckAppId = undefined;
                                                addLuaToolsButton();
                                                const successText = t('menu.remove.success', 'LuaTools removed for this app.');
                                                ShowLuaToolsAlert('LuaTools', successText);
                                            } catch(err) {
                                                backendLog('LuaTools: post-delete cleanup failed: ' + err);
                                            }
                                        }).catch(function(err){
                                            const failureText = t('menu.remove.failure', 'Failed to remove LuaTools.');
                                            const errMsg = (err && err.message) ? err.message : failureText;
                                            ShowLuaToolsAlert('LuaTools', errMsg);
                                        });
                                    } catch(err) {
                                        backendLog('LuaTools: doDelete failed: ' + err);
                                    }
                                };

                                removeBtn.style.display = 'flex';
                                removeBtn.onclick = function(e){
                                    e.preventDefault();
                                    try { overlay.remove(); } catch(_) {}
                                    const confirmMessage = t('menu.remove.confirm', 'Remove via LuaTools for this game?');
                                    showLuaToolsConfirm('LuaTools', confirmMessage, function(){
                                        doDelete();
                                    }, function(){
                                        try { showSettingsPopup(); } catch(_) {}
                                    });
                                };
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

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:450px;max-width:600px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;color:#fff;margin-bottom:20px;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.className = 'luatools-title';
        title.textContent = 'LuaTools';

        // API list container
        const apiListContainer = document.createElement('div');
        apiListContainer.className = 'luatools-api-list';
        apiListContainer.style.cssText = 'margin-bottom:16px;';

        // Placeholder while loading APIs
        const loadingItem = document.createElement('div');
        loadingItem.style.cssText = 'text-align:center;padding:10px;color:#8f98a0;font-size:13px;';
        loadingItem.textContent = lt('Loading APIs...');
        apiListContainer.appendChild(loadingItem);

        // Load APIs dynamically from backend
        if (typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
            Millennium.callServerMethod('luatools', 'GetApiList', { contentScriptQuery: '' }).then(function(res){
                try {
                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                    if (payload && payload.success && payload.apis && Array.isArray(payload.apis)) {
                        // Clear loading message
                        apiListContainer.innerHTML = '';

                        // Create API items
                        payload.apis.forEach((api, index) => {
                            const apiItem = document.createElement('div');
                            apiItem.className = `luatools-api-item luatools-api-${index}`;
                            apiItem.setAttribute('data-api-name', api.name);
                            apiItem.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:8px;background:rgba(42,71,94,0.3);border:1px solid rgba(102,192,244,0.2);border-radius:6px;transition:all 0.2s;';

                            const apiName = document.createElement('div');
                            apiName.className = 'luatools-api-name';
                            apiName.style.cssText = 'font-size:14px;color:#c7d5e0;font-weight:500;';
                            apiName.textContent = api.name;

                            const apiStatus = document.createElement('div');
                            apiStatus.className = 'luatools-api-status';
                            apiStatus.style.cssText = 'font-size:14px;color:#8f98a0;display:flex;align-items:center;gap:6px;';
                            apiStatus.innerHTML = '<span>' + lt('Waiting…') + '</span><i class="fa-solid fa-spinner" style="animation: spin 1.5s linear infinite;"></i>';

                            apiItem.appendChild(apiName);
                            apiItem.appendChild(apiStatus);
                            apiListContainer.appendChild(apiItem);
                        });
                    }
                } catch(err) {
                    backendLog('Failed to parse API list: ' + err);
                }
            }).catch(function(err){
                backendLog('Failed to load API list: ' + err);
            });
        }

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.4;margin-bottom:12px;color:#8f98a0;';
        body.className = 'luatools-status';
        body.textContent = lt('Checking availability…');

        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = 'background:rgba(42,71,94,0.5);height:20px;border-radius:4px;overflow:hidden;position:relative;display:none;border:1px solid rgba(102,192,244,0.3);margin-top:12px;';
        progressWrap.className = 'luatools-progress-wrap';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg, #66c0f4 0%, #a4d7f5 100%);transition:width 0.3s ease;box-shadow:0 0 10px rgba(102,192,244,0.5);';
        progressBar.className = 'luatools-progress-bar';
        progressWrap.appendChild(progressBar);

        const progressInfo = document.createElement('div');
        progressInfo.style.cssText = 'display:none;margin-top:8px;font-size:12px;color:#8f98a0;';
        progressInfo.className = 'luatools-progress-info';

        const percent = document.createElement('span');
        percent.className = 'luatools-percent';
        percent.textContent = '0%';

        const downloadSize = document.createElement('span');
        downloadSize.className = 'luatools-download-size';
        downloadSize.style.cssText = 'margin-left:12px;';
        downloadSize.textContent = '';

        progressInfo.appendChild(percent);
        progressInfo.appendChild(downloadSize);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:20px;display:flex;gap:8px;justify-content:flex-end;';
        const cancelBtn = document.createElement('a');
        cancelBtn.className = 'luatools-btn luatools-cancel-btn';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
        cancelBtn.href = '#';
        cancelBtn.style.display = 'none';
        cancelBtn.onclick = function(e){ e.preventDefault(); cancelOperation(); };
        const hideBtn = document.createElement('a');
        hideBtn.className = 'luatools-btn luatools-hide-btn';
        hideBtn.innerHTML = `<span>${lt('Hide')}</span>`;
        hideBtn.href = '#';
        hideBtn.onclick = function(e){ e.preventDefault(); cleanup(); };
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(hideBtn);

        modal.appendChild(title);
        modal.appendChild(apiListContainer);
        modal.appendChild(body);
        modal.appendChild(progressWrap);
        modal.appendChild(progressInfo);
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
            if (hideBtn) hideBtn.innerHTML = `<span>${lt('Close')}</span>`;
            // Hide progress UI
            const wrap = overlay.querySelector('.luatools-progress-wrap');
            const progressInfo = overlay.querySelector('.luatools-progress-info');
            if (wrap) wrap.style.display = 'none';
            if (progressInfo) progressInfo.style.display = 'none';
            // Reset run state
            runState.inProgress = false;
            runState.appid = null;
        }
    }

    // Fixes Results popup
    function showFixesResultsPopup(data, isGameInstalled) {
        if (document.querySelector('.luatools-fixes-results-overlay')) return;
        // Close other popups
        try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
        try { const s = document.querySelector('.luatools-settings-overlay'); if (s) s.remove(); } catch(_) {}
        try { const f = document.querySelector('.luatools-fixes-results-overlay'); if (f) f.remove(); } catch(_) {}
        try { const l = document.querySelector('.luatools-loading-fixes-overlay'); if (l) l.remove(); } catch(_) {}

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-fixes-results-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'position:relative;background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:580px;max-width:700px;max-height:80vh;display:flex;flex-direction:column;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid rgba(102,192,244,0.3);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:24px;color:#fff;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.textContent = lt('LuaTools · Fixes Menu');

        const iconButtons = document.createElement('div');
        iconButtons.style.cssText = 'display:flex;gap:12px;';

        function createIconButton(id, iconClass, titleKey, titleFallback) {
            const btn = document.createElement('a');
            btn.id = id;
            btn.href = '#';
            btn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(102,192,244,0.1);border:1px solid rgba(102,192,244,0.3);border-radius:10px;color:#66c0f4;font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;';
            btn.innerHTML = '<i class="fa-solid ' + iconClass + '"></i>';
            btn.title = t(titleKey, titleFallback);
            btn.onmouseover = function() { this.style.background = 'rgba(102,192,244,0.25)'; this.style.transform = 'translateY(-2px) scale(1.05)'; this.style.boxShadow = '0 8px 16px rgba(102,192,244,0.3)'; this.style.borderColor = '#66c0f4'; };
            btn.onmouseout = function() { this.style.background = 'rgba(102,192,244,0.1)'; this.style.transform = 'translateY(0) scale(1)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(102,192,244,0.3)'; };
            iconButtons.appendChild(btn);
            return btn;
        }

        const discordBtn = createIconButton('lt-fixes-discord', 'fa-brands fa-discord', 'menu.discord', 'Discord');
        const settingsBtn = createIconButton('lt-fixes-settings', 'fa-gear', 'menu.settings', 'Settings');
        const closeIconBtn = createIconButton('lt-fixes-close', 'fa-xmark', 'settings.close', 'Close');

        const body = document.createElement('div');
        body.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:20px;border:1px solid rgba(102,192,244,0.3);border-radius:12px;background:rgba(11,20,30,0.6);';

        try {
            const bannerImg = document.querySelector('.game_header_image_full');
            if (bannerImg && bannerImg.src) {
                body.style.background = `linear-gradient(to bottom, rgba(11, 20, 30, 0.85), #0b141e 70%), url('${bannerImg.src}') no-repeat top center`;
                body.style.backgroundSize = 'cover';
            }
        } catch(_) {}

        const gameHeader = document.createElement('div');
        gameHeader.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;';

        const gameIcon = document.createElement('img');
        gameIcon.style.cssText = 'width:32px;height:32px;border-radius:4px;object-fit:cover;display:none;';
        try {
            const iconImg = document.querySelector('.apphub_AppIcon img');
            if (iconImg && iconImg.src) {
                gameIcon.src = iconImg.src;
                gameIcon.style.display = 'block';
            }
        } catch(_) {}

        const gameName = document.createElement('div');
        gameName.style.cssText = 'font-size:22px;color:#fff;font-weight:600;text-align:center;';
        gameName.textContent = data.gameName || lt('Unknown Game');

        const contentContainer = document.createElement('div');
        contentContainer.style.position = 'relative';
        contentContainer.style.zIndex = '1';

        const columnsContainer = document.createElement('div');
        columnsContainer.style.cssText = 'display:flex;gap:16px;';

        const leftColumn = document.createElement('div');
        leftColumn.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:16px;';

        const rightColumn = document.createElement('div');
        rightColumn.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:16px;';

        function createFixButton(label, text, icon, isSuccess, onClick) {
            const section = document.createElement('div');
            section.style.cssText = 'width:100%;text-align:center;';

            const sectionLabel = document.createElement('div');
            sectionLabel.style.cssText = 'font-size:12px;color:#66c0f4;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:1px;';
            sectionLabel.textContent = label;

            const btn = document.createElement('a');
            btn.href = '#';
            btn.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:14px 24px;background:linear-gradient(135deg, rgba(102,192,244,0.15) 0%, rgba(102,192,244,0.05) 100%);border:1px solid rgba(102,192,244,0.3);border-radius:12px;color:#fff;font-size:15px;font-weight:500;text-decoration:none;transition:all 0.3s ease;cursor:pointer;';
            btn.innerHTML = '<i class="fa-solid ' + icon + '" style="font-size:16px;"></i><span>' + text + '</span>';

            if (isSuccess) {
                btn.style.background = 'linear-gradient(135deg, rgba(92,156,62,0.4) 0%, rgba(92,156,62,0.2) 100%)';
                btn.style.borderColor = 'rgba(92,156,62,0.6)';
                btn.onmouseover = function() { this.style.background = 'linear-gradient(135deg, rgba(92,156,62,0.6) 0%, rgba(92,156,62,0.3) 100%)'; this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 8px 20px rgba(92,156,62,0.3)'; this.style.borderColor = '#79c754'; };
                btn.onmouseout = function() { this.style.background = 'linear-gradient(135deg, rgba(92,156,62,0.4) 0%, rgba(92,156,62,0.2) 100%)'; this.style.transform = 'translateY(0)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(92,156,62,0.6)'; };
            } else if (isSuccess === false) {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.onmouseover = function() { this.style.background = 'linear-gradient(135deg, rgba(102,192,244,0.3) 0%, rgba(102,192,244,0.15) 100%)'; this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 8px 20px rgba(102,192,244,0.25)'; this.style.borderColor = '#66c0f4'; };
                btn.onmouseout = function() { this.style.background = 'linear-gradient(135deg, rgba(102,192,244,0.15) 0%, rgba(102,192,244,0.05) 100%)'; this.style.transform = 'translateY(0)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(102,192,244,0.3)'; };
            }

            btn.onclick = onClick;

            section.appendChild(sectionLabel);
            section.appendChild(btn);
            return section;
        }

        // left thing in fixes modal
        const genericStatus = data.genericFix.status;
        const genericSection = createFixButton(
            lt('Generic Fix'),
            genericStatus === 200 ? lt('Apply') : lt('No generic fix'),
            genericStatus === 200 ? 'fa-check' : 'fa-circle-xmark',
            genericStatus === 200 ? true : false,
            function(e) {
                e.preventDefault();
                if (genericStatus === 200 && isGameInstalled) {
                    const genericUrl = 'https://files.luatools.work/GameBypasses/' + data.appid + '.zip';
                    applyFix(data.appid, genericUrl, lt('Generic Fix'), data.gameName, overlay);
                }
            }
        );
        leftColumn.appendChild(genericSection);

        if (!isGameInstalled) {
            genericSection.querySelector('a').style.opacity = '0.5';
            genericSection.querySelector('a').style.cursor = 'not-allowed';
        }

        const onlineStatus = data.onlineFix.status;
        const onlineSection = createFixButton(
            lt('Online Fix'),
            onlineStatus === 200 ? lt('Apply') : lt('No online-fix'),
            onlineStatus === 200 ? 'fa-check' : 'fa-circle-xmark',
            onlineStatus === 200 ? true : false,
            function(e) {
                e.preventDefault();
                if (onlineStatus === 200 && isGameInstalled) {
                    const onlineUrl = data.onlineFix.url || ('https://files.luatools.work/OnlineFix1/' + data.appid + '.zip');
                    applyFix(data.appid, onlineUrl, lt('Online Fix'), data.gameName, overlay);
                }
            }
        );
        leftColumn.appendChild(onlineSection);

        if (!isGameInstalled) {
            onlineSection.querySelector('a').style.opacity = '0.5';
            onlineSection.querySelector('a').style.cursor = 'not-allowed';
        }

        // right
        const aioSection = createFixButton(
            lt('All-In-One Fixes'),
            lt('Online Fix (Unsteam)'),
            'fa-globe',
            null, // default blue button
            function(e) {
                e.preventDefault();
                if (isGameInstalled) {
                    const downloadUrl = 'https://github.com/madoiscool/lt_api_links/releases/download/unsteam/Win64.zip';
                    applyFix(data.appid, downloadUrl, lt('Online Fix (Unsteam)'), data.gameName, overlay);
                }
            }
        );
        rightColumn.appendChild(aioSection);
        if (!isGameInstalled) {
            aioSection.querySelector('a').style.opacity = '0.5';
            aioSection.querySelector('a').style.cursor = 'not-allowed';
        }

        const unfixSection = createFixButton(
            lt('Manage Game'),
            lt('Un-Fix (verify game)'),
            'fa-trash',
            null, // ^^
            function(e) {
                e.preventDefault();
                if (isGameInstalled) {
                    try { overlay.remove(); } catch(_) {}
                    showLuaToolsConfirm('LuaTools', lt('Are you sure you want to un-fix? This will remove fix files and verify game files.'),
                        function() { startUnfix(data.appid); },
                        function() { showFixesResultsPopup(data, isGameInstalled); }
                    );
                }
            }
        );
        rightColumn.appendChild(unfixSection);
        if (!isGameInstalled) {
            unfixSection.querySelector('a').style.opacity = '0.5';
            unfixSection.querySelector('a').style.cursor = 'not-allowed';
        }

        // Credit message
        const creditMsg = document.createElement('div');
        creditMsg.style.cssText = 'margin-top:16px;text-align:center;font-size:13px;color:#8f98a0;';
        const creditTemplate = lt('Only possible thanks to {name} 💜');
        creditMsg.innerHTML = creditTemplate.replace('{name}', '<a href="#" id="lt-shayenvi-link" style="color:#66c0f4;text-decoration:none;font-weight:600;">ShayneVi</a>');
        
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

        // body moment
        gameHeader.appendChild(gameIcon);
        gameHeader.appendChild(gameName);
        contentContainer.appendChild(gameHeader);

        if (!isGameInstalled) {
            const notInstalledWarning = document.createElement('div');
            notInstalledWarning.style.cssText = 'margin-bottom: 16px; padding: 12px; background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 6px; color: #ffc107; font-size: 13px; text-align: center;';
            notInstalledWarning.innerHTML = '<i class="fa-solid fa-circle-info" style="margin-right: 8px;"></i>' + t('menu.error.notInstalled', 'Game is not installed');
            contentContainer.appendChild(notInstalledWarning);
        }

        columnsContainer.appendChild(leftColumn);
        columnsContainer.appendChild(rightColumn);
        contentContainer.appendChild(columnsContainer);
        contentContainer.appendChild(creditMsg);
        body.appendChild(contentContainer);

        // header moment
        header.appendChild(title);
        header.appendChild(iconButtons);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'flex:0 0 auto;margin-top:16px;display:flex;gap:8px;justify-content:space-between;align-items:center;';

        const rightButtons = document.createElement('div');
        rightButtons.style.cssText = 'display:flex;gap:8px;';
        const gameFolderBtn = document.createElement('a');
        gameFolderBtn.className = 'luatools-btn';
        gameFolderBtn.innerHTML = `<span><i class="fa-solid fa-folder" style="margin-right: 8px;"></i>${lt('Game folder')}</span>`;
        gameFolderBtn.href = '#';
        gameFolderBtn.onclick = function(e){ 
            e.preventDefault(); 
            if (window.__LuaToolsGameInstallPath) {
                try {
                    Millennium.callServerMethod('luatools', 'OpenGameFolder', { path: window.__LuaToolsGameInstallPath, contentScriptQuery: '' });
                } catch(err) { backendLog('LuaTools: Failed to open game folder: ' + err); }
            }
        };
        rightButtons.appendChild(gameFolderBtn);

        const backBtn = document.createElement('a');
        backBtn.className = 'luatools-btn';
        backBtn.innerHTML = '<span><i class="fa-solid fa-arrow-left"></i></span>';
        backBtn.href = '#';
        backBtn.onclick = function(e){
            e.preventDefault();
            try { overlay.remove(); } catch(_) {}
            showSettingsPopup();
        };
        btnRow.appendChild(backBtn);
        btnRow.appendChild(rightButtons);

        // final modal
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(btnRow);  
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        closeIconBtn.onclick = function(e) { e.preventDefault(); overlay.remove(); };
        discordBtn.onclick = function(e) {
            e.preventDefault();
            try { overlay.remove(); } catch(_) {}
            const url = 'https://discord.gg/luatools';
            try { Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url, contentScriptQuery: '' }); } catch(_) {}
        };
        settingsBtn.onclick = function(e) {
            e.preventDefault();
            try { overlay.remove(); } catch(_) {}
            showSettingsManagerPopup(false, function() { showFixesResultsPopup(data, isGameInstalled); });
        };

        function startUnfix(appid) {
            try {
                Millennium.callServerMethod('luatools', 'UnFixGame', { appid: appid, installPath: window.__LuaToolsGameInstallPath, contentScriptQuery: '' }).then(function(res){
                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                    if (payload && payload.success) {
                        showUnfixProgress(appid);
                    } else {
                        const errorKey = (payload && payload.error) ? String(payload.error) : '';
                        const errorMsg = (errorKey && (errorKey.startsWith('menu.error.') || errorKey.startsWith('common.'))) ? t(errorKey) : (errorKey || lt('Failed to start un-fix'));
                        ShowLuaToolsAlert('LuaTools', errorMsg);
                    }
                }).catch(function(){
                    const msg = lt('Error starting un-fix');
                    ShowLuaToolsAlert('LuaTools', msg);
                });
            } catch(err) { backendLog('LuaTools: Un-Fix start error: ' + err); }
        }
    }

    function showFixesLoadingPopupAndCheck(appid) {
        if (document.querySelector('.luatools-loading-fixes-overlay')) return;
        try { const d = document.querySelector('.luatools-overlay'); if (d) d.remove(); } catch(_) {}
        try { const s = document.querySelector('.luatools-settings-overlay'); if (s) s.remove(); } catch(_) {}
        try { const f = document.querySelector('.luatools-fixes-overlay'); if (f) f.remove(); } catch(_) {}

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-loading-fixes-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:400px;max-width:560px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;color:#fff;margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.textContent = lt('Loading fixes...');

        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:16px;color:#c7d5e0;';
        body.textContent = lt('Checking availability…');

        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = 'background:rgba(42,71,94,0.5);height:12px;border-radius:4px;overflow:hidden;position:relative;border:1px solid rgba(102,192,244,0.3);';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg, #66c0f4 0%, #a4d7f5 100%);transition:width 0.2s linear;box-shadow:0 0 10px rgba(102,192,244,0.5);';
        progressWrap.appendChild(progressBar);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(progressWrap);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        let progress = 0;
        const progressInterval = setInterval(function() {
            if (progress < 95) {
                progress += Math.random() * 5;
                progressBar.style.width = Math.min(progress, 95) + '%';
            }
        }, 200);

        Millennium.callServerMethod('luatools', 'CheckForFixes', { appid, contentScriptQuery: '' }).then(function(res){
            const payload = typeof res === 'string' ? JSON.parse(res) : res;
            if (payload && payload.success) {
                const isGameInstalled = window.__LuaToolsGameIsInstalled === true;
                showFixesResultsPopup(payload, isGameInstalled);
            } else {
                const errText = (payload && payload.error) ? String(payload.error) : lt('Failed to check for fixes.');
                ShowLuaToolsAlert('LuaTools', errText);
            }
        }).catch(function() {
            const msg = lt('Error checking for fixes');
            ShowLuaToolsAlert('LuaTools', msg);
        }).finally(function() {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            setTimeout(function() {
                try {
                    const l = document.querySelector('.luatools-loading-fixes-overlay');
                    if (l) l.remove();
                } catch(_) {}
            }, 300);
        });
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
                ShowLuaToolsAlert('LuaTools', msg);
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
                        ShowLuaToolsAlert('LuaTools', errorMsg);
                    }
                } catch(err) {
                    backendLog('LuaTools: ApplyGameFix response error: ' + err);
                    const msg = lt('Error applying fix');
                    ShowLuaToolsAlert('LuaTools', msg);
                }
            }).catch(function(err){
                backendLog('LuaTools: ApplyGameFix error: ' + err);
                const msg = lt('Error applying fix');
                ShowLuaToolsAlert('LuaTools', msg);
            });
        } catch(err) {
            backendLog('LuaTools: applyFix error: ' + err);
        }
    }

    // Show fix download progress popup
    function showFixDownloadProgress(appid, fixType) {
        // Reuse the download popup UI from Add via LuaTools
        if (document.querySelector('.luatools-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:400px;max-width:560px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;color:#fff;margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.textContent = lt('Applying {fix}').replace('{fix}', fixType);

        const body = document.createElement('div');
        body.style.cssText = 'font-size:15px;line-height:1.6;margin-bottom:20px;color:#c7d5e0;';
        body.innerHTML = '<div id="lt-fix-progress-msg">' + lt('Downloading...') + '</div>';

        const btnRow = document.createElement('div');
        btnRow.className = 'lt-fix-btn-row';
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:12px;justify-content:center;';

        const hideBtn = document.createElement('a');
        hideBtn.href = '#';
        hideBtn.className = 'luatools-btn';
        hideBtn.style.flex = '1';
        hideBtn.innerHTML = `<span>${lt('Hide')}</span>`;
        hideBtn.onclick = function(e){ e.preventDefault(); overlay.remove(); };
        btnRow.appendChild(hideBtn);

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'luatools-btn primary';
        cancelBtn.style.flex = '1';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
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
                    ShowLuaToolsAlert('LuaTools', msg);
                }
            }).catch(function(err){
                cancelBtn.dataset.pending = '0';
                const span2 = cancelBtn.querySelector('span');
                if (span2) span2.textContent = lt('Cancel');
                const msgEl2 = document.getElementById('lt-fix-progress-msg');
                if (msgEl2 && msgEl2.dataset.last) msgEl2.textContent = msgEl2.dataset.last;
                backendLog('LuaTools: CancelApplyFix error: ' + err);
                const msg = lt('Failed to cancel fix download');
                ShowLuaToolsAlert('LuaTools', msg);
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
        btnRow.style.cssText = 'margin-top:16px;display:flex;justify-content:flex-end;';
        const closeBtn = document.createElement('a');
        closeBtn.href = '#';
        closeBtn.className = 'luatools-btn primary';
        closeBtn.style.minWidth = '140px';
        closeBtn.innerHTML = `<span>${lt('Close')}</span>`;
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

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-unfix-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:400px;max-width:560px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;color:#fff;margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.textContent = lt('Un-Fixing game');

        const body = document.createElement('div');
        body.style.cssText = 'font-size:15px;line-height:1.6;margin-bottom:20px;color:#c7d5e0;';
        body.innerHTML = '<div id="lt-unfix-progress-msg">' + lt('Removing fix files...') + '</div>';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;justify-content:center;';
        const hideBtn = document.createElement('a');
        hideBtn.href = '#';
        hideBtn.className = 'luatools-btn';
        hideBtn.style.minWidth = '140px';
        hideBtn.innerHTML = `<span>${lt('Hide')}</span>`;
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
                                        closeBtn.href = '#';
                                        closeBtn.className = 'luatools-btn primary';
                                        closeBtn.style.minWidth = '140px';
                                        closeBtn.innerHTML = `<span>${lt('Close')}</span>`;
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
                                        closeBtn.href = '#';
                                        closeBtn.className = 'luatools-btn primary';
                                        closeBtn.style.minWidth = '140px';
                                        closeBtn.innerHTML = `<span>${lt('Close')}</span>`;
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

    function showSettingsManagerPopup(forceRefresh, onBack) {
        if (document.querySelector('.luatools-settings-manager-overlay')) return;

        try { const mainOverlay = document.querySelector('.luatools-settings-overlay'); if (mainOverlay) mainOverlay.remove(); } catch(_) {}

        ensureLuaToolsStyles();
        ensureFontAwesome();

        const overlay = document.createElement('div');
        overlay.className = 'luatools-settings-manager-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'position:relative;background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:650px;max-width:750px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:28px 32px 16px;border-bottom:2px solid rgba(102,192,244,0.3);';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:24px;color:#fff;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        title.textContent = t('settings.title', 'LuaTools · Settings');

        const iconButtons = document.createElement('div');
        iconButtons.style.cssText = 'display:flex;gap:12px;';

        const discordIconBtn = document.createElement('a');
        discordIconBtn.href = '#';
        discordIconBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(102,192,244,0.1);border:1px solid rgba(102,192,244,0.3);border-radius:10px;color:#66c0f4;font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;';
        discordIconBtn.innerHTML = '<i class="fa-brands fa-discord"></i>';
        discordIconBtn.title = t('menu.discord', 'Discord');
        discordIconBtn.onmouseover = function() { this.style.background = 'rgba(102,192,244,0.25)'; this.style.transform = 'translateY(-2px) scale(1.05)'; this.style.boxShadow = '0 8px 16px rgba(102,192,244,0.3)'; this.style.borderColor = '#66c0f4'; };
        discordIconBtn.onmouseout = function() { this.style.background = 'rgba(102,192,244,0.1)'; this.style.transform = 'translateY(0) scale(1)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(102,192,244,0.3)'; };
        iconButtons.appendChild(discordIconBtn);

        const closeIconBtn = document.createElement('a');
        closeIconBtn.href = '#';
        closeIconBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(102,192,244,0.1);border:1px solid rgba(102,192,244,0.3);border-radius:10px;color:#66c0f4;font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;';
        closeIconBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeIconBtn.title = t('settings.close', 'Close');
        closeIconBtn.onmouseover = function() { this.style.background = 'rgba(102,192,244,0.25)'; this.style.transform = 'translateY(-2px) scale(1.05)'; this.style.boxShadow = '0 8px 16px rgba(102,192,244,0.3)'; this.style.borderColor = '#66c0f4'; };
        closeIconBtn.onmouseout = function() { this.style.background = 'rgba(102,192,244,0.1)'; this.style.transform = 'translateY(0) scale(1)'; this.style.boxShadow = 'none'; this.style.borderColor = 'rgba(102,192,244,0.3)'; };
        iconButtons.appendChild(closeIconBtn);

        const contentWrap = document.createElement('div');
        contentWrap.style.cssText = 'flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:20px;margin:0 24px;border:1px solid rgba(102,192,244,0.3);border-radius:12px;background:rgba(11,20,30,0.6);';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'padding:20px 24px 24px;display:flex;gap:12px;justify-content:space-between;align-items:center;';

        const backBtn = createSettingsButton('back', '<i class="fa-solid fa-arrow-left"></i>');
        const rightButtons = document.createElement('div');
        rightButtons.style.cssText = 'display:flex;gap:8px;';
        const refreshBtn = createSettingsButton('refresh', '<i class="fa-solid fa-arrow-rotate-right"></i>');
        const saveBtn = createSettingsButton('save', '<i class="fa-solid fa-floppy-disk"></i>', true);

        modal.appendChild(header);
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
        let backDefaultLabel = '';

        function createSettingsButton(id, text, isPrimary) {
            const btn = document.createElement('a');
            btn.id = 'lt-settings-' + id;
            btn.href = '#';
            btn.innerHTML = '<span>' + text + '</span>';

            btn.className = 'luatools-btn';
            if (isPrimary) {
                btn.classList.add('primary');
            }

            btn.onmouseover = function() {
                if (this.dataset.disabled === '1') {
                    this.style.opacity = '0.6';
                    this.style.cursor = 'not-allowed';
                    return;
                }
            };

            btn.onmouseout = function() {
                if (this.dataset.disabled === '1') {
                    this.style.opacity = '0.5';
                    return;
                }
            };

            if (isPrimary) {
                btn.dataset.disabled = '1';
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }

            return btn;
        }

        header.appendChild(title);
        header.appendChild(iconButtons);
        function applyStaticTranslations() {
            title.textContent = t('settings.title', 'LuaTools · Settings');
            refreshBtn.title = t('settings.refresh', 'Refresh');
            saveBtn.title = t('settings.save', 'Save Settings');
            backBtn.title = t('Back', 'Back');
            discordIconBtn.title = t('menu.discord', 'Discord');
            closeIconBtn.title = t('settings.close', 'Close');
        }
        applyStaticTranslations();

        function setStatus(text, color) {
            let statusLine = contentWrap.querySelector('.luatools-settings-status');
            if (!statusLine) {
                statusLine = document.createElement('div');
                statusLine.className = 'luatools-settings-status';
                statusLine.style.cssText = 'font-size:13px;margin-top:10px;transform:translateY(15px);color:#c7d5e0;min-height:18px;text-align:center;';  // may god have mercy upon your soul for witnessing this translateY
                contentWrap.insertBefore(statusLine, contentWrap.firstChild);
            }
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
                saveBtn.style.cursor = 'pointer';
            } else {
                saveBtn.dataset.disabled = '1';
                saveBtn.style.opacity = '0.6';
                saveBtn.style.cursor = 'not-allowed';
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
                groupEl.style.cssText = 'margin-bottom:18px;';

                const groupTitle = document.createElement('div');
                groupTitle.textContent = t('settings.' + group.key, group.label || group.key);
                if (group.key === 'general') {
                    groupTitle.style.cssText = 'font-size:22px;color:#fff;margin-bottom:16px;margin-top:-25px;font-weight:600;text-align:center;'; // dw abt this margin-top -25px 🇧🇷 don't even look at it
                } else {
                    groupTitle.style.cssText = 'font-size:15px;font-weight:600;color:#66c0f4;text-align:center;';
                }
                groupEl.appendChild(groupTitle);

                if (group.description && group.key !== 'general') {
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
                    if (j === 0) {
                        optionEl.style.cssText = 'margin-top:12px;padding-top:0;';
                    } else {
                        optionEl.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid rgba(102,192,244,0.1);';
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

            // Render Installed Fixes section
            renderInstalledFixesSection();

            // Render Installed Lua Scripts section
            renderInstalledLuaSection();

            updateSaveState();
        }

        function renderInstalledFixesSection() {
            const sectionEl = document.createElement('div');
            sectionEl.id = 'luatools-installed-fixes-section';
            sectionEl.style.cssText = 'margin-top:36px;padding:24px;background:linear-gradient(135deg, rgba(102,192,244,0.05) 0%, rgba(74,158,206,0.08) 100%);border:2px solid rgba(74,158,206,0.3);border-radius:14px;box-shadow:0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);position:relative;overflow:hidden;';

            const sectionGlow = document.createElement('div');
            sectionGlow.style.cssText = 'position:absolute;top:-100%;left:-100%;width:300%;height:300%;background:radial-gradient(circle, rgba(102,192,244,0.08) 0%, transparent 70%);pointer-events:none;';
            sectionEl.appendChild(sectionGlow);

            const sectionTitle = document.createElement('div');
            sectionTitle.style.cssText = 'font-size:22px;color:#66c0f4;margin-bottom:20px;font-weight:700;text-align:center;text-shadow:0 2px 10px rgba(102,192,244,0.5);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;position:relative;z-index:1;letter-spacing:0.5px;';
            sectionTitle.innerHTML = '<i class="fa-solid fa-wrench" style="margin-right:10px;"></i>' + t('settings.installedFixes.title', 'Installed Fixes');
            sectionEl.appendChild(sectionTitle);

            const listContainer = document.createElement('div');
            listContainer.id = 'luatools-fixes-list';
            listContainer.style.cssText = 'min-height:50px;';
            sectionEl.appendChild(listContainer);

            contentWrap.appendChild(sectionEl);

            loadInstalledFixes(listContainer);
        }

        function loadInstalledFixes(container) {
            container.innerHTML = '<div style="padding:14px;text-align:center;color:#c7d5e0;">' + t('settings.installedFixes.loading', 'Scanning for installed fixes...') + '</div>';

            Millennium.callServerMethod('luatools', 'GetInstalledFixes', { contentScriptQuery: '' })
                .then(function(res) {
                    const response = typeof res === 'string' ? JSON.parse(res) : res;
                    if (!response || !response.success) {
                        container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">' + t('settings.installedFixes.error', 'Failed to load installed fixes.') + '</div>';
                        return;
                    }

                    const fixes = Array.isArray(response.fixes) ? response.fixes : [];
                    if (fixes.length === 0) {
                        container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #2a475e;border-radius:4px;color:#c7d5e0;text-align:center;">' + t('settings.installedFixes.empty', 'No fixes installed yet.') + '</div>';
                        return;
                    }

                    container.innerHTML = '';
                    for (let i = 0; i < fixes.length; i++) {
                        const fix = fixes[i];
                        const fixEl = createFixListItem(fix, container);
                        container.appendChild(fixEl);
                    }
                })
                .catch(function(err) {
                    container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">' + t('settings.installedFixes.error', 'Failed to load installed fixes.') + '</div>';
                });
        }

        function createFixListItem(fix, container) {
            const itemEl = document.createElement('div');
            itemEl.style.cssText = 'margin-bottom:12px;padding:14px;background:rgba(11,20,30,0.8);border:1px solid rgba(102,192,244,0.3);border-radius:6px;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s ease;';
            itemEl.onmouseover = function() { this.style.borderColor = '#66c0f4'; this.style.background = 'rgba(11,20,30,0.95)'; };
            itemEl.onmouseout = function() { this.style.borderColor = 'rgba(102,192,244,0.3)'; this.style.background = 'rgba(11,20,30,0.8)'; };

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';

            const gameName = document.createElement('div');
            gameName.style.cssText = 'font-size:15px;font-weight:600;color:#fff;margin-bottom:6px;';
            gameName.textContent = fix.gameName || 'Unknown Game (' + fix.appid + ')';
            infoDiv.appendChild(gameName);

            const detailsDiv = document.createElement('div');
            detailsDiv.style.cssText = 'font-size:12px;color:#a9b2c3;line-height:1.6;';

            if (fix.fixType) {
                const typeSpan = document.createElement('div');
                typeSpan.innerHTML = '<strong style="color:#66c0f4;">' + t('settings.installedFixes.type', 'Type:') + '</strong> ' + fix.fixType;
                detailsDiv.appendChild(typeSpan);
            }

            if (fix.date) {
                const dateSpan = document.createElement('div');
                dateSpan.innerHTML = '<strong style="color:#66c0f4;">' + t('settings.installedFixes.date', 'Installed:') + '</strong> ' + fix.date;
                detailsDiv.appendChild(dateSpan);
            }

            if (fix.filesCount > 0) {
                const filesSpan = document.createElement('div');
                filesSpan.innerHTML = '<strong style="color:#66c0f4;">' + t('settings.installedFixes.files', '{count} files').replace('{count}', fix.filesCount) + '</strong>';
                detailsDiv.appendChild(filesSpan);
            }

            infoDiv.appendChild(detailsDiv);
            itemEl.appendChild(infoDiv);

            const deleteBtn = document.createElement('a');
            deleteBtn.href = '#';
            deleteBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(255,80,80,0.12);border:2px solid rgba(255,80,80,0.35);border-radius:12px;color:#ff5050;font-size:18px;text-decoration:none;transition:all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);cursor:pointer;flex-shrink:0;';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = t('settings.installedFixes.delete', 'Delete');
            deleteBtn.onmouseover = function() {
                this.style.background = 'rgba(255,80,80,0.25)';
                this.style.borderColor = 'rgba(255,80,80,0.6)';
                this.style.color = '#ff6b6b';
                this.style.transform = 'translateY(-2px) scale(1.05)';
                this.style.boxShadow = '0 6px 20px rgba(255,80,80,0.4), 0 0 0 4px rgba(255,80,80,0.1)';
            };
            deleteBtn.onmouseout = function() {
                this.style.background = 'rgba(255,80,80,0.12)';
                this.style.borderColor = 'rgba(255,80,80,0.35)';
                this.style.color = '#ff5050';
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = 'none';
            };

            deleteBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (deleteBtn.dataset.busy === '1') return;

                showLuaToolsConfirm(
                    fix.gameName || 'LuaTools',
                    t('settings.installedFixes.deleteConfirm', 'Are you sure you want to remove this fix? This will delete fix files and run Steam verification.'),
                    function() {
                        // User confirmed
                        deleteBtn.dataset.busy = '1';
                        deleteBtn.style.opacity = '0.6';
                        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                        Millennium.callServerMethod('luatools', 'UnFixGame', {
                            appid: fix.appid,
                            installPath: fix.installPath || '',
                            fixDate: fix.date || '',
                            contentScriptQuery: ''
                        })
                        .then(function(res) {
                            const response = typeof res === 'string' ? JSON.parse(res) : res;
                            if (!response || !response.success) {
                                alert(t('settings.installedFixes.deleteError', 'Failed to remove fix.'));
                                deleteBtn.dataset.busy = '0';
                                deleteBtn.style.opacity = '1';
                                deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedFixes.delete', 'Delete') + '</span>';
                                return;
                            }

                            // Poll for unfix status
                            pollUnfixStatus(fix.appid, itemEl, deleteBtn, container);
                        })
                        .catch(function(err) {
                            alert(t('settings.installedFixes.deleteError', 'Failed to remove fix.') + ' ' + (err && err.message ? err.message : ''));
                            deleteBtn.dataset.busy = '0';
                            deleteBtn.style.opacity = '1';
                            deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedFixes.delete', 'Delete') + '</span>';
                        });
                    },
                    function() {
                        // User cancelled - do nothing
                    }
                );
            });

            itemEl.appendChild(deleteBtn);
            return itemEl;
        }

        function pollUnfixStatus(appid, itemEl, deleteBtn, container) {
            let pollCount = 0;
            const maxPolls = 60;

            function checkStatus() {
                if (pollCount >= maxPolls) {
                    alert(t('settings.installedFixes.deleteError', 'Failed to remove fix.') + ' (Timeout)');
                    deleteBtn.dataset.busy = '0';
                    deleteBtn.style.opacity = '1';
                    deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedFixes.delete', 'Delete') + '</span>';
                    return;
                }

                pollCount++;

                Millennium.callServerMethod('luatools', 'GetUnfixStatus', { appid: appid, contentScriptQuery: '' })
                    .then(function(res) {
                        const response = typeof res === 'string' ? JSON.parse(res) : res;
                        if (!response || !response.success) {
                            setTimeout(checkStatus, 500);
                            return;
                        }

                        const state = response.state || {};
                        const status = state.status;

                        if (status === 'done' && state.success) {
                            // Success - remove item from list with animation
                            itemEl.style.transition = 'all 0.3s ease';
                            itemEl.style.opacity = '0';
                            itemEl.style.transform = 'translateX(-20px)';
                            setTimeout(function() {
                                itemEl.remove();
                                // Check if list is now empty
                                if (container.children.length === 0) {
                                    container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #2a475e;border-radius:4px;color:#c7d5e0;text-align:center;">' + t('settings.installedFixes.empty', 'No fixes installed yet.') + '</div>';
                                }
                            }, 300);
                            
                            // Trigger Steam verification after a short delay
                            setTimeout(function(){
                                try {
                                    const verifyUrl = 'steam://validate/' + appid;
                                    window.location.href = verifyUrl;
                                    backendLog('LuaTools: Running verify for appid ' + appid);
                                } catch(_) {}
                            }, 1000);
                            
                            return;
                        } else if (status === 'failed' || (status === 'done' && !state.success)) {
                            alert(t('settings.installedFixes.deleteError', 'Failed to remove fix.') + ' ' + (state.error || ''));
                            deleteBtn.dataset.busy = '0';
                            deleteBtn.style.opacity = '1';
                            deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedFixes.delete', 'Delete') + '</span>';
                            return;
                        } else {
                            // Still in progress
                            setTimeout(checkStatus, 500);
                        }
                    })
                    .catch(function(err) {
                        setTimeout(checkStatus, 500);
                    });
            }

            checkStatus();
        }

        function renderInstalledLuaSection() {
            const sectionEl = document.createElement('div');
            sectionEl.id = 'luatools-installed-lua-section';
            sectionEl.style.cssText = 'margin-top:24px;padding:24px;background:linear-gradient(135deg, rgba(138,102,244,0.05) 0%, rgba(102,138,244,0.08) 100%);border:2px solid rgba(138,102,244,0.3);border-radius:14px;box-shadow:0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);position:relative;overflow:hidden;';

            const sectionGlow = document.createElement('div');
            sectionGlow.style.cssText = 'position:absolute;top:-100%;left:-100%;width:300%;height:300%;background:radial-gradient(circle, rgba(138,102,244,0.08) 0%, transparent 70%);pointer-events:none;';
            sectionEl.appendChild(sectionGlow);

            const sectionTitle = document.createElement('div');
            sectionTitle.style.cssText = 'font-size:22px;color:#a68aff;margin-bottom:20px;font-weight:700;text-align:center;text-shadow:0 2px 10px rgba(138,102,244,0.5);background:linear-gradient(135deg, #a68aff 0%, #c7b5ff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;position:relative;z-index:1;letter-spacing:0.5px;';
            sectionTitle.innerHTML = '<i class="fa-solid fa-code" style="margin-right:10px;"></i>' + t('settings.installedLua.title', 'Installed Lua Scripts');
            sectionEl.appendChild(sectionTitle);

            const listContainer = document.createElement('div');
            listContainer.id = 'luatools-lua-list';
            listContainer.style.cssText = 'min-height:50px;';
            sectionEl.appendChild(listContainer);

            contentWrap.appendChild(sectionEl);

            loadInstalledLuaScripts(listContainer);
        }

        function loadInstalledLuaScripts(container) {
            container.innerHTML = '<div style="padding:14px;text-align:center;color:#c7d5e0;">' + t('settings.installedLua.loading', 'Scanning for installed Lua scripts...') + '</div>';

            Millennium.callServerMethod('luatools', 'GetInstalledLuaScripts', { contentScriptQuery: '' })
                .then(function(res) {
                    const response = typeof res === 'string' ? JSON.parse(res) : res;
                    if (!response || !response.success) {
                        container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">' + t('settings.installedLua.error', 'Failed to load installed Lua scripts.') + '</div>';
                        return;
                    }

                    const scripts = Array.isArray(response.scripts) ? response.scripts : [];
                    if (scripts.length === 0) {
                        container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #2a475e;border-radius:4px;color:#c7d5e0;text-align:center;">' + t('settings.installedLua.empty', 'No Lua scripts installed yet.') + '</div>';
                        return;
                    }

                    container.innerHTML = '';

                    // Check if there are any unknown games
                    const hasUnknownGames = scripts.some(function(s) {
                        return s.gameName && s.gameName.startsWith('Unknown Game');
                    });

                    // Show info banner if there are unknown games
                    if (hasUnknownGames) {
                        const infoBanner = document.createElement('div');
                        infoBanner.style.cssText = 'margin-bottom:16px;padding:12px 14px;background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:6px;color:#ffc107;font-size:13px;display:flex;align-items:center;gap:10px;';
                        infoBanner.innerHTML = '<i class="fa-solid fa-circle-info" style="font-size:16px;"></i><span>' + t('settings.installedLua.unknownInfo', 'Games showing \'Unknown Game\' were installed manually (not via LuaTools).') + '</span>';
                        container.appendChild(infoBanner);
                    }

                    for (let i = 0; i < scripts.length; i++) {
                        const script = scripts[i];
                        const scriptEl = createLuaListItem(script, container);
                        container.appendChild(scriptEl);
                    }
                })
                .catch(function(err) {
                    container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">' + t('settings.installedLua.error', 'Failed to load installed Lua scripts.') + '</div>';
                });
        }

        function createLuaListItem(script, container) {
            const itemEl = document.createElement('div');
            itemEl.style.cssText = 'margin-bottom:12px;padding:14px;background:rgba(11,20,30,0.8);border:1px solid rgba(102,192,244,0.3);border-radius:6px;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s ease;';
            itemEl.onmouseover = function() { this.style.borderColor = '#66c0f4'; this.style.background = 'rgba(11,20,30,0.95)'; };
            itemEl.onmouseout = function() { this.style.borderColor = 'rgba(102,192,244,0.3)'; this.style.background = 'rgba(11,20,30,0.8)'; };

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';

            const gameName = document.createElement('div');
            gameName.style.cssText = 'font-size:15px;font-weight:600;color:#fff;margin-bottom:6px;';
            gameName.textContent = script.gameName || 'Unknown Game (' + script.appid + ')';

            if (script.isDisabled) {
                const disabledBadge = document.createElement('span');
                disabledBadge.style.cssText = 'margin-left:8px;padding:2px 8px;background:rgba(255,92,92,0.2);border:1px solid #ff5c5c;border-radius:4px;font-size:11px;color:#ff5c5c;font-weight:500;';
                disabledBadge.textContent = t('settings.installedLua.disabled', 'Disabled');
                gameName.appendChild(disabledBadge);
            }

            infoDiv.appendChild(gameName);

            const detailsDiv = document.createElement('div');
            detailsDiv.style.cssText = 'font-size:12px;color:#a9b2c3;line-height:1.6;';

            if (script.modifiedDate) {
                const dateSpan = document.createElement('div');
                dateSpan.innerHTML = '<strong style="color:#66c0f4;">' + t('settings.installedLua.modified', 'Modified:') + '</strong> ' + script.modifiedDate;
                detailsDiv.appendChild(dateSpan);
            }

            infoDiv.appendChild(detailsDiv);
            itemEl.appendChild(infoDiv);

            const deleteBtn = document.createElement('a');
            deleteBtn.href = '#';
            deleteBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(255,80,80,0.12);border:2px solid rgba(255,80,80,0.35);border-radius:12px;color:#ff5050;font-size:18px;text-decoration:none;transition:all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);cursor:pointer;flex-shrink:0;';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = t('settings.installedLua.delete', 'Remove');
            deleteBtn.onmouseover = function() {
                this.style.background = 'rgba(255,80,80,0.25)';
                this.style.borderColor = 'rgba(255,80,80,0.6)';
                this.style.color = '#ff6b6b';
                this.style.transform = 'translateY(-2px) scale(1.05)';
                this.style.boxShadow = '0 6px 20px rgba(255,80,80,0.4), 0 0 0 4px rgba(255,80,80,0.1)';
            };
            deleteBtn.onmouseout = function() {
                this.style.background = 'rgba(255,80,80,0.12)';
                this.style.borderColor = 'rgba(255,80,80,0.35)';
                this.style.color = '#ff5050';
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = 'none';
            };

            deleteBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (deleteBtn.dataset.busy === '1') return;

                showLuaToolsConfirm(
                    script.gameName || 'LuaTools',
                    t('settings.installedLua.deleteConfirm', 'Remove via LuaTools for this game?'),
                    function() {
                        // User confirmed
                        deleteBtn.dataset.busy = '1';
                        deleteBtn.style.opacity = '0.6';
                        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                        Millennium.callServerMethod('luatools', 'DeleteLuaToolsForApp', {
                            appid: script.appid,
                            contentScriptQuery: ''
                        })
                        .then(function(res) {
                            const response = typeof res === 'string' ? JSON.parse(res) : res;
                            if (!response || !response.success) {
                                alert(t('settings.installedLua.deleteError', 'Failed to remove Lua script.'));
                                deleteBtn.dataset.busy = '0';
                                deleteBtn.style.opacity = '1';
                                deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedLua.delete', 'Delete') + '</span>';
                                return;
                            }

                            // Success - remove item from list with animation
                            itemEl.style.transition = 'all 0.3s ease';
                            itemEl.style.opacity = '0';
                            itemEl.style.transform = 'translateX(-20px)';
                            setTimeout(function() {
                                itemEl.remove();
                                // Check if list is now empty
                                if (container.children.length === 0) {
                                    container.innerHTML = '<div style="padding:14px;background:#102039;border:1px solid #2a475e;border-radius:4px;color:#c7d5e0;text-align:center;">' + t('settings.installedLua.empty', 'No Lua scripts installed yet.') + '</div>';
                                }
                            }, 300);
                        })
                        .catch(function(err) {
                            alert(t('settings.installedLua.deleteError', 'Failed to remove Lua script.') + ' ' + (err && err.message ? err.message : ''));
                            deleteBtn.dataset.busy = '0';
                            deleteBtn.style.opacity = '1';
                            deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedLua.delete', 'Delete') + '</span>';
                        });
                    },
                    function() {
                        // User cancelled - do nothing
                    }
                );
            });

            itemEl.appendChild(deleteBtn);
            return itemEl;
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

        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof onBack === 'function') {
                overlay.remove();
                onBack();
            }
        });

        rightButtons.appendChild(refreshBtn);
        rightButtons.appendChild(saveBtn);
        btnRow.appendChild(backBtn);
        btnRow.appendChild(rightButtons);

        refreshBtn.addEventListener('click', function(e){
            e.preventDefault();
            if (refreshBtn.dataset.busy === '1') return;
            refreshBtn.dataset.busy = '1';
            handleLoad(true).finally(function(){
                refreshBtn.dataset.busy = '0';
                refreshBtn.style.opacity = '1';
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
            saveBtn.style.opacity = '0.6';
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

        closeIconBtn.addEventListener('click', function(e){
            e.preventDefault();
            overlay.remove();
        });

        discordIconBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const url = 'https://discord.gg/luatools';
            try {
                Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url, contentScriptQuery: '' });
            } catch(_) {}
        });

        overlay.addEventListener('click', function(e){
            if (e.target === overlay) {
            overlay.remove();
        }
        });

        handleLoad(!!forceRefresh);
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

    // Custom modern alert dialog
    function showLuaToolsAlert(title, message, onClose) {
        if (document.querySelector('.luatools-alert-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-alert-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:400px;max-width:520px;padding:32px 36px;box-shadow:0 20px 60px rgba(0,0,0,.9), 0 0 0 1px rgba(102,192,244,0.4);animation:slideUp 0.1s ease-out;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:22px;color:#fff;margin-bottom:20px;font-weight:700;text-align:left;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        titleEl.textContent = String(title || 'LuaTools');

        const messageEl = document.createElement('div');
        messageEl.style.cssText = 'font-size:15px;line-height:1.6;margin-bottom:28px;color:#c7d5e0;text-align:left;padding:0 8px;';
        messageEl.textContent = String(message || '');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;';

        const okBtn = document.createElement('a');
        okBtn.href = '#';
        okBtn.className = 'luatools-btn primary';
        okBtn.style.minWidth = '140px';
        okBtn.innerHTML = `<span>${lt('Close')}</span>`;
        okBtn.onclick = function(e) {
            e.preventDefault();
            overlay.remove();
            try { onClose && onClose(); } catch(_) {}
        };

        btnRow.appendChild(okBtn);

        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.remove();
                try { onClose && onClose(); } catch(_) {}
            }
        });

        document.body.appendChild(overlay);
    }

    // Helper to show alert with fallback
    function ShowLuaToolsAlert(title, message) {
        try {
            showLuaToolsAlert(title, message);
        } catch(err) {
            backendLog('LuaTools: Alert error, falling back: ' + err);
            try { alert(String(title) + '\n\n' + String(message)); } catch(_) {}
        }
    }

    // Steam-style confirm helper (ShowConfirmDialog only)
    function showLuaToolsConfirm(title, message, onConfirm, onCancel) {
        // Always close settings popup first so the confirm is visible on top
        closeSettingsOverlay();

        // Create custom modern confirmation dialog
        if (document.querySelector('.luatools-confirm-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-confirm-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:420px;max-width:540px;padding:32px 36px;box-shadow:0 20px 60px rgba(0,0,0,.9), 0 0 0 1px rgba(102,192,244,0.4);animation:slideUp 0.1s ease-out;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:22px;color:#fff;margin-bottom:20px;font-weight:700;text-align:center;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;';
        titleEl.textContent = String(title || 'LuaTools');

        const messageEl = document.createElement('div');
        messageEl.style.cssText = 'font-size:15px;line-height:1.6;margin-bottom:28px;color:#c7d5e0;text-align:center;';
        messageEl.textContent = String(message || lt('Are you sure?'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'luatools-btn';
        cancelBtn.style.flex = '1';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
        cancelBtn.onclick = function(e) {
            e.preventDefault();
            overlay.remove();
            try { onCancel && onCancel(); } catch(_) {}
        };
        const confirmBtn = document.createElement('a');
        confirmBtn.href = '#';
        confirmBtn.className = 'luatools-btn primary';
        confirmBtn.style.flex = '1';
        confirmBtn.innerHTML = `<span>${lt('Confirm')}</span>`;
        confirmBtn.onclick = function(e) {
            e.preventDefault();
            overlay.remove();
            try { onConfirm && onConfirm(); } catch(_) {}
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);

        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.remove();
                try { onCancel && onCancel(); } catch(_) {}
            }
        });

        document.body.appendChild(overlay);
    }

    // Ensure consistent spacing for our buttons
    function ensureStyles() {
        if (!document.getElementById('luatools-spacing-styles')) {
            const style = document.createElement('style');
            style.id = 'luatools-spacing-styles';
            style.textContent = '.luatools-restart-button, .luatools-button, .luatools-icon-button{ margin-left:6px !important; }';
            document.head.appendChild(style); // This is now separate from the main style block
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
                            showLuaToolsConfirm('LuaTools', lt('Restart Steam now?'),
                                function() { try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {} },
                                function() { /* Cancel - do nothing */ }
                            );
                        } catch(_) {
                            showLuaToolsConfirm('LuaTools', lt('Restart Steam now?'),
                                function() { try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {} },
                                function() { /* Cancel - do nothing */ }
                            );
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
                            iconBtn.addEventListener('click', function(e){ e.preventDefault(); showSettingsPopup(); });
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
                            
                            if (isUpdateMsg) {
                                // For update messages, use confirm dialog with OK (restart) and Cancel options
                                showLuaToolsConfirm('LuaTools', msg, function() {
                                    // User clicked Confirm - restart Steam
                                    try { Millennium.callServerMethod('luatools', 'RestartSteam', { contentScriptQuery: '' }); } catch(_) {}
                                }, function() {
                                    // User clicked Cancel - do nothing (just closes dialog)
                                });
                            } else {
                                // For non-update messages, use regular alert
                                ShowLuaToolsAlert('LuaTools', msg);
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
        let lastCheckedApi = null;
        let successfulApi = null; // Track which API successfully found the file
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
                        const progressInfo = overlay ? overlay.querySelector('.luatools-progress-info') : null;
                        const percent = overlay ? overlay.querySelector('.luatools-percent') : null;
                        const downloadSize = overlay ? overlay.querySelector('.luatools-download-size') : null;
                        const bar = overlay ? overlay.querySelector('.luatools-progress-bar') : null;

                        // Update individual API status in the list
                        if (overlay) {
                            const apiItems = overlay.querySelectorAll('.luatools-api-item');

                            // Track successful API when download/processing starts
                            if ((st.status === 'downloading' || st.status === 'processing' || st.status === 'installing' || st.status === 'done') && st.currentApi && !successfulApi) {
                                successfulApi = st.currentApi;

                                // Mark all APIs: not found before successful, skipped after
                                let foundSuccessful = false;
                                apiItems.forEach((item) => {
                                    const apiName = item.getAttribute('data-api-name');
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus) return;

                                    if (apiName === successfulApi) {
                                        foundSuccessful = true;
                                        item.style.background = 'rgba(102,192,244,0.2)';
                                        item.style.borderColor = '#66c0f4';
                                        apiStatus.innerHTML = '<span style="color:#66c0f4;">' + lt('Found') + '</span><i class="fa-solid fa-check" style="color:#66c0f4;"></i>';
                                    } else if (!foundSuccessful) {
                                        // This API comes before the successful one, mark as not found
                                        item.style.background = 'rgba(42,71,94,0.2)';
                                        item.style.borderColor = 'rgba(102,192,244,0.1)';
                                        apiStatus.innerHTML = '<span style="color:#8f98a0;">' + lt('Not found') + '</span><i class="fa-solid fa-xmark" style="color:#8f98a0;"></i>';
                                    } else {
                                        // This API comes after the successful one, mark as skipped
                                        item.style.background = 'rgba(42,71,94,0.15)';
                                        item.style.borderColor = 'rgba(102,192,244,0.1)';
                                        apiStatus.innerHTML = '<span style="color:#8f98a0;">' + lt('Skipped') + '</span><i class="fa-solid fa-minus" style="color:#8f98a0;"></i>';                                    }
                                });
                            }

                            // Mark previous API as not found if we moved to a new one (only during checking phase)
                            if (st.status === 'checking' && st.currentApi && st.currentApi !== lastCheckedApi && lastCheckedApi) {
                                apiItems.forEach((item) => {
                                    const apiName = item.getAttribute('data-api-name');
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus) return;

                                    if (apiName === lastCheckedApi) {
                                        item.style.background = 'rgba(42,71,94,0.2)';
                                        item.style.borderColor = 'rgba(102,192,244,0.1)';
                                        apiStatus.innerHTML = '<span style="color:#8f98a0;">' + lt('Not found') + '</span><i class="fa-solid fa-xmark" style="color:#8f98a0;"></i>';
                                    }
                                });
                            }

                            // Update current API status during checking
                            if (st.status === 'checking' && st.currentApi) {
                                apiItems.forEach((item) => {
                                    const apiName = item.getAttribute('data-api-name');
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus) return;

                                    if (apiName === st.currentApi) {
                                        item.style.background = 'rgba(102,192,244,0.15)';
                                        item.style.borderColor = 'rgba(102,192,244,0.5)';
                                        apiStatus.innerHTML = '<span style="color:#66c0f4;">' + lt('Checking…') + '</span><i class="fa-solid fa-spinner" style="color:#66c0f4;animation: spin 1.5s linear infinite;"></i>';
                                    }
                                });

                                lastCheckedApi = st.currentApi;
                            }
                        }

                        // Update UI if overlay is present
                        if (st.status === 'checking' && st.currentApi && title) {
                            title.textContent = lt('LuaTools · {api}').replace('{api}', st.currentApi);
                        } else if ((st.status === 'downloading' || st.status === 'processing' || st.status === 'installing') && title) {
                            title.textContent = 'LuaTools';
                        }

                        if (status) {
                            if (st.status === 'checking') status.textContent = lt('Checking availability…');
                            if (st.status === 'downloading') status.textContent = lt('Downloading…');
                            if (st.status === 'processing') status.textContent = lt('Processing package…');
                            if (st.status === 'installing') status.textContent = lt('Installing…');
                            if (st.status === 'done') status.textContent = lt('Finishing…');
                            if (st.status === 'failed') status.textContent = lt('Failed');
                        }
                        if (st.status === 'downloading' || st.status === 'processing' || st.status === 'installing'){
                            // reveal progress UI (if overlay visible)
                            if (wrap && wrap.style.display === 'none') wrap.style.display = 'block';
                            if (progressInfo && progressInfo.style.display === 'none') {
                                progressInfo.style.display = 'flex';
                                progressInfo.style.justifyContent = 'space-between';
                            }

                            const total = st.totalBytes || 0; const read = st.bytesRead || 0;
                            let pct = total > 0 ? Math.floor((read/total)*100) : (read ? 1 : 0);
                            if (pct > 100) pct = 100; if (pct < 0) pct = 0;

                            // Update bar and percentage
                            if (bar) bar.style.width = pct + '%';
                            if (percent) percent.textContent = pct + '%';

                            // Format file sizes (only if we have size data)
                            if (downloadSize) {
                                if (total > 0) {
                                    const formatBytes = (bytes) => {
                                        if (bytes === 0) return '0 B';
                                        const k = 1024;
                                        const sizes = ['B', 'KB', 'MB', 'GB'];
                                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                                        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
                                    };
                                    downloadSize.textContent = formatBytes(read) + ' / ' + formatBytes(total);
                                } else {
                                    downloadSize.textContent = '';
                                }
                            }
                            // Show Cancel button during download
                            const cancelBtn = overlay ? overlay.querySelector('.luatools-cancel-btn') : null;
                            if (cancelBtn && st.status === 'downloading') cancelBtn.style.display = '';
                        }
                        if (st.status === 'done'){
                            // Update popup if visible
                            if (title) title.textContent = 'LuaTools';
                            if (bar) bar.style.width = '100%';
                            if (percent) percent.textContent = '100%';
                            if (status) status.textContent = lt('Game added!');
                            // Hide Cancel button and update Hide to Close
                            const cancelBtn = overlay ? overlay.querySelector('.luatools-cancel-btn') : null;
                            if (cancelBtn) cancelBtn.style.display = 'none';
                            const hideBtn = overlay ? overlay.querySelector('.luatools-hide-btn') : null;
                            if (hideBtn) hideBtn.innerHTML = '<span>' + lt('Close') + '</span>';
                            // hide progress visuals after a short beat
                            if (wrap || progressInfo) {
                            setTimeout(function(){
                                if (wrap) wrap.style.display = 'none';
                                if (progressInfo) progressInfo.style.display = 'none';
                            }, 300);
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
                            // Mark all APIs as not found when failed
                            if (overlay && !successfulApi) {
                                const apiItems = overlay.querySelectorAll('.luatools-api-item');
                                apiItems.forEach((item) => {
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus) return;
                                    // Check if this API is still in "Waiting..." or "Checking..." state
                                    const statusText = apiStatus.textContent || '';
                                    if (statusText.includes('Waiting') || statusText.includes('Esperando') || statusText.includes('Checking') || statusText.includes('Verificando')) {
                                        item.style.background = 'rgba(42,71,94,0.2)';
                                        item.style.borderColor = 'rgba(102,192,244,0.1)';
                                        apiStatus.innerHTML = '<span style="color:#8f98a0;">' + lt('Not found') + '</span><i class="fa-solid fa-xmark" style="color:#8f98a0;"></i>';
                                    }
                                });
                            }

                            // show error in the popup if visible
                            if (status) status.textContent = lt('Failed: {error}').replace('{error}', st.error || lt('Unknown error'));
                            // Hide Cancel button and update Hide to Close
                            const cancelBtn = overlay ? overlay.querySelector('.luatools-cancel-btn') : null;
                            if (cancelBtn) cancelBtn.style.display = 'none';
                            const hideBtn = overlay ? overlay.querySelector('.luatools-hide-btn') : null;
                            if (hideBtn) hideBtn.innerHTML = '<span>' + lt('Close') + '</span>';
                            if (wrap) wrap.style.display = 'none';
                            if (progressInfo) progressInfo.style.display = 'none';
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

    function showLoadedAppsPopup(apps) {
        // Avoid duplicates
        if (document.querySelector('.luatools-loadedapps-overlay')) return;
        ensureFontAwesome();
        ensureLuaToolsStyles();
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.className = 'luatools-loadedapps-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease-out;';
        overlay.className = 'luatools-loadedapps-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';
        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(135deg, #1b2838 0%, #2a475e 100%);color:#fff;border:2px solid #66c0f4;border-radius:8px;min-width:420px;max-width:640px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px rgba(102,192,244,0.3);animation:slideUp 0.1s ease-out;';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:24px;color:#fff;margin-bottom:20px;font-weight:700;text-shadow:0 2px 8px rgba(102,192,244,0.4);background:linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;';
        title.textContent = lt('LuaTools · Added Games');
        const body = document.createElement('div');
        body.style.cssText = 'font-size:14px;line-height:1.8;margin-bottom:16px;max-height:320px;overflow:auto;padding:16px;border:1px solid rgba(102,192,244,0.3);border-radius:12px;background:rgba(11,20,30,0.6);';
        if (apps && apps.length) {
            const list = document.createElement('div');
            apps.forEach(function(item){
                const a = document.createElement('a');
                a.href = 'steam://install/' + String(item.appid);
                a.textContent = String(item.name || item.appid);
                a.style.cssText = 'display:block;color:#c7d5e0;text-decoration:none;padding:10px 16px;margin-bottom:8px;background:rgba(102,192,244,0.08);border:1px solid rgba(102,192,244,0.2);border-radius:4px;transition:all 0.3s ease;';
                a.onmouseover = function() { this.style.background = 'rgba(102,192,244,0.2)'; this.style.borderColor = '#66c0f4'; this.style.transform = 'translateX(4px)'; this.style.color = '#fff'; };
                a.onmouseout = function() { this.style.background = 'rgba(102,192,244,0.08)'; this.style.borderColor = 'rgba(102,192,244,0.2)'; this.style.transform = 'translateX(0)'; this.style.color = '#c7d5e0'; };
                a.onclick = function(e){ e.preventDefault(); try { window.location.href = a.href; } catch(_) {} };
                a.oncontextmenu = function(e){ e.preventDefault(); const url = 'https://steamdb.info/app/' + String(item.appid) + '/';
                    try { Millennium.callServerMethod('luatools', 'OpenExternalUrl', { url, contentScriptQuery: '' }); } catch(_) {}
                };
                list.appendChild(a);
            });
            body.appendChild(list);
        } else {
            body.style.textAlign = 'center';
            body.textContent = lt('No games found.');
        }
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:8px;justify-content:space-between;align-items:center;';
        const instructionText = document.createElement('div');
        instructionText.style.cssText = 'font-size:12px;color:#8f98a0;';
        instructionText.textContent = lt('Left click to install, Right click for SteamDB');
        const dismissBtn = document.createElement('a');
        dismissBtn.className = 'luatools-btn';
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
