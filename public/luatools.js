// LuaTools button injection (standalone plugin)

// ============================================
// GAMEPAD NAVIGATION SYSTEM - Inline Version
// ============================================
(function () {
    'use strict';

    // Inject gamepad navigation CSS
    const gamepadCSS = document.createElement('style');
    gamepadCSS.id = 'gamepad-navigation-styles';
    gamepadCSS.textContent = `
        .active-focus {
            outline: 3px solid #66c0f4 !important;
            outline-offset: 2px !important;
            box-shadow: 0 0 0 4px rgba(102, 192, 244, 0.3),
                        0 0 12px rgba(102, 192, 244, 0.5) !important;
            position: relative !important;
            z-index: 9999 !important;
            transition: outline 0.15s ease, box-shadow 0.15s ease !important;
        }

        @keyframes gamepad-focus-pulse {
            0%, 100% {
                box-shadow: 0 0 0 4px rgba(102, 192, 244, 0.3),
                            0 0 12px rgba(102, 192, 244, 0.5);
            }
            50% {
                box-shadow: 0 0 0 4px rgba(102, 192, 244, 0.5),
                            0 0 16px rgba(102, 192, 244, 0.7);
            }
        }

        .active-focus {
            animation: gamepad-focus-pulse 1.5s ease-in-out infinite;
        }

        button.active-focus,
        a.active-focus {
            background-color: rgba(102, 192, 244, 0.15) !important;
            transform: scale(1.02);
        }

        .BasicUI .active-focus,
        .touch .active-focus {
            outline-width: 4px !important;
            outline-offset: 3px !important;
        }

        input.active-focus,
        select.active-focus,
        textarea.active-focus {
            border-color: #66c0f4 !important;
            background-color: rgba(102, 192, 244, 0.1) !important;
        }

        .active-focus:focus {
            outline: 3px solid #66c0f4 !important;
        }

        button,
        a,
        input,
        select,
        textarea,
        .focusable {
            transition: transform 0.15s ease, background-color 0.15s ease !important;
        }

        .luatools-button.active-focus,
        .luatools-restart-button.active-focus,
        .luatools-icon-button.active-focus {
            transform: scale(1.05) !important;
            background: linear-gradient(135deg, rgba(102, 192, 244, 0.3), rgba(102, 192, 244, 0.2)) !important;
        }

        .btnv6_blue_hoverfade.active-focus {
            background: linear-gradient(to right, #47bfff 5%, #1a9fff 95%) !important;
        }

        .active-focus {
            scroll-margin: 20px;
        }
    `;
    document.head.appendChild(gamepadCSS);

    // Gamepad Navigation System
    // ALL LuaTools overlays that should block Steam navigation
    const OVERLAY_SELECTORS = [
        '.luatools-overlay',
        '.luatools-settings-overlay',
        '.luatools-fixes-results-overlay',
        '.luatools-loading-fixes-overlay',
        '.luatools-unfix-overlay',
        '.luatools-settings-manager-overlay',
        '.luatools-alert-overlay',
        '.luatools-confirm-overlay',
        '.luatools-loadedapps-overlay'
    ];
    const OVERLAY_SELECTOR_STRING = OVERLAY_SELECTORS.join(', ');

    const CONFIG = {
        deadzone: 0.4, // Increased from 0.3 to prevent unwanted drift
        debounceTime: 200,
        pollRate: 16,
        stickThreshold: 0.7, // Increased threshold for stick navigation
        buttonMap: {
            A: 0,
            B: 1,
            X: 2,
            Y: 3,
            LB: 4,
            RB: 5,
            LT: 6,
            RT: 7,
            SELECT: 8,
            START: 9,
            L3: 10,
            R3: 11,
            DPAD_UP: 12,
            DPAD_DOWN: 13,
            DPAD_LEFT: 14,
            DPAD_RIGHT: 15
        },
        axesMap: {
            LEFT_STICK_X: 0,
            LEFT_STICK_Y: 1,
            RIGHT_STICK_X: 2,
            RIGHT_STICK_Y: 3
        }
    };

    const state = {
        gamepadConnected: false,
        gamepadIndex: null,
        focusableElements: [],
        currentFocusIndex: 0,
        lastNavigationTime: 0,
        lastAxisValues: {
            x: 0,
            y: 0
        },
        buttonStates: {},
        animationFrameId: null
    };

    // duplicated from main code thing for reliability
    function isBigPictureMode() {
        if (typeof window.__LUATOOLS_IS_BIG_PICTURE__ !== 'undefined') {
            return window.__LUATOOLS_IS_BIG_PICTURE__;
        }
        const htmlClasses = document.documentElement.className;
        const userAgent = navigator.userAgent;
        let score = 0;
        if (htmlClasses.includes('BasicUI')) score += 3;
        if (htmlClasses.includes('DesktopUI')) score -= 3;
        if (userAgent.includes('Valve Steam Gamepad')) score += 2;
        if (userAgent.includes('Valve Steam Client')) score -= 2;
        if (htmlClasses.includes('touch')) score += 1;
        return score > 0;
    }

    // B button handler removed - users should use the modal buttons directly
    // This prevents conflicts with Steam's back navigation
    let onBackHandler = function () {
        console.log('[Gamepad] B button pressed - ignoring (use modal buttons instead)');
        // Do nothing - let users navigate with D-pad/stick and press A on Cancel/Back buttons
    };

    function onGamepadConnected(event) {
        console.log('[Gamepad] Gamepad conectado en Millennium:', event.gamepad.id);
        state.gamepadConnected = true;
        state.gamepadIndex = event.gamepad.index;
        if (!state.animationFrameId) {
            pollGamepad();
        }
        // Don't scan immediately - only scan when an overlay is opened
        // scanFocusableElements() will be called by the overlay's setTimeout
    }

    function onGamepadDisconnected(event) {
        console.log('[Gamepad] Gamepad disconnected:', event.gamepad.id);
        if (state.gamepadIndex === event.gamepad.index) {
            state.gamepadConnected = false;
            state.gamepadIndex = null;
            if (state.animationFrameId) {
                cancelAnimationFrame(state.animationFrameId);
                state.animationFrameId = null;
            }
        }
    }

    function scanFocusableElements() {
        if (!isBigPictureMode()) return;

        // Only scan if there's a LuaTools overlay active
        const activeOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

        if (!activeOverlay) {
            console.log('[Gamepad] No LuaTools overlay active, skipping scan');
            state.focusableElements = [];
            state.currentFocusIndex = 0;
            return;
        }

        // Only scan elements INSIDE the active overlay
        const selectors = [
            'button:not([disabled])',
            'a[href]:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[tabindex="0"]',
            '[tabindex]:not([tabindex="-1"])',
            '.focusable:not([disabled])'
        ].join(', ');

        // Use querySelectorAll on the overlay, not the whole document
        const elements = Array.from(activeOverlay.querySelectorAll(selectors));
        state.focusableElements = elements.filter(function (el) {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.opacity !== '0';
        });

        console.log('[Gamepad] Scanned ' + state.focusableElements.length + ' focusable elements inside overlay');

        if (state.focusableElements.length > 0) {
            focusElement(0);
        }
    }

    function focusElement(index) {
        const prevElement = state.focusableElements[state.currentFocusIndex];
        if (prevElement) {
            prevElement.blur();
            prevElement.classList.remove('active-focus');
        }

        if (index < 0) index = 0;
        if (index >= state.focusableElements.length) index = state.focusableElements.length - 1;

        state.currentFocusIndex = index;

        const element = state.focusableElements[index];
        if (element) {
            element.focus();
            element.classList.add('active-focus');
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
            console.log('[Gamepad] Focused element ' + index + ':', element);
        }
    }

    function navigate(direction) {
        const now = Date.now();
        if (now - state.lastNavigationTime < CONFIG.debounceTime) {
            return;
        }
        state.lastNavigationTime = now;

        if (state.focusableElements.length === 0) {
            scanFocusableElements();
            return;
        }

        let newIndex = state.currentFocusIndex;

        switch (direction) {
            case 'up':
                newIndex--;
                break;
            case 'down':
                newIndex++;
                break;
            case 'left':
                newIndex = findElementInDirection('left');
                break;
            case 'right':
                newIndex = findElementInDirection('right');
                break;
        }

        if (newIndex < 0) newIndex = state.focusableElements.length - 1;
        if (newIndex >= state.focusableElements.length) newIndex = 0;

        focusElement(newIndex);
    }

    function findElementInDirection(direction) {
        const currentElement = state.focusableElements[state.currentFocusIndex];
        if (!currentElement) return state.currentFocusIndex;

        const currentRect = currentElement.getBoundingClientRect();
        let closestIndex = state.currentFocusIndex;
        let closestDistance = Infinity;

        state.focusableElements.forEach(function (el, index) {
            if (index === state.currentFocusIndex) return;

            const rect = el.getBoundingClientRect();
            let isInDirection = false;
            let distance = 0;

            if (direction === 'left') {
                isInDirection = rect.right <= currentRect.left;
                distance = currentRect.left - rect.right;
            } else if (direction === 'right') {
                isInDirection = rect.left >= currentRect.right;
                distance = rect.left - currentRect.right;
            }

            if (isInDirection && distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });

        return closestIndex;
    }

    function handleButtonPress(buttonIndex) {
        const element = state.focusableElements[state.currentFocusIndex];

        switch (buttonIndex) {
            case CONFIG.buttonMap.A:
                if (element) {
                    console.log('[Gamepad] A button: clicking element', element);
                    element.click();
                    setTimeout(scanFocusableElements, 100);
                }
                break;

            case CONFIG.buttonMap.B:
                // B button disabled - users should use modal buttons
                console.log('[Gamepad] B button pressed - ignoring');
                break;

            case CONFIG.buttonMap.DPAD_UP:
                navigate('up');
                break;

            case CONFIG.buttonMap.DPAD_DOWN:
                navigate('down');
                break;

            case CONFIG.buttonMap.DPAD_LEFT:
                navigate('left');
                break;

            case CONFIG.buttonMap.DPAD_RIGHT:
                navigate('right');
                break;
        }
    }

    function pollGamepad() {
        if (!state.gamepadConnected) {
            state.animationFrameId = null;
            return;
        }

        // Check if there's an active LuaTools overlay
        const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

        // If no overlay is active, skip input processing but keep polling
        if (!hasActiveOverlay) {
            state.animationFrameId = requestAnimationFrame(pollGamepad);
            return;
        }

        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[state.gamepadIndex];

        if (!gamepad) {
            state.animationFrameId = requestAnimationFrame(pollGamepad);
            return;
        }

        // Buttons
        gamepad.buttons.forEach(function (button, index) {
            const wasPressed = state.buttonStates[index] || false;
            const isPressed = button.pressed;

            if (isPressed && !wasPressed) {
                handleButtonPress(index);
            }

            state.buttonStates[index] = isPressed;
        });

        // Left stick
        const axisX = gamepad.axes[CONFIG.axesMap.LEFT_STICK_X] || 0;
        const axisY = gamepad.axes[CONFIG.axesMap.LEFT_STICK_Y] || 0;

        const x = Math.abs(axisX) > CONFIG.deadzone ? axisX : 0;
        const y = Math.abs(axisY) > CONFIG.deadzone ? axisY : 0;

        const now = Date.now();
        const threshold = CONFIG.stickThreshold; // Use higher threshold (0.7)
        if (now - state.lastNavigationTime >= CONFIG.debounceTime) {
            if (y < -threshold && state.lastAxisValues.y >= -threshold) {
                navigate('up');
            } else if (y > threshold && state.lastAxisValues.y <= threshold) {
                navigate('down');
            } else if (x < -threshold && state.lastAxisValues.x >= -threshold) {
                navigate('left');
            } else if (x > threshold && state.lastAxisValues.x <= threshold) {
                navigate('right');
            }
        }

        state.lastAxisValues.x = x;
        state.lastAxisValues.y = y;

        state.animationFrameId = requestAnimationFrame(pollGamepad);
    }

    // Disabled: MutationObserver was causing unwanted auto-scanning
    // Only manual scanElements() calls from overlay setTimeout will trigger scans
    /*
    const observer = new MutationObserver(function(mutations) {
        clearTimeout(observer.rescanTimeout);
        observer.rescanTimeout = setTimeout(function() {
            if (state.gamepadConnected) {
                scanFocusableElements();
            }
        }, 300);
    });
    */

    // Block Steam's gamepad navigation when overlay is active
    function blockSteamNavigation(event) {
        const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

        if (hasActiveOverlay && state.gamepadConnected) {
            // Block arrow keys, Enter, Escape, Backspace and other navigation keys
            // Note: Steam may translate gamepad B button to Escape or Backspace
            const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace', ' ', 'Tab'];
            if (navKeys.includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                console.log('[Gamepad] Blocked Steam navigation key:', event.key);
                return false;
            }
        }
    }

    // Block clicks on Steam UI when overlay is active
    function blockSteamClicks(event) {
        const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

        if (hasActiveOverlay && state.gamepadConnected) {
            // Only allow clicks inside the overlay
            const clickedInsideOverlay = event.target.closest(OVERLAY_SELECTOR_STRING);

            if (!clickedInsideOverlay) {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                console.log('[Gamepad] Blocked click outside overlay');
                return false;
            }
        }
    }

    // Block browser history navigation when overlay is active
    function blockHistoryNavigation(event) {
        const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);
        if (hasActiveOverlay && state.gamepadConnected) {
            console.log('[Gamepad] Blocked history navigation (popstate)');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            // Push the current state back to prevent navigation
            window.history.pushState(null, '', window.location.href);
            return false;
        }
    }

    function init() {
        if (!isBigPictureMode()) {
            console.log('[Gamepad] Not in Big Picture Mode, skipping initialization');
            return;
        }

        console.log('[Gamepad] Initializing Gamepad Navigation System...');

        window.addEventListener('gamepadconnected', onGamepadConnected);
        window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

        // Block Steam's keyboard navigation when overlay is active
        document.addEventListener('keydown', blockSteamNavigation, true);
        document.addEventListener('keyup', blockSteamNavigation, true);

        // Block clicks outside overlay when gamepad is active
        document.addEventListener('click', blockSteamClicks, true);
        document.addEventListener('mousedown', blockSteamClicks, true);

        // Block browser history navigation (back button)
        window.addEventListener('popstate', blockHistoryNavigation, true);

        const gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                onGamepadConnected({
                    gamepad: gamepads[i]
                });
                break;
            }
        }

        // Disabled: MutationObserver auto-scanning
        /*
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        */

        // Don't scan on init - only scan when overlays are opened
        // scanFocusableElements();

        console.log('[Gamepad] Initialization complete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.GamepadNav = {
        scanElements: scanFocusableElements,
        setBackHandler: function (fn) {
            if (typeof fn === 'function') {
                onBackHandler = fn;
            }
        },
        focusElement: focusElement,
        getCurrentIndex: function () {
            return state.currentFocusIndex;
        },
        getElements: function () {
            return state.focusableElements;
        },
        isConnected: function () {
            return state.gamepadConnected;
        }
    };
})();

// ============================================
// LUATOOLS MAIN CODE
// ============================================
(function () {
    'use strict';

    // Big Picture Mode Detector - Multi-method system for maximum reliability
    function isBigPictureMode() {
        const htmlClasses = document.documentElement.className;
        const userAgent = navigator.userAgent;

        // METHOD 1: HTML Classes
        // Big Picture: 'BasicUI' + 'touch'
        // Normal Mode: 'DesktopUI' (without 'touch')
        const hasBigPictureClass = htmlClasses.includes('BasicUI');
        const hasDesktopClass = htmlClasses.includes('DesktopUI');
        const hasTouchClass = htmlClasses.includes('touch');

        // METHOD 2: User Agent
        // Big Picture: 'Valve Steam Gamepad'
        // Normal Mode: 'Valve Steam Client'
        const isGamepadUA = userAgent.includes('Valve Steam Gamepad');
        const isClientUA = userAgent.includes('Valve Steam Client');

        // Scoring system: each indicator adds points
        let bigPictureScore = 0;

        // BasicUI/DesktopUI class (weight: 3 points - highly reliable)
        if (hasBigPictureClass) bigPictureScore += 3;
        if (hasDesktopClass) bigPictureScore -= 3;

        // User Agent (weight: 2 points - reliable)
        if (isGamepadUA) bigPictureScore += 2;
        if (isClientUA) bigPictureScore -= 2;

        // Touch class (weight: 1 point - additional indicator)
        if (hasTouchClass) bigPictureScore += 1;

        // Positive score = Big Picture, negative/zero = Normal
        const isBigPicture = bigPictureScore > 0;

        return isBigPicture;
    }

    // Detect and save mode at startup
    window.__LUATOOLS_IS_BIG_PICTURE__ = isBigPictureMode();

    // Forward logs to Millennium backend so they appear in the dev console
    function backendLog(message) {
        try {
            if (typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                Millennium.callServerMethod('luatools', 'Logger.log', {
                    message: String(message)
                });
            }
        } catch (err) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[LuaTools] backendLog failed', err);
            }
        }
    }

    backendLog('LuaTools script loaded');
    backendLog('Mode Detection: ' + (window.__LUATOOLS_IS_BIG_PICTURE__ ? 'BIG PICTURE MODE' : 'NORMAL MODE'));
    // anti-spam state
    const logState = {
        missingOnce: false,
        existsOnce: false
    };
    // click/run debounce state
    const runState = {
        inProgress: false,
        appid: null
    };

    // Games Database - backend handles caching
    function fetchGamesDatabase() {
        if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
            return Promise.resolve({});
        }
        return Millennium.callServerMethod('luatools', 'GetGamesDatabase', {
            contentScriptQuery: ''
        })
            .then(function (res) {
                var payload = (res && (res.result || res.value)) || res;
                if (typeof payload === 'string') {
                    try {
                        payload = JSON.parse(payload);
                    } catch (e) { }
                }
                return payload || {};
            })
            .catch(function (err) {
                console.warn('[LuaTools] Failed to fetch games database', err);
                return {};
            });
    }

    // Fixes - backend handles caching
    function fetchFixes(appid) {
        if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
            return Promise.resolve(null);
        }
        return Millennium.callServerMethod('luatools', 'CheckForFixes', {
            appid: appid,
            contentScriptQuery: ''
        })
            .then(function (res) {
                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                return (payload && payload.success) ? payload : null;
            })
            .catch(function (err) {
                console.warn('[LuaTools] Failed to fetch fixes', err);
                return null;
            });
    }

    // Cache for game names fetched from Steam API
    const steamGameNameCache = {};

    /**
     * get game name separately without cached full appid
     * @param {number|string} appid 
     * @returns {Promise<string|null>}
     */
    function fetchSteamGameName(appid) {
        if (!appid) return Promise.resolve(null);
        if (steamGameNameCache[appid]) return Promise.resolve(steamGameNameCache[appid]);

        return fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic')
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                if (data && data[appid] && data[appid].success && data[appid].data && data[appid].data.name) {
                    const name = data[appid].data.name;
                    steamGameNameCache[appid] = name;
                    return name;
                }
                return null;
            })
            .catch(function (err) {
                backendLog('LuaTools: fetchSteamGameName error for ' + appid + ': ' + err);
                return null;
            });
    }


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

    // Theme definitions (pulled from themes.json; inline only used as fallback)
    const DEFAULT_THEMES = {
        original: {
            name: 'Original',
            bgPrimary: '#1b2838',
            bgSecondary: '#2a475e',
            bgTertiary: 'rgba(7, 7, 7, 0.86)',
            bgHover: 'rgba(7, 7, 7, 0.86)',
            bgContainer: 'rgba(11,20,30,0.6)',
            bgContainerGradient: 'rgba(11, 20, 30, 0.85), #0b141e',
            accent: '#66c0f4',
            accentLight: '#a4d7f5',
            accentDark: '#4a9ece',
            border: 'rgba(102,192,244,0.3)',
            borderHover: 'rgba(102,192,244,0.8)',
            text: '#fff',
            textSecondary: '#c7d5e0',
            gradient: 'linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%)',
            gradientLight: 'linear-gradient(135deg, #a4d7f5 0%, #7dd4ff 100%)',
            shadow: 'rgba(102,192,244,0.4)',
            shadowHover: 'rgba(102,192,244,0.6)',
        }
    };

    // Runtime THEMES map - start with fallback, then hydrate from themes.json/backend.
    let THEMES = DEFAULT_THEMES;
    let themesLoaded = false;

    function normalizeThemesPayload(input) {
        try {
            let payload = input;
            if (typeof payload === 'string') payload = JSON.parse(payload);
            if (payload && typeof payload === 'object') {
                if (Array.isArray(payload.themes)) return payload.themes;
                if (Array.isArray(payload.result)) return payload.result;
                if (payload.result && Array.isArray(payload.result.themes)) return payload.result.themes;
                if (Array.isArray(payload.value)) return payload.value;
            }
            if (Array.isArray(payload)) return payload;
        } catch (_) {
            /* ignore */
        }
        return [];
    }

    function _applyBackendThemes(themesArray) {
        try {
            const themes = normalizeThemesPayload(themesArray);
            if (!Array.isArray(themes) || themes.length === 0) return;
            const map = {};
            themes.forEach(function (t) {
                if (!t || (!t.value && !t.key)) return;
                const key = t.value || t.key;
                map[key] = Object.assign({}, t, {
                    value: key,
                    name: t.name || key
                });
            });
            if (Object.keys(map).length === 0) return;
            // Merge into existing THEMES if themes have been loaded, otherwise start from DEFAULT_THEMES
            THEMES = Object.assign({}, (themesLoaded ? THEMES : DEFAULT_THEMES), map);
            themesLoaded = true;
            try {
                ensureLuaToolsStyles();
            } catch (_) { }
        } catch (e) {
            console.warn('Failed to apply backend themes', e);
        }
    }

    function loadThemesFromFile() {
        try {
            return fetch('themes/themes.json', {
                cache: 'no-store'
            }).then(function (res) {
                if (!res || !res.ok) return null;
                return res.json();
            }).then(function (json) {
                if (!json) return null;
                _applyBackendThemes(json);
                return json;
            }).catch(function () {
                return null;
            });
        } catch (_) {
            return Promise.resolve(null);
        }
    }

    function loadThemesFromBackend() {
        if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
            return Promise.resolve(null);
        }
        return Millennium.callServerMethod('luatools', 'GetThemes', {
            contentScriptQuery: ''
        }).then(function (res) {
            try {
                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                if (payload && payload.success && payload.themes) {
                    _applyBackendThemes(payload.themes);
                    return payload.themes;
                }
            } catch (_) { }
            return null;
        }).catch(function () {
            return null;
        });
    }

    function loadThemes() {
        return Promise.all([
            loadThemesFromFile(),
            loadThemesFromBackend()
        ]).catch(function () {
            /* ignore */
        });
    }

    // Trigger load (non-blocking). Keeps DEFAULT_THEMES as a safe fallback.
    const themeLoadPromise = loadThemes();

    function getCurrentThemeKey() {
        try {
            const settings = window.__LuaToolsSettings || {};
            const themeKey = (settings.values || {}).general || {};
            return themeKey.theme || 'original';
        } catch (e) {
            return 'original';
        }
    }

    function getCurrentTheme() {
        try {
            const themeName = getCurrentThemeKey();
            const theme = THEMES[themeName] || THEMES.original;
            if (!THEMES[themeName]) {
                try {
                    backendLog('LuaTools: Theme ' + themeName + ' not found in THEMES, using original. Available: ' + Object.keys(THEMES).join(', '));
                } catch (_) { }
            }
            return theme;
        } catch (e) {
            return THEMES.original;
        }
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : [102, 192, 244];
    }

    function getThemeColors() {
        const theme = getCurrentTheme();
        const rgb = hexToRgb(theme.accent);
        return {
            modalBg: `linear-gradient(135deg, ${theme.bgPrimary} 0%, ${theme.bgSecondary} 100%)`,
            border: theme.accent,
            borderRgba: theme.border,
            text: theme.text,
            textSecondary: theme.textSecondary,
            accent: theme.accent,
            accentLight: theme.accentLight,
            gradient: theme.gradient,
            gradientLight: theme.gradientLight,
            shadow: theme.shadow,
            shadowHover: theme.shadowHover,
            shadowRgba: theme.shadow.replace('0.4', '0.3'),
            bgContainer: theme.bgContainer,
            bgTertiary: theme.bgTertiary,
            bgHover: theme.bgHover,
            rgbString: rgb.join(',')
        };
    }

    function generateThemeStyles(theme) {
        return `
            /* Force overlay backdrops to follow the active theme (overrides inline styles) */
            .luatools-settings-overlay,
            .luatools-overlay,
            .luatools-fixes-results-overlay,
            .luatools-loading-fixes-overlay,
            .luatools-unfix-overlay,
            .luatools-settings-manager-overlay,
            .luatools-loadedapps-overlay {
                background: rgba(${theme.rgbString}, 0.12) !important;
                backdrop-filter: blur(8px) !important;
            }

            /* Prefer overlay-scoped select rules to override theme CSS files */
            .luatools-settings-overlay select,
            .luatools-settings-manager-overlay select,
            .luatools-overlay select,
            .luatools-fixes-results-overlay select,
            .luatools-loadedapps-overlay select {
                background-color: ${theme.bgTertiary} !important;
                color: ${theme.text} !important;
                border: 1px solid ${theme.border} !important;
                border-radius: 3px !important;
                padding: 6px 8px !important;
                font-size: 14px !important;
            }
            .luatools-settings-overlay select option,
            .luatools-settings-manager-overlay select option,
            .luatools-overlay select option,
            .luatools-fixes-results-overlay select option,
            .luatools-loadedapps-overlay select option {
                background-color: ${theme.bgPrimary} !important;
                color: ${theme.text} !important;
            }
            .luatools-settings-overlay select option:checked,
            .luatools-settings-manager-overlay select option:checked,
            .luatools-overlay select option:checked,
            .luatools-fixes-results-overlay select option:checked,
            .luatools-loadedapps-overlay select option:checked {
                background: ${theme.accent} !important;
                color: ${theme.text} !important;
            }
            .luatools-settings-overlay select:hover,
            .luatools-settings-manager-overlay select:hover,
            .luatools-overlay select:hover,
            .luatools-fixes-results-overlay select:hover,
            .luatools-loadedapps-overlay select:hover {
                border-color: ${theme.borderHover} !important;
            }
            .luatools-settings-overlay select:focus,
            .luatools-settings-manager-overlay select:focus,
            .luatools-overlay select:focus,
            .luatools-fixes-results-overlay select:focus,
            .luatools-loadedapps-overlay select:focus {
                outline: none !important;
                border-color: ${theme.accent} !important;
                box-shadow: 0 0 0 2px ${theme.shadow} !important;
            }
            .luatools-btn {
                padding: 12px 24px;
                background: ${theme.bgTertiary};
                border: 2px solid ${theme.border.replace('0.3', '0.5')};
                border-radius: 12px;
                color: ${theme.text};
                font-size: 15px;
                font-weight: 600;
                text-decoration: none;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                cursor: pointer;
                box-shadow: 0 2px 8px ${theme.shadow};
                letter-spacing: 0.3px;
            }
            .luatools-btn:hover:not([data-disabled="1"]) {
                background: ${theme.bgHover};
                transform: translateY(-2px);
                box-shadow: 0 6px 20px ${theme.shadowHover};
                border-color: ${theme.borderHover};
            }
            .luatools-btn.primary {
                background: ${theme.gradient};
                border-color: ${theme.borderHover.replace('0.8', '0.8')};
                color: ${theme.text};
                font-weight: 700;
                box-shadow: 0 4px 15px ${theme.shadow}, inset 0 1px 0 rgba(255,255,255,0.3);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }
            .luatools-btn.primary:hover:not([data-disabled="1"]) {
                background: ${theme.gradientLight};
                transform: translateY(-3px) scale(1.03);
                box-shadow: 0 8px 25px ${theme.shadowHover}, inset 0 1px 0 rgba(255,255,255,0.4);
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
    }

    function ensureThemeStylesheet(themeKey) {
        const id = 'luatools-theme-css';
        const href = 'themes/' + themeKey + '.css';
        const link = document.getElementById(id);
        if (link) {
            const currentTheme = link.getAttribute('data-theme');
            if (currentTheme === themeKey) return;
            link.href = href;
            link.setAttribute('data-theme', themeKey);
            return;
        }
        try {
            const el = document.createElement('link');
            el.id = id;
            el.rel = 'stylesheet';
            el.href = href;
            el.setAttribute('data-theme', themeKey);
            document.head.appendChild(el);
        } catch (err) {
            backendLog('LuaTools: Theme CSS injection failed: ' + err);
        }
    }

    function ensureLuaToolsStyles() {
        const styleEl = document.getElementById('luatools-styles');
        const themeKey = getCurrentThemeKey();
        const theme = getCurrentTheme();
        const styles = generateThemeStyles(theme);

        try {
            ensureThemeStylesheet(themeKey);
        } catch (_) { }

        if (styleEl) {
            styleEl.textContent = styles;
        } else {
            try {
                const style = document.createElement('style');
                style.id = 'luatools-styles';
                style.textContent = styles;
                document.head.appendChild(style);
            } catch (err) {
                backendLog('LuaTools: Styles injection failed: ' + err);
            }
        }
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
        } catch (err) {
            backendLog('LuaTools: Font Awesome injection failed: ' + err);
        }
    }

    function showSettingsPopup() {
        if (document.querySelector('.luatools-settings-overlay') || settingsMenuPending) return;
        settingsMenuPending = true;
        ensureTranslationsLoaded(false).catch(function () {
            return null;
        }).finally(function () {
            settingsMenuPending = false;
            if (document.querySelector('.luatools-settings-overlay')) return;

            try {
                const d = document.querySelector('.luatools-overlay');
                if (d) d.remove();
            } catch (_) { }
            ensureLuaToolsStyles();
            ensureFontAwesome();

            const overlay = document.createElement('div');
            overlay.className = 'luatools-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

            const modal = document.createElement('div');
            const colors = getThemeColors();
            modal.style.cssText = `position:relative;background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:8px;width:500px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.1s ease-out;`;

            const header = document.createElement('div');
            header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid ${colors.borderRgba};`;

            const title = document.createElement('div');
            title.style.cssText = `font-size:24px;color:${colors.text};font-weight:700;text-shadow:0 2px 8px ${colors.shadow};background:${colors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
            title.textContent = t('menu.title', 'LuaTools · Menu');

            const iconButtons = document.createElement('div');
            iconButtons.style.cssText = 'display:flex;gap:12px;';

            function createIconButton(id, iconClass, titleKey, titleFallback) {
                const btn = document.createElement('a');
                btn.id = id;
                btn.href = '#';
                const btnColors = getThemeColors();
                btn.style.cssText = `display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(${btnColors.rgbString},0.1);border:1px solid ${btnColors.borderRgba};border-radius:10px;color:${btnColors.accent};font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;`;
                btn.innerHTML = '<i class="fa-solid ' + iconClass + '"></i>';
                btn.title = t(titleKey, titleFallback);
                btn.onmouseover = function () {
                    this.style.background = `rgba(${btnColors.rgbString},0.25)`;
                    this.style.transform = 'translateY(-2px) scale(1.05)';
                    this.style.boxShadow = `0 8px 16px ${btnColors.shadowRgba}`;
                    this.style.borderColor = btnColors.accent;
                };
                btn.onmouseout = function () {
                    this.style.background = `rgba(${btnColors.rgbString},0.1)`;
                    this.style.transform = 'translateY(0) scale(1)';
                    this.style.boxShadow = 'none';
                    this.style.borderColor = btnColors.borderRgba;
                };
                iconButtons.appendChild(btn);
                return btn;
            }

            const body = document.createElement('div');
            body.style.cssText = 'font-size:14px;line-height:1.6;margin-bottom:12px;';

            // Add mouse mode tip for Big Picture
            if (window.__LUATOOLS_IS_BIG_PICTURE__) {
                const tip = document.createElement('div');
                tip.style.cssText = 'background:rgba(102,192,244,0.15);border-left:3px solid #66c0f4;padding:12px 16px;border-radius:6px;font-size:13px;color:#c7d5e0;margin-bottom:16px;line-height:1.5;';
                tip.innerHTML = '<i class="fa-solid fa-info-circle" style="margin-right:8px;color:#66c0f4;"></i>' + t('bigpicture.mouseTip', 'To use mouse mode in Steam: Guide Button + Right Joystick, click with RB');
                body.appendChild(tip);
            }

            const container = document.createElement('div');
            container.style.cssText = 'margin-top:16px;display:flex;flex-direction:column;gap:12px;align-items:stretch;';

            function createSectionLabel(key, fallback, marginTop) {
                const label = document.createElement('div');
                const topValue = typeof marginTop === 'number' ? marginTop : 12;
                const labelColors = getThemeColors();
                label.style.cssText = `font-size:12px;color:${labelColors.accent};margin-top:${topValue}px;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;text-align:center;`;
                label.textContent = t(key, fallback);
                container.appendChild(label);
                return label;
            }

            function createMenuButton(id, key, fallback, iconClass, isPrimary) {
                const btn = document.createElement('a');
                btn.id = id;
                btn.href = '#';
                const btnColors = getThemeColors();
                btn.style.cssText = `display:flex;align-items:center;justify-content:center;gap:8px;padding:14px 24px;background:linear-gradient(135deg, rgba(${btnColors.rgbString},0.15) 0%, rgba(${btnColors.rgbString},0.05) 100%);border:1px solid ${btnColors.borderRgba};border-radius:12px;color:${btnColors.text};font-size:15px;font-weight:500;text-decoration:none;transition:all 0.3s ease;cursor:pointer;position:relative;overflow:hidden;text-align:center;`;
                const iconHtml = iconClass ? '<i class="fa-solid ' + iconClass + '" style="font-size:16px;"></i>' : '';
                const textSpan = '<span style="text-align:center;">' + t(key, fallback) + '</span>';
                btn.innerHTML = iconHtml + textSpan;
                btn.onmouseover = function () {
                    const c = getThemeColors();
                    this.style.background = `linear-gradient(135deg, rgba(${c.rgbString},0.3) 0%, rgba(${c.rgbString},0.15) 100%)`;
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = `0 8px 20px ${c.shadow.replace('0.4', '0.25')}`;
                    this.style.borderColor = c.accent;
                };
                btn.onmouseout = function () {
                    const c = getThemeColors();
                    this.style.background = `linear-gradient(135deg, rgba(${c.rgbString},0.15) 0%, rgba(${c.rgbString},0.05) 100%)`;
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = 'none';
                    this.style.borderColor = c.borderRgba;
                };
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

            body.appendChild(container);

            header.appendChild(title);
            header.appendChild(iconButtons);
            modal.appendChild(header);
            modal.appendChild(body);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Re-scan elements for gamepad navigation
            setTimeout(function () {
                if (window.GamepadNav) {
                    window.GamepadNav.scanElements();
                }
            }, 150);

            if (checkBtn) {
                checkBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    try {
                        overlay.remove();
                    } catch (_) { }
                    try {
                        Millennium.callServerMethod('luatools', 'CheckForUpdatesNow', {
                            contentScriptQuery: ''
                        }).then(function (res) {
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                const msg = (payload && payload.message) ? String(payload.message) : lt('No updates available.');
                                ShowLuaToolsAlert('LuaTools', msg);
                            } catch (_) { }
                        });
                    } catch (_) { }
                });
            }

            if (discordBtn) {
                discordBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    try {
                        overlay.remove();
                    } catch (_) { }
                    const url = 'https://discord.gg/luatools';
                    try {
                        Millennium.callServerMethod('luatools', 'OpenExternalUrl', {
                            url,
                            contentScriptQuery: ''
                        });
                    } catch (_) { }
                });
            }

            if (fetchApisBtn) {
                fetchApisBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    try {
                        overlay.remove();
                    } catch (_) { }
                    try {
                        Millennium.callServerMethod('luatools', 'FetchFreeApisNow', {
                            contentScriptQuery: ''
                        }).then(function (res) {
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                const ok = payload && payload.success;
                                const count = payload && payload.count;
                                const successText = lt('Loaded free APIs: {count}').replace('{count}', (count != null ? count : '?'));
                                const failText = (payload && payload.error) ? String(payload.error) : lt('Failed to load free APIs.');
                                const text = ok ? successText : failText;
                                ShowLuaToolsAlert('LuaTools', text);
                            } catch (_) { }
                        });
                    } catch (_) { }
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    overlay.remove();
                });
            }

            if (settingsManagerBtn) { // This is the icon button now
                settingsManagerBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    try {
                        overlay.remove();
                    } catch (_) { }
                    showSettingsManagerPopup(false, showSettingsPopup);
                });
            }

            if (fixesMenuBtn) {
                fixesMenuBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    try {
                        const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                        const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                        if (isNaN(appid)) {
                            try {
                                overlay.remove();
                            } catch (_) { }
                            const errText = t('menu.error.noAppId', 'Could not determine game AppID');
                            ShowLuaToolsAlert('LuaTools', errText);
                            return;
                        }

                        Millennium.callServerMethod('luatools', 'GetGameInstallPath', {
                            appid,
                            contentScriptQuery: ''
                        }).then(function (pathRes) {
                            try {
                                let isGameInstalled = false;
                                const pathPayload = typeof pathRes === 'string' ? JSON.parse(pathRes) : pathRes;
                                if (pathPayload && pathPayload.success && pathPayload.installPath) {
                                    isGameInstalled = true;
                                    window.__LuaToolsGameInstallPath = pathPayload.installPath;
                                }
                                window.__LuaToolsGameIsInstalled = isGameInstalled;
                                try {
                                    overlay.remove();
                                } catch (_) { }
                                showFixesLoadingPopupAndCheck(appid);
                            } catch (err) {
                                backendLog('LuaTools: GetGameInstallPath error: ' + err);
                                try {
                                    overlay.remove();
                                } catch (_) { }
                            }
                        }).catch(function () {
                            try {
                                overlay.remove();
                            } catch (_) { }
                            const errorText = t('menu.error.getPath', 'Error getting game path');
                            ShowLuaToolsAlert('LuaTools', errorText);
                        });
                    } catch (err) {
                        backendLog('LuaTools: Fixes Menu button error: ' + err);
                    }
                });
            }

            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    Millennium.callServerMethod('luatools', 'HasLuaToolsForApp', {
                        appid,
                        contentScriptQuery: ''
                    }).then(function (res) {
                        try {
                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                            const exists = !!(payload && payload.success && payload.exists === true);
                            if (exists) {
                                const doDelete = function () {
                                    try {
                                        Millennium.callServerMethod('luatools', 'DeleteLuaToolsForApp', {
                                            appid,
                                            contentScriptQuery: ''
                                        }).then(function () {
                                            try {
                                                window.__LuaToolsButtonInserted = false;
                                                window.__LuaToolsPresenceCheckInFlight = false;
                                                window.__LuaToolsPresenceCheckAppId = undefined;
                                                addLuaToolsButton();
                                                const successText = t('menu.remove.success', 'LuaTools removed for this app.');
                                                ShowLuaToolsAlert('LuaTools', successText);
                                            } catch (err) {
                                                backendLog('LuaTools: post-delete cleanup failed: ' + err);
                                            }
                                        }).catch(function (err) {
                                            const failureText = t('menu.remove.failure', 'Failed to remove LuaTools.');
                                            const errMsg = (err && err.message) ? err.message : failureText;
                                            ShowLuaToolsAlert('LuaTools', errMsg);
                                        });
                                    } catch (err) {
                                        backendLog('LuaTools: doDelete failed: ' + err);
                                    }
                                };

                                removeBtn.style.display = 'flex';
                                removeBtn.onclick = function (e) {
                                    e.preventDefault();
                                    try {
                                        overlay.remove();
                                    } catch (_) { }
                                    const confirmMessage = t('menu.remove.confirm', 'Remove via LuaTools for this game?');
                                    showLuaToolsConfirm('LuaTools', confirmMessage, function () {
                                        doDelete();
                                    }, function () {
                                        try {
                                            showSettingsPopup();
                                        } catch (_) { }
                                    });
                                };
                            } else {
                                removeBtn.style.display = 'none';
                            }
                        } catch (_) { }
                    });
                }
            } catch (_) { }
        });
    }

    function ensureTranslationsLoaded(forceRefresh, preferredLanguage) {
        try {
            if (!forceRefresh && window.__LuaToolsI18n && window.__LuaToolsI18n.ready) {
                return Promise.resolve(window.__LuaToolsI18n);
            }
            if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
                window.__LuaToolsI18n = window.__LuaToolsI18n || {
                    language: 'en',
                    locales: [],
                    strings: {},
                    ready: false
                };
                return Promise.resolve(window.__LuaToolsI18n);
            }
            const settingsVals = ((window.__LuaToolsSettings || {}).values || {}).general || {};
            const useSteamLang = typeof settingsVals.useSteamLanguage === 'boolean' ? settingsVals.useSteamLanguage : true;
            let targetLanguage = (typeof preferredLanguage === 'string' && preferredLanguage) ? preferredLanguage : '';
            if (!targetLanguage) {
                let steamLang = document.documentElement.lang || 'en';
                if (steamLang.toLowerCase() === 'pt-br') steamLang = 'pt-BR';
                if (steamLang.toLowerCase() === 'zh-cn') steamLang = 'zh-CN';
                if (steamLang.toLowerCase() === 'zh-tw') steamLang = 'zh-TW';
                if (steamLang.toLowerCase() === 'es-419') steamLang = 'es';
                targetLanguage = useSteamLang ? steamLang : ((window.__LuaToolsI18n && window.__LuaToolsI18n.language) || 'en');
            }
            return Millennium.callServerMethod('luatools', 'GetTranslations', {
                language: targetLanguage,
                contentScriptQuery: ''
            }).then(function (res) {
                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                if (!payload || payload.success !== true || !payload.strings) {
                    throw new Error('Invalid translation payload');
                }
                applyTranslationBundle(payload);
                // Update button text after translations are loaded
                updateButtonTranslations();
                return window.__LuaToolsI18n;
            }).catch(function (err) {
                backendLog('LuaTools: translation load failed: ' + err);
                window.__LuaToolsI18n = window.__LuaToolsI18n || {
                    language: 'en',
                    locales: [],
                    strings: {},
                    ready: false
                };
                return window.__LuaToolsI18n;
            });
        } catch (err) {
            backendLog('LuaTools: ensureTranslationsLoaded error: ' + err);
            window.__LuaToolsI18n = window.__LuaToolsI18n || {
                language: 'en',
                locales: [],
                strings: {},
                ready: false
            };
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
        } catch (_) { }
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
        try {
            const s = document.querySelector('.luatools-settings-overlay');
            if (s) s.remove();
        } catch (_) { }

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const colors = getThemeColors();
        modal.style.cssText = `background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:8px;width:520px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const title = document.createElement('div');
        const titleColors = getThemeColors();
        title.style.cssText = `font-size:22px;color:${titleColors.text};margin-bottom:20px;font-weight:700;text-shadow:0 2px 8px ${titleColors.shadow};background:${titleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        title.className = 'luatools-title';
        title.textContent = t('common.appName', 'LuaTools');

        // API list container
        const apiListContainer = document.createElement('div');
        apiListContainer.className = 'luatools-api-list';
        apiListContainer.style.cssText = 'margin-bottom:16px;';

        // Placeholder while loading APIs
        const loadingItem = document.createElement('div');
        loadingItem.style.cssText = `text-align:center;padding:10px;color:${colors.textSecondary};font-size:13px;`;
        loadingItem.textContent = lt('Loading APIs...');
        apiListContainer.appendChild(loadingItem);

        // Load APIs dynamically from backend
        if (typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
            Millennium.callServerMethod('luatools', 'GetApiList', {
                contentScriptQuery: ''
            }).then(function (res) {
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
                            apiItem.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:8px;background:rgba(${colors.rgbString},0.1);border:1px solid ${colors.borderRgba};border-radius:6px;transition:all 0.2s;`;

                            const apiName = document.createElement('div');
                            apiName.className = 'luatools-api-name';
                            apiName.style.cssText = `font-size:14px;color:${colors.textSecondary};font-weight:500;`;
                            apiName.textContent = api.name;

                            const apiStatus = document.createElement('div');
                            apiStatus.className = 'luatools-api-status';
                            apiStatus.style.cssText = `font-size:14px;color:${colors.textSecondary};display:flex;align-items:center;gap:6px;`;
                            apiStatus.innerHTML = '<span>' + lt('Waiting…') + '</span><i class="fa-solid fa-spinner" style="animation: spin 1.5s linear infinite;"></i>';

                            apiItem.appendChild(apiName);
                            apiItem.appendChild(apiStatus);
                            apiListContainer.appendChild(apiItem);
                        });
                    }
                } catch (err) {
                    backendLog('Failed to parse API list: ' + err);
                }
            }).catch(function (err) {
                backendLog('Failed to load API list: ' + err);
            });
        }

        const body = document.createElement('div');
        body.style.cssText = `font-size:14px;line-height:1.4;margin-bottom:12px;color:${colors.textSecondary};`;
        body.className = 'luatools-status';
        body.textContent = lt('Checking availability…');

        const progressWrap = document.createElement('div');
        progressWrap.style.cssText = `background:rgba(0,0,0,0.3);height:20px;border-radius:4px;overflow:hidden;position:relative;display:none;border:1px solid ${colors.border};margin-top:12px;`;
        progressWrap.className = 'luatools-progress-wrap';
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `height:100%;width:0%;background:${colors.gradient};transition:width 0.3s ease;box-shadow:0 0 10px ${colors.shadow};`;
        progressBar.className = 'luatools-progress-bar';
        progressWrap.appendChild(progressBar);

        const progressInfo = document.createElement('div');
        progressInfo.style.cssText = `display:none;margin-top:8px;font-size:12px;color:${colors.textSecondary};`;
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
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            cancelOperation();
        };
        const hideBtn = document.createElement('a');
        hideBtn.className = 'luatools-btn luatools-hide-btn';
        hideBtn.innerHTML = `<span>${lt('Hide')}</span>`;
        hideBtn.href = '#';
        hideBtn.onclick = function (e) {
            e.preventDefault();
            cleanup();
        };
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

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);

        function cleanup() {
            overlay.remove();
        }

        function cancelOperation() {
            // Call backend to cancel the operation
            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    Millennium.callServerMethod('luatools', 'CancelAddViaLuaTools', {
                        appid,
                        contentScriptQuery: ''
                    });
                }
            } catch (_) { }
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
        try {
            const d = document.querySelector('.luatools-overlay');
            if (d) d.remove();
        } catch (_) { }
        try {
            const s = document.querySelector('.luatools-settings-overlay');
            if (s) s.remove();
        } catch (_) { }
        try {
            const f = document.querySelector('.luatools-fixes-results-overlay');
            if (f) f.remove();
        } catch (_) { }
        try {
            const l = document.querySelector('.luatools-loading-fixes-overlay');
            if (l) l.remove();
        } catch (_) { }

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-fixes-results-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const colors = getThemeColors();
        modal.style.cssText = `position:relative;background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:8px;width:640px;max-height:80vh;display:flex;flex-direction:column;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const header = document.createElement('div');
        header.style.cssText = `flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid ${colors.borderRgba};`;

        const title = document.createElement('div');
        title.style.cssText = `font-size:24px;color:${colors.text};font-weight:700;text-shadow:0 2px 8px ${colors.shadow};background:${colors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        title.textContent = lt('LuaTools · Fixes Menu');

        const iconButtons = document.createElement('div');
        iconButtons.style.cssText = 'display:flex;gap:12px;';

        function createIconButton(id, iconClass, titleKey, titleFallback) {
            const btn = document.createElement('a');
            btn.id = id;
            btn.href = '#';
            const btnColors = getThemeColors();
            btn.style.cssText = `display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(${btnColors.rgbString},0.1);border:1px solid ${btnColors.borderRgba};border-radius:10px;color:${btnColors.accent};font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;`;
            btn.innerHTML = '<i class="fa-solid ' + iconClass + '"></i>';
            btn.title = t(titleKey, titleFallback);
            btn.onmouseover = function () {
                this.style.background = `rgba(${btnColors.rgbString},0.25)`;
                this.style.transform = 'translateY(-2px) scale(1.05)';
                this.style.boxShadow = `0 8px 16px ${btnColors.shadowRgba}`;
                this.style.borderColor = btnColors.accent;
            };
            btn.onmouseout = function () {
                this.style.background = `rgba(${btnColors.rgbString},0.1)`;
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = 'none';
                this.style.borderColor = btnColors.borderRgba;
            };
            iconButtons.appendChild(btn);
            return btn;
        }

        const discordBtn = createIconButton('lt-fixes-discord', 'fa-brands fa-discord', 'menu.discord', 'Discord');
        const settingsBtn = createIconButton('lt-fixes-settings', 'fa-gear', 'menu.settings', 'Settings');
        const closeIconBtn = createIconButton('lt-fixes-close', 'fa-xmark', 'settings.close', 'Close');

        const body = document.createElement('div');
        const bodyColors = getThemeColors();
        body.style.cssText = `flex:1 1 auto;overflow-y:auto;padding:20px;border:1px solid ${bodyColors.border};border-radius:12px;background:${bodyColors.bgContainer};`

        try {
            const bannerImg = document.querySelector('.game_header_image_full');
            if (bannerImg && bannerImg.src) {
                body.style.background = `linear-gradient(to bottom, rgba(15, 15, 15, 0.85), #0f0f0f 70%), url('${bannerImg.src}') no-repeat top center`;
                body.style.backgroundSize = 'cover';
            }
        } catch (_) { }

        // Add mouse mode tip for Big Picture
        if (window.__LUATOOLS_IS_BIG_PICTURE__) {
            const tip = document.createElement('div');
            tip.style.cssText = 'background:rgba(102,192,244,0.15);border-left:3px solid #66c0f4;padding:12px 16px;border-radius:6px;font-size:13px;color:#c7d5e0;margin-bottom:16px;line-height:1.5;';
            tip.innerHTML = '<i class="fa-solid fa-info-circle" style="margin-right:8px;color:#66c0f4;"></i>' + t('bigpicture.mouseTip', 'To use mouse mode in Steam: Guide Button + Right Joystick, click with RB');
            body.appendChild(tip);
        }

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
        } catch (_) { }

        const gameName = document.createElement('div');
        gameName.style.cssText = 'font-size:22px;color:#fff;font-weight:600;text-align:center;';
        gameName.textContent = data.gameName || lt('Unknown Game');

        if (!data.gameName || data.gameName === 'Unknown Game' || data.gameName === lt('Unknown Game') || data.gameName.startsWith('Unknown Game')) {
            fetchSteamGameName(data.appid).then(function (name) {
                if (name) {
                    data.gameName = name;
                    gameName.textContent = name;
                }
            });
        }


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
            const labelColors = getThemeColors();
            sectionLabel.style.cssText = `font-size:12px;color:${labelColors.accent};margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:1px;`;
            sectionLabel.textContent = label;

            const btn = document.createElement('a');
            btn.href = '#';
            const btnColors = getThemeColors();
            btn.style.cssText = `display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:14px 24px;background:linear-gradient(135deg, rgba(${btnColors.rgbString},0.15) 0%, rgba(${btnColors.rgbString},0.05) 100%);border:1px solid ${btnColors.border};border-radius:12px;color:${btnColors.text};font-size:15px;font-weight:500;text-decoration:none;transition:all 0.3s ease;cursor:pointer;`;
            btn.innerHTML = '<i class="fa-solid ' + icon + '" style="font-size:16px;"></i><span>' + text + '</span>';

            // If the active theme is light, make certain fix action texts/icons white for readability.
            try {
                const currentThemeKey = (((window.__LuaToolsSettings || {}).values || {}).general || {}).theme || 'original';
                // Use localized labels so this works in other languages
                const applyLabel = lt('Apply');
                const onlineUnsteamLabel = lt('Online Fix (Unsteam)');
                const noOnlineLabel = lt('No online-fix');
                const unfixLabel = lt('Un-Fix (verify game)');
                const noGenericLabel = lt('No generic fix');
                const whiteTexts = new Set([applyLabel, onlineUnsteamLabel, noOnlineLabel, unfixLabel, noGenericLabel]);
                if (currentThemeKey === 'light' && whiteTexts.has(String(text))) {
                    const spanEl = btn.querySelector('span');
                    const iconEl = btn.querySelector('i');
                    if (spanEl) spanEl.style.color = '#ffffff';
                    if (iconEl) iconEl.style.color = '#ffffff';
                }
            } catch (_) { }

            if (isSuccess) {
                btn.style.background = 'linear-gradient(135deg, rgba(92,156,62,0.4) 0%, rgba(92,156,62,0.2) 100%)';
                btn.style.borderColor = 'rgba(92,156,62,0.6)';
                btn.onmouseover = function () {
                    this.style.background = 'linear-gradient(135deg, rgba(92,156,62,0.6) 0%, rgba(92,156,62,0.3) 100%)';
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = '0 8px 20px rgba(92,156,62,0.3)';
                    this.style.borderColor = '#79c754';
                };
                btn.onmouseout = function () {
                    this.style.background = 'linear-gradient(135deg, rgba(92,156,62,0.4) 0%, rgba(92,156,62,0.2) 100%)';
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = 'none';
                    this.style.borderColor = 'rgba(92,156,62,0.6)';
                };
            } else if (isSuccess === false) {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                const mutableColors = getThemeColors();
                btn.onmouseover = function () {
                    const c = getThemeColors();
                    this.style.background = `linear-gradient(135deg, rgba(${c.rgbString},0.3) 0%, rgba(${c.rgbString},0.15) 100%)`;
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = `0 8px 20px rgba(${c.rgbString},0.25)`;
                    this.style.borderColor = c.accent;
                };
                btn.onmouseout = function () {
                    const c = getThemeColors();
                    this.style.background = `linear-gradient(135deg, rgba(${c.rgbString},0.15) 0%, rgba(${c.rgbString},0.05) 100%)`;
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = 'none';
                    this.style.borderColor = c.border;
                };
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
            function (e) {
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
            function (e) {
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
            function (e) {
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
            function (e) {
                e.preventDefault();
                if (isGameInstalled) {
                    try {
                        overlay.remove();
                    } catch (_) { }
                    showLuaToolsConfirm('LuaTools', lt('Are you sure you want to un-fix? This will remove fix files and verify game files.'),
                        function () {
                            startUnfix(data.appid);
                        },
                        function () {
                            showFixesResultsPopup(data, isGameInstalled);
                        }
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
        const creditColors = getThemeColors();
        creditMsg.style.cssText = `margin-top:16px;text-align:center;font-size:13px;color:${creditColors.textSecondary};`;
        const creditTemplate = lt('Only possible thanks to {name} 💜');
        creditMsg.innerHTML = creditTemplate.replace('{name}', `<a href="#" id="lt-shayenvi-link" style="color:${creditColors.accent};text-decoration:none;font-weight:600;">ShayneVi</a>`);

        // Wire up ShayneVi link
        setTimeout(function () {
            const shayenviLink = overlay.querySelector('#lt-shayenvi-link');
            if (shayenviLink) {
                shayenviLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    try {
                        Millennium.callServerMethod('luatools', 'OpenExternalUrl', {
                            url: 'https://github.com/ShayneVi/',
                            contentScriptQuery: ''
                        });
                    } catch (_) { }
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
        gameFolderBtn.onclick = function (e) {
            e.preventDefault();
            if (window.__LuaToolsGameInstallPath) {
                try {
                    Millennium.callServerMethod('luatools', 'OpenGameFolder', {
                        path: window.__LuaToolsGameInstallPath,
                        contentScriptQuery: ''
                    });
                } catch (err) {
                    backendLog('LuaTools: Failed to open game folder: ' + err);
                }
            }
        };
        rightButtons.appendChild(gameFolderBtn);

        const backBtn = document.createElement('a');
        backBtn.className = 'luatools-btn';
        backBtn.innerHTML = '<span><i class="fa-solid fa-arrow-left"></i></span>';
        backBtn.href = '#';
        backBtn.onclick = function (e) {
            e.preventDefault();
            try {
                overlay.remove();
            } catch (_) { }
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

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);

        closeIconBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
        };
        discordBtn.onclick = function (e) {
            e.preventDefault();
            try {
                overlay.remove();
            } catch (_) { }
            const url = 'https://discord.gg/luatools';
            try {
                Millennium.callServerMethod('luatools', 'OpenExternalUrl', {
                    url,
                    contentScriptQuery: ''
                });
            } catch (_) { }
        };
        settingsBtn.onclick = function (e) {
            e.preventDefault();
            try {
                overlay.remove();
            } catch (_) { }
            showSettingsManagerPopup(false, function () {
                showFixesResultsPopup(data, isGameInstalled);
            });
        };

        function startUnfix(appid) {
            try {
                Millennium.callServerMethod('luatools', 'UnFixGame', {
                    appid: appid,
                    installPath: window.__LuaToolsGameInstallPath,
                    contentScriptQuery: ''
                }).then(function (res) {
                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                    if (payload && payload.success) {
                        showUnfixProgress(appid);
                    } else {
                        const errorKey = (payload && payload.error) ? String(payload.error) : '';
                        const errorMsg = (errorKey && (errorKey.startsWith('menu.error.') || errorKey.startsWith('common.'))) ? t(errorKey) : (errorKey || lt('Failed to start un-fix'));
                        ShowLuaToolsAlert('LuaTools', errorMsg);
                    }
                }).catch(function () {
                    const msg = lt('Error starting un-fix');
                    ShowLuaToolsAlert('LuaTools', msg);
                });
            } catch (err) {
                backendLog('LuaTools: Un-Fix start error: ' + err);
            }
        }
    }

    function showFixesLoadingPopupAndCheck(appid) {
        if (document.querySelector('.luatools-loading-fixes-overlay')) return;
        try {
            const d = document.querySelector('.luatools-overlay');
            if (d) d.remove();
        } catch (_) { }
        try {
            const s = document.querySelector('.luatools-settings-overlay');
            if (s) s.remove();
        } catch (_) { }
        try {
            const f = document.querySelector('.luatools-fixes-overlay');
            if (f) f.remove();
        } catch (_) { }

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-loading-fixes-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const colors = getThemeColors();
        modal.style.cssText = `background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:8px;width:480px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const title = document.createElement('div');
        const titleColorsLoading = getThemeColors();
        title.style.cssText = `font-size:22px;color:${titleColorsLoading.text};margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px ${titleColorsLoading.shadow};background:${titleColorsLoading.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        title.textContent = lt('Loading fixes...');

        const body = document.createElement('div');
        const bodyColorsLoading = getThemeColors();
        body.style.cssText = `font-size:14px;line-height:1.6;margin-bottom:16px;color:${bodyColorsLoading.textSecondary};`;
        body.textContent = lt('Checking availability…');

        const progressWrap = document.createElement('div');
        const progressColorsLoading = getThemeColors();
        progressWrap.style.cssText = `background:rgba(0,0,0,0.3);height:12px;border-radius:4px;overflow:hidden;position:relative;border:1px solid ${progressColorsLoading.border};`;
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `height:100%;width:0%;background:${progressColorsLoading.gradient};transition:width 0.2s linear;box-shadow:0 0 10px ${progressColorsLoading.shadow};`;
        progressWrap.appendChild(progressBar);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(progressWrap);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);

        let progress = 0;
        const progressInterval = setInterval(function () {
            if (progress < 95) {
                progress += Math.random() * 5;
                progressBar.style.width = Math.min(progress, 95) + '%';
            }
        }, 200);

        fetchFixes(appid).then(function (payload) {
            if (payload && payload.success) {
                const isGameInstalled = window.__LuaToolsGameIsInstalled === true;
                showFixesResultsPopup(payload, isGameInstalled);
            } else {
                const errText = (payload && payload.error) ? String(payload.error) : lt('Failed to check for fixes.');
                ShowLuaToolsAlert('LuaTools', errText);
            }
        }).catch(function () {
            const msg = lt('Error checking for fixes');
            ShowLuaToolsAlert('LuaTools', msg);
        }).finally(function () {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            setTimeout(function () {
                try {
                    const l = document.querySelector('.luatools-loading-fixes-overlay');
                    if (l) l.remove();
                } catch (_) { }
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
            }).then(function (res) {
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
                } catch (err) {
                    backendLog('LuaTools: ApplyGameFix response error: ' + err);
                    const msg = lt('Error applying fix');
                    ShowLuaToolsAlert('LuaTools', msg);
                }
            }).catch(function (err) {
                backendLog('LuaTools: ApplyGameFix error: ' + err);
                const msg = lt('Error applying fix');
                ShowLuaToolsAlert('LuaTools', msg);
            });
        } catch (err) {
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
        const colors = getThemeColors();
        modal.style.cssText = `background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:8px;width:480px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const title = document.createElement('div');
        const applyFixTitleColors = getThemeColors();
        title.style.cssText = `font-size:22px;color:${applyFixTitleColors.text};margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px ${applyFixTitleColors.shadow};background:${applyFixTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        title.textContent = lt('Applying {fix}').replace('{fix}', fixType);

        const body = document.createElement('div');
        const applyFixBodyColors = getThemeColors();
        body.style.cssText = `font-size:15px;line-height:1.6;margin-bottom:20px;color:${applyFixBodyColors.textSecondary};`;
        body.innerHTML = '<div id="lt-fix-progress-msg">' + lt('Downloading...') + '</div>';

        const btnRow = document.createElement('div');
        btnRow.className = 'lt-fix-btn-row';
        btnRow.style.cssText = 'margin-top:16px;display:flex;gap:12px;justify-content:center;';

        const hideBtn = document.createElement('a');
        hideBtn.href = '#';
        hideBtn.className = 'luatools-btn';
        hideBtn.style.flex = '1';
        hideBtn.innerHTML = `<span>${lt('Hide')}</span>`;
        hideBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
        };
        btnRow.appendChild(hideBtn);

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'luatools-btn primary';
        cancelBtn.style.flex = '1';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            if (cancelBtn.dataset.pending === '1') return;
            cancelBtn.dataset.pending = '1';
            const span = cancelBtn.querySelector('span');
            if (span) span.textContent = lt('Cancelling...');
            const msgEl = document.getElementById('lt-fix-progress-msg');
            if (msgEl) msgEl.textContent = lt('Cancelling...');
            Millennium.callServerMethod('luatools', 'CancelApplyFix', {
                appid: appid,
                contentScriptQuery: ''
            }).then(function (res) {
                try {
                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                    if (!payload || payload.success !== true) {
                        throw new Error((payload && payload.error) || lt('Cancellation failed'));
                    }
                } catch (err) {
                    cancelBtn.dataset.pending = '0';
                    if (span) span.textContent = lt('Cancel');
                    const msgEl2 = document.getElementById('lt-fix-progress-msg');
                    if (msgEl2 && msgEl2.dataset.last) msgEl2.textContent = msgEl2.dataset.last;
                    backendLog('LuaTools: CancelApplyFix response error: ' + err);
                    const msg = lt('Failed to cancel fix download');
                    ShowLuaToolsAlert('LuaTools', msg);
                }
            }).catch(function (err) {
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

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);

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
        closeBtn.onclick = function (e) {
            e.preventDefault();
            overlayEl.remove();
        };
        btnRow.appendChild(closeBtn);
    }

    // Poll fix download and extraction progress
    function pollFixProgress(appid, fixType) {
        const poll = function () {
            try {
                const overlayEl = document.querySelector('.luatools-overlay');
                if (!overlayEl) return; // Stop if overlay was closed

                Millennium.callServerMethod('luatools', 'GetApplyFixStatus', {
                    appid: appid,
                    contentScriptQuery: ''
                }).then(function (res) {
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        if (payload && payload.success && payload.state) {
                            const state = payload.state;
                            const msgEl = document.getElementById('lt-fix-progress-msg');

                            if (state.status === 'downloading') {
                                const pct = state.totalBytes > 0 ? Math.floor((state.bytesRead / state.totalBytes) * 100) : 0;
                                if (msgEl) {
                                    msgEl.textContent = lt('Downloading: {percent}%').replace('{percent}', pct);
                                    msgEl.dataset.last = msgEl.textContent;
                                }
                                setTimeout(poll, 500);
                            } else if (state.status === 'extracting') {
                                if (msgEl) {
                                    msgEl.textContent = lt('Extracting to game folder...');
                                    msgEl.dataset.last = msgEl.textContent;
                                }
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
                    } catch (err) {
                        backendLog('LuaTools: GetApplyFixStatus error: ' + err);
                    }
                });
            } catch (err) {
                backendLog('LuaTools: pollFixProgress error: ' + err);
            }
        };
        setTimeout(poll, 500);
    }

    // Show un-fix progress popup
    function showUnfixProgress(appid) {
        // Remove any existing popup
        try {
            const old = document.querySelector('.luatools-unfix-overlay');
            if (old) old.remove();
        } catch (_) { }

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-unfix-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const colors = getThemeColors();
        modal.style.cssText = `background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:8px;width:480px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const title = document.createElement('div');
        const unfixTitleColors = getThemeColors();
        title.style.cssText = `font-size:22px;color:${unfixTitleColors.text};margin-bottom:16px;font-weight:700;text-shadow:0 2px 8px ${unfixTitleColors.shadow};background:${unfixTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
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
        hideBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
        };
        btnRow.appendChild(hideBtn);

        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);

        // Start polling for progress
        pollUnfixProgress(appid);
    }

    // Poll un-fix progress
    function pollUnfixProgress(appid) {
        const poll = function () {
            try {
                const overlayEl = document.querySelector('.luatools-unfix-overlay');
                if (!overlayEl) return; // Stop if overlay was closed

                Millennium.callServerMethod('luatools', 'GetUnfixStatus', {
                    appid: appid,
                    contentScriptQuery: ''
                }).then(function (res) {
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
                                        closeBtn.onclick = function (e) {
                                            e.preventDefault();
                                            overlayEl.remove();
                                        };
                                        btnRow.appendChild(closeBtn);
                                    }
                                } catch (_) { }

                                // Trigger Steam verification after a short delay
                                setTimeout(function () {
                                    try {
                                        const verifyUrl = 'steam://validate/' + appid;
                                        window.location.href = verifyUrl;
                                        backendLog('LuaTools: Running verify for appid ' + appid);
                                    } catch (_) { }
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
                                        closeBtn.onclick = function (e) {
                                            e.preventDefault();
                                            overlayEl.remove();
                                        };
                                        btnRow.appendChild(closeBtn);
                                    }
                                } catch (_) { }
                                return; // Stop polling
                            } else {
                                // Continue polling for unknown states
                                setTimeout(poll, 500);
                            }
                        }
                    } catch (err) {
                        backendLog('LuaTools: GetUnfixStatus error: ' + err);
                    }
                });
            } catch (err) {
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
        } catch (_) { }

        if (typeof Millennium === 'undefined' || typeof Millennium.callServerMethod !== 'function') {
            return Promise.reject(new Error(lt('LuaTools backend unavailable')));
        }

        return Millennium.callServerMethod('luatools', 'GetSettingsConfig', {
            contentScriptQuery: ''
        }).then(function (res) {
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

        try {
            const mainOverlay = document.querySelector('.luatools-settings-overlay');
            if (mainOverlay) mainOverlay.remove();
        } catch (_) { }

        ensureLuaToolsStyles();
        ensureFontAwesome();

        const overlay = document.createElement('div');
        overlay.className = 'luatools-settings-manager-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:100000;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const settingsModalColors = getThemeColors();
        modal.style.cssText = `position:relative;background:${settingsModalColors.modalBg};color:${settingsModalColors.text};border:2px solid ${settingsModalColors.border};border-radius:8px;width:700px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${settingsModalColors.shadowRgba};animation:slideUp 0.1s ease-out;overflow:hidden;`;

        const header = document.createElement('div');
        const settingsHeaderColors = getThemeColors();
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding:28px 32px 16px;border-bottom:2px solid ${settingsHeaderColors.border.replace('0.3', '0.2')};`;

        const title = document.createElement('div');
        const settingsTitleColors = getThemeColors();
        title.style.cssText = `font-size:24px;color:${settingsTitleColors.text};font-weight:700;text-shadow:0 2px 8px ${settingsTitleColors.shadow};background:${settingsTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        title.textContent = t('settings.title', 'LuaTools · Settings');

        const iconButtons = document.createElement('div');
        iconButtons.style.cssText = 'display:flex;gap:12px;';

        const discordIconBtn = document.createElement('a');
        discordIconBtn.href = '#';
        const discordBtnColors = getThemeColors();
        discordIconBtn.style.cssText = `display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(${discordBtnColors.rgbString},0.1);border:1px solid ${discordBtnColors.border};border-radius:10px;color:${discordBtnColors.accent};font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;`;
        discordIconBtn.innerHTML = '<i class="fa-brands fa-discord"></i>';
        discordIconBtn.title = t('menu.discord', 'Discord');
        discordIconBtn.onmouseover = function () {
            const c = getThemeColors();
            this.style.background = `rgba(${c.rgbString},0.25)`;
            this.style.transform = 'translateY(-2px) scale(1.05)';
            this.style.boxShadow = `0 8px 16px ${c.shadow}`;
            this.style.borderColor = c.accent;
        };
        discordIconBtn.onmouseout = function () {
            const c = getThemeColors();
            this.style.background = `rgba(${c.rgbString},0.1)`;
            this.style.transform = 'translateY(0) scale(1)';
            this.style.boxShadow = 'none';
            this.style.borderColor = c.border;
        };
        iconButtons.appendChild(discordIconBtn);

        const closeIconBtn = document.createElement('a');
        closeIconBtn.href = '#';
        const closeBtnColors = getThemeColors();
        closeIconBtn.style.cssText = `display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(${closeBtnColors.rgbString},0.1);border:1px solid ${closeBtnColors.border};border-radius:10px;color:${closeBtnColors.accent};font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;`;
        closeIconBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        closeIconBtn.title = t('settings.close', 'Close');
        closeIconBtn.onmouseover = function () {
            const c = getThemeColors();
            this.style.background = `rgba(${c.rgbString},0.25)`;
            this.style.transform = 'translateY(-2px) scale(1.05)';
            this.style.boxShadow = `0 8px 16px ${c.shadow}`;
            this.style.borderColor = c.accent;
        };
        closeIconBtn.onmouseout = function () {
            const c = getThemeColors();
            this.style.background = `rgba(${c.rgbString},0.1)`;
            this.style.transform = 'translateY(0) scale(1)';
            this.style.boxShadow = 'none';
            this.style.borderColor = c.border;
        };
        iconButtons.appendChild(closeIconBtn);

        // Search bar container
        const searchContainer = document.createElement('div');
        const searchColors = getThemeColors();
        searchContainer.style.cssText = 'padding:0 24px 16px;';

        const searchWrap = document.createElement('div');
        searchWrap.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 14px;background:${searchColors.bgTertiary};border:1px solid ${searchColors.border};border-radius:10px;transition:all 0.2s ease;`;

        const searchIcon = document.createElement('i');
        searchIcon.className = 'fa-solid fa-magnifying-glass';
        searchIcon.style.cssText = `color:${searchColors.textSecondary};font-size:14px;`;

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'luatools-settings-search';
        searchInput.placeholder = t('settings.search.placeholder', 'Search settings, games, fixes...');
        searchInput.style.cssText = `flex:1;background:transparent;border:none;outline:none;color:${searchColors.text};font-size:14px;`;
        searchInput.setAttribute('autocomplete', 'off');

        const searchClear = document.createElement('a');
        searchClear.href = '#';
        searchClear.style.cssText = `display:none;color:${searchColors.textSecondary};font-size:14px;text-decoration:none;padding:4px;`;
        searchClear.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        searchClear.title = t('settings.search.clear', 'Clear search');

        searchWrap.onfocus = function () {
            searchWrap.style.borderColor = searchColors.accent;
        };
        searchInput.onfocus = function () {
            const c = getThemeColors();
            searchWrap.style.borderColor = c.accent;
            searchWrap.style.boxShadow = `0 0 0 3px rgba(${c.rgbString},0.15)`;
        };
        searchInput.onblur = function () {
            const c = getThemeColors();
            searchWrap.style.borderColor = c.border;
            searchWrap.style.boxShadow = 'none';
        };

        searchWrap.appendChild(searchIcon);
        searchWrap.appendChild(searchInput);
        searchWrap.appendChild(searchClear);
        searchContainer.appendChild(searchWrap);

        const contentWrap = document.createElement('div');
        contentWrap.id = 'luatools-content-wrap';
        const contentColors = getThemeColors();
        contentWrap.style.cssText = `flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:20px;margin:0 24px;border:1px solid ${contentColors.border};border-radius:12px;background:${contentColors.bgContainer};`;

        // Add mouse mode tip for Big Picture
        if (window.__LUATOOLS_IS_BIG_PICTURE__) {
            const tip = document.createElement('div');
            tip.style.cssText = 'background:rgba(102,192,244,0.15);border-left:3px solid #66c0f4;padding:12px 16px;border-radius:6px;font-size:13px;color:#c7d5e0;margin-bottom:16px;line-height:1.5;';
            tip.innerHTML = '<i class="fa-solid fa-info-circle" style="margin-right:8px;color:#66c0f4;"></i>' + t('bigpicture.mouseTip', 'To use mouse mode in Steam: Guide Button + Right Joystick, click with RB');
            contentWrap.appendChild(tip);
        }

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'padding:20px 24px 24px;display:flex;gap:12px;justify-content:space-between;align-items:center;';

        const backBtn = createSettingsButton('back', '<i class="fa-solid fa-arrow-left"></i>');
        const rightButtons = document.createElement('div');
        rightButtons.style.cssText = 'display:flex;gap:8px;';
        const refreshBtn = createSettingsButton('refresh', '<i class="fa-solid fa-arrow-rotate-right"></i>');
        const saveBtn = createSettingsButton('save', '<i class="fa-solid fa-floppy-disk"></i>', true);

        modal.appendChild(header);
        modal.appendChild(searchContainer);
        modal.appendChild(contentWrap);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);

        const state = {
            config: null,
            draft: {},
            searchQuery: '',
        };

        // Search functionality
        let searchDebounceTimer = null;
        searchInput.addEventListener('input', function () {
            const query = searchInput.value.trim().toLowerCase();
            searchClear.style.display = query ? 'block' : 'none';

            // Debounce the search
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(function () {
                state.searchQuery = query;
                applySearchFilter();
            }, 150);
        });

        searchClear.addEventListener('click', function (e) {
            e.preventDefault();
            searchInput.value = '';
            searchClear.style.display = 'none';
            state.searchQuery = '';
            applySearchFilter();
            searchInput.focus();
        });

        function applySearchFilter() {
            const query = state.searchQuery;

            // Filter settings options
            const optionEls = contentWrap.querySelectorAll('[data-setting-option]');
            optionEls.forEach(function (el) {
                const searchText = (el.dataset.searchText || '').toLowerCase();
                if (!query || searchText.includes(query)) {
                    el.style.display = '';
                } else {
                    el.style.display = 'none';
                }
            });

            // Filter settings groups (hide if all options hidden)
            const groupEls = contentWrap.querySelectorAll('[data-setting-group]');
            groupEls.forEach(function (groupEl) {
                const visibleOptions = groupEl.querySelectorAll('[data-setting-option]:not([style*="display: none"])');
                if (!query || visibleOptions.length > 0) {
                    groupEl.style.display = '';
                } else {
                    groupEl.style.display = 'none';
                }
            });

            // Filter installed fixes
            const fixItems = contentWrap.querySelectorAll('[data-fix-item]');
            let visibleFixes = 0;
            fixItems.forEach(function (el) {
                const searchText = (el.dataset.searchText || '').toLowerCase();
                if (!query || searchText.includes(query)) {
                    el.style.display = '';
                    visibleFixes++;
                } else {
                    el.style.display = 'none';
                }
            });

            // Show/hide fixes empty state
            const fixesSection = document.getElementById('luatools-installed-fixes-section');
            const fixesEmptySearch = fixesSection ? fixesSection.querySelector('.search-empty-state') : null;
            if (fixesSection && query && fixItems.length > 0 && visibleFixes === 0) {
                if (!fixesEmptySearch) {
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'search-empty-state';
                    const emptyColors = getThemeColors();
                    emptyEl.style.cssText = `padding:14px;background:${emptyColors.bgTertiary};border:1px solid ${emptyColors.border};border-radius:4px;color:${emptyColors.textSecondary};text-align:center;margin-top:10px;`;
                    emptyEl.textContent = t('settings.search.noResults', 'No matches found');
                    const listContainer = fixesSection.querySelector('#luatools-fixes-list');
                    if (listContainer) listContainer.appendChild(emptyEl);
                }
            } else if (fixesEmptySearch) {
                fixesEmptySearch.remove();
            }

            // Filter installed lua scripts
            const luaItems = contentWrap.querySelectorAll('[data-lua-item]');
            let visibleLua = 0;
            luaItems.forEach(function (el) {
                const searchText = (el.dataset.searchText || '').toLowerCase();
                if (!query || searchText.includes(query)) {
                    el.style.display = '';
                    visibleLua++;
                } else {
                    el.style.display = 'none';
                }
            });

            // Show/hide lua empty state
            const luaSection = document.getElementById('luatools-installed-lua-section');
            const luaEmptySearch = luaSection ? luaSection.querySelector('.search-empty-state') : null;
            if (luaSection && query && luaItems.length > 0 && visibleLua === 0) {
                if (!luaEmptySearch) {
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'search-empty-state';
                    const emptyColors = getThemeColors();
                    emptyEl.style.cssText = `padding:14px;background:${emptyColors.bgTertiary};border:1px solid ${emptyColors.border};border-radius:4px;color:${emptyColors.textSecondary};text-align:center;margin-top:10px;`;
                    emptyEl.textContent = t('settings.search.noResults', 'No matches found');
                    const listContainer = luaSection.querySelector('#luatools-lua-list');
                    if (listContainer) listContainer.appendChild(emptyEl);
                }
            } else if (luaEmptySearch) {
                luaEmptySearch.remove();
            }
        }

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

            btn.onmouseover = function () {
                if (this.dataset.disabled === '1') {
                    this.style.opacity = '0.6';
                    this.style.cursor = 'not-allowed';
                    return;
                }
            };

            btn.onmouseout = function () {
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
                statusLine.style.cssText = 'font-size:13px;margin-top:10px;transform:translateY(15px);color:#c7d5e0;min-height:18px;text-align:center;'; // may god have mercy upon your soul for witnessing this translateY
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
                if (optionKey === 'useSteamLanguage') return 'settings.useSteamLanguage.label';
                if (optionKey === 'donateKeys') return 'settings.donateKeys.label';
                if (optionKey === 'theme') return 'settings.theme.label';
            }
            return null;
        }

        function optionDescriptionKey(groupKey, optionKey) {
            if (groupKey === 'general') {
                if (optionKey === 'language') return 'settings.language.description';
                if (optionKey === 'useSteamLanguage') return 'settings.useSteamLanguage.description';
                if (optionKey === 'donateKeys') return 'settings.donateKeys.description';
                if (optionKey === 'theme') return 'settings.theme.description';
            }
            return null;
        }

        function renderSettings() {
            contentWrap.innerHTML = '';
            if (!state.config || !Array.isArray(state.config.schema) || state.config.schema.length === 0) {
                const emptyState = document.createElement('div');
                const emptyColors = getThemeColors();
                emptyState.style.cssText = `padding:14px;background:${emptyColors.bgTertiary};border:1px solid ${emptyColors.border};border-radius:4px;color:${emptyColors.textSecondary};`;
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
                groupEl.dataset.settingGroup = group.key;

                const groupTitle = document.createElement('div');
                groupTitle.textContent = t('settings.' + group.key, group.label || group.key);
                if (group.key === 'general') {
                    const generalTitleColors = getThemeColors();
                    groupTitle.style.cssText = `font-size:22px;color:${generalTitleColors.text};margin-bottom:16px;margin-top:-25px;font-weight:600;text-align:center;`; // dw abt this margin-top -25px 🇧🇷 don't even look at it
                } else {
                    const otherTitleColors = getThemeColors();
                    groupTitle.style.cssText = `font-size:15px;font-weight:600;color:${otherTitleColors.accent};text-align:center;`;
                }
                groupEl.appendChild(groupTitle);

                if (group.description && group.key !== 'general') {
                    const groupDesc = document.createElement('div');
                    const descColors = getThemeColors();
                    groupDesc.style.cssText = `margin-top:4px;font-size:13px;color:${descColors.textSecondary};`;
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
                    const optionColors = getThemeColors();
                    if (j === 0) {
                        optionEl.style.cssText = 'margin-top:12px;padding-top:0;';
                    } else {
                        optionEl.style.cssText = `margin-top:12px;padding-top:12px;border-top:1px solid ${optionColors.border.replace('0.3', '0.1')};`;
                    }
                    optionEl.dataset.settingOption = option.key;

                    const optionLabel = document.createElement('div');
                    const optLabelColors = getThemeColors();
                    optionLabel.style.cssText = `font-size:14px;font-weight:500;color:${optLabelColors.text};`;
                    const labelKey = optionLabelKey(group.key, option.key);
                    const labelText = t(labelKey || ('settings.' + group.key + '.' + option.key + '.label'), option.label || option.key);
                    optionLabel.textContent = labelText;

                    // Build search text from label, description, and key
                    const descText = option.description || '';
                    optionEl.dataset.searchText = (labelText + ' ' + descText + ' ' + option.key + ' ' + group.key).toLowerCase();
                    optionEl.appendChild(optionLabel);

                    if (option.description) {
                        const optionDesc = document.createElement('div');
                        const optDescColors = getThemeColors();
                        optionDesc.style.cssText = `margin-top:2px;font-size:12px;color:${optDescColors.textSecondary};`;
                        const descKey = optionDescriptionKey(group.key, option.key);
                        optionDesc.textContent = t(descKey || ('settings.' + group.key + '.' + option.key + '.description'), option.description);
                        optionEl.appendChild(optionDesc);
                    }

                    const controlWrap = document.createElement('div');
                    controlWrap.style.cssText = 'margin-top:8px;';

                    if (option.type === 'select') {
                        const selectEl = document.createElement('select');
                        const selectColors = getThemeColors();
                        selectEl.style.cssText = `width:100% !important;padding:6px 8px !important;background:${selectColors.bgTertiary} !important;color:${selectColors.text} !important;border:1px solid ${selectColors.border} !important;border-radius:3px !important;font-size:14px !important;`;

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

                        selectEl.addEventListener('change', function () {
                            state.draft[group.key][option.key] = selectEl.value;
                            try {
                                backendLog('LuaTools: ' + option.key + ' select changed to ' + selectEl.value);
                            } catch (_) { }

                            // If theme changed, apply it immediately
                            if (group.key === 'general' && option.key === 'theme') {
                                try {
                                    backendLog('LuaTools: Theme change detected, new value: ' + selectEl.value);
                                } catch (_) { }
                                // Update the settings cache so getCurrentTheme() returns the new value
                                if (window.__LuaToolsSettings && window.__LuaToolsSettings.values) {
                                    if (!window.__LuaToolsSettings.values.general) {
                                        window.__LuaToolsSettings.values.general = {};
                                    }
                                    window.__LuaToolsSettings.values.general.theme = selectEl.value;
                                    try {
                                        backendLog('LuaTools: Updated cache, theme is now: ' + window.__LuaToolsSettings.values.general.theme);
                                    } catch (_) { }
                                }
                                // Reload styles immediately
                                ensureLuaToolsStyles();

                                // Update all modal elements with new theme colors
                                setTimeout(function () {
                                    const colors = getThemeColors();

                                    // Update modal background and border
                                    const modalEl = overlay && overlay.querySelector('[style*="background:linear-gradient"]');
                                    if (modalEl) {
                                        modalEl.style.background = colors.modalBg;
                                        modalEl.style.borderColor = colors.border;
                                    }

                                    // Update header border
                                    const headerEl = overlay && overlay.querySelector('[style*="border-bottom"]');
                                    if (headerEl) {
                                        headerEl.style.borderBottomColor = colors.border.replace('0.3', '0.2');
                                    }

                                    // Update all title and text colors
                                    const titles = overlay && overlay.querySelectorAll('[style*="text-shadow"]');
                                    if (titles) {
                                        titles.forEach(function (title) {
                                            title.style.backgroundImage = colors.gradientLight;
                                        });
                                    }

                                    // Update content wrapper border
                                    const contentWrapEl = overlay && overlay.querySelector('#luatools-content-wrap');
                                    if (contentWrapEl) {
                                        contentWrapEl.style.borderColor = colors.border;
                                        contentWrapEl.style.background = colors.bgContainer;
                                    }

                                    // Re-render the settings content
                                    renderSettings();
                                }, 50);

                                // Auto-save theme changes after a brief delay
                                setTimeout(function () {
                                    if (saveBtn && saveBtn.dataset.disabled !== '1' && saveBtn.dataset.busy !== '1') {
                                        saveBtn.click();
                                    }
                                }, 150);
                            }

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
                            const toggleColors = getThemeColors();
                            const currentValue = state.draft[group.key][option.key] === true;
                            if (currentValue) {
                                yesBtn.style.background = toggleColors.accent;
                                yesBtn.style.color = toggleColors.bgPrimary;
                                if (yesSpan) yesSpan.style.color = toggleColors.bgPrimary;
                                noBtn.style.background = '';
                                noBtn.style.color = '';
                                if (noSpan) noSpan.style.color = '';
                            } else {
                                noBtn.style.background = toggleColors.accent;
                                noBtn.style.color = toggleColors.bgPrimary;
                                if (noSpan) noSpan.style.color = toggleColors.bgPrimary;
                                yesBtn.style.background = '';
                                yesBtn.style.color = '';
                                if (yesSpan) yesSpan.style.color = '';
                            }
                        }

                        yesBtn.addEventListener('click', function (e) {
                            e.preventDefault();
                            state.draft[group.key][option.key] = true;
                            refreshToggleButtons();
                            updateSaveState();
                            if (option.key === 'useSteamLanguage') refreshDependencies();
                            setStatus(t('settings.unsaved', 'Unsaved changes'), '#c7d5e0');
                        });

                        noBtn.addEventListener('click', function (e) {
                            e.preventDefault();
                            state.draft[group.key][option.key] = false;
                            refreshToggleButtons();
                            updateSaveState();
                            if (option.key === 'useSteamLanguage') refreshDependencies();
                            setStatus(t('settings.unsaved', 'Unsaved changes'), '#c7d5e0');
                        });

                        toggleWrap.appendChild(yesBtn);
                        toggleWrap.appendChild(noBtn);
                        controlWrap.appendChild(toggleWrap);
                        refreshToggleButtons();
                    } else if (option.type === 'text') {
                        const textInput = document.createElement('input');
                        textInput.type = 'text';
                        const textColors = getThemeColors();
                        const placeholder = option.metadata && option.metadata.placeholder ? String(option.metadata.placeholder) : '';
                        textInput.placeholder = placeholder;
                        textInput.style.cssText = `width:100% !important;padding:8px 12px !important;background:${textColors.bgTertiary} !important;color:${textColors.text} !important;border:1px solid ${textColors.border} !important;border-radius:4px !important;font-size:14px !important;box-sizing:border-box !important;`;

                        const currentValue = state.draft[group.key][option.key];
                        if (typeof currentValue !== 'undefined' && currentValue !== null) {
                            textInput.value = String(currentValue);
                        }

                        textInput.addEventListener('input', function () {
                            state.draft[group.key][option.key] = textInput.value;
                            updateSaveState();
                            setStatus(t('settings.unsaved', 'Unsaved changes'), '#c7d5e0');
                        });

                        textInput.addEventListener('focus', function () {
                            textInput.style.borderColor = textColors.accent + ' !important';
                            textInput.style.outline = 'none';
                        });

                        textInput.addEventListener('blur', function () {
                            textInput.style.borderColor = textColors.border + ' !important';
                        });

                        controlWrap.appendChild(textInput);
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
            refreshDependencies();
        }

        function refreshDependencies() {
            try {
                const languageEl = overlay.querySelector('[data-setting-option="language"]');
                if (languageEl) {
                    const useSteam = state.draft && state.draft.general && state.draft.general.useSteamLanguage;
                    if (useSteam !== false) {
                        languageEl.style.display = 'none';
                    } else {
                        languageEl.style.display = 'block';
                    }
                }
            } catch (_) { }
        }

        function renderInstalledFixesSection() {
            const sectionEl = document.createElement('div');
            sectionEl.id = 'luatools-installed-fixes-section';
            const sectionColors = getThemeColors();
            sectionEl.style.cssText = `margin-top:36px;padding:24px;background:linear-gradient(135deg, rgba(${sectionColors.rgbString},0.05) 0%, rgba(${sectionColors.rgbString},0.08) 100%);border:2px solid ${sectionColors.border};border-radius:14px;box-shadow:0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);position:relative;overflow:hidden;`;

            const sectionGlow = document.createElement('div');
            sectionGlow.style.cssText = `position:absolute;top:-100%;left:-100%;width:300%;height:300%;background:radial-gradient(circle, rgba(${sectionColors.rgbString},0.08) 0%, transparent 70%);pointer-events:none;`;
            sectionEl.appendChild(sectionGlow);

            const sectionTitle = document.createElement('div');
            const titleColors = getThemeColors();
            sectionTitle.style.cssText = `font-size:22px;color:${titleColors.accent};margin-bottom:20px;font-weight:700;text-align:center;text-shadow:0 2px 10px ${titleColors.shadow};background:${titleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;position:relative;z-index:1;letter-spacing:0.5px;`;
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
            const loadingColors = getThemeColors();
            container.innerHTML = `<div style="padding:14px;text-align:center;color:${loadingColors.textSecondary};">${t('settings.installedFixes.loading', 'Scanning for installed fixes...')}</div>`;

            Millennium.callServerMethod('luatools', 'GetInstalledFixes', {
                contentScriptQuery: ''
            })
                .then(function (res) {
                    const response = typeof res === 'string' ? JSON.parse(res) : res;
                    if (!response || !response.success) {
                        const errColors = getThemeColors();
                        container.innerHTML = `<div style="padding:14px;background:${errColors.bgTertiary};border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">${t('settings.installedFixes.error', 'Failed to load installed fixes.')}</div>`;
                        return;
                    }

                    const fixes = Array.isArray(response.fixes) ? response.fixes : [];
                    if (fixes.length === 0) {
                        const emptyColors = getThemeColors();
                        container.innerHTML = `<div style="padding:14px;background:${emptyColors.bgTertiary};border:1px solid ${emptyColors.border};border-radius:4px;color:${emptyColors.textSecondary};text-align:center;">${t('settings.installedFixes.empty', 'No fixes installed yet.')}</div>`;
                        return;
                    }

                    container.innerHTML = '';
                    for (let i = 0; i < fixes.length; i++) {
                        const fix = fixes[i];
                        const fixEl = createFixListItem(fix, container);
                        container.appendChild(fixEl);
                    }

                    // Re-apply search filter after loading
                    if (state.searchQuery) {
                        setTimeout(applySearchFilter, 50);
                    }
                })
                .catch(function (err) {
                    const catchColors = getThemeColors();
                    container.innerHTML = `<div style="padding:14px;background:${catchColors.bgTertiary};border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">${t('settings.installedFixes.error', 'Failed to load installed fixes.')}</div>`;
                });
        }

        function createFixListItem(fix, container) {
            const itemEl = document.createElement('div');
            const itemColors = getThemeColors();
            itemEl.style.cssText = `margin-bottom:12px;padding:14px;background:${itemColors.bgTertiary};border:1px solid ${itemColors.border};border-radius:6px;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s ease;`;
            itemEl.onmouseover = function () {
                const c = getThemeColors();
                this.style.borderColor = c.accent;
                this.style.background = c.bgHover;
            };
            itemEl.onmouseout = function () {
                const c = getThemeColors();
                this.style.borderColor = c.border;
                this.style.background = c.bgTertiary;
            };

            // Add search data attributes
            itemEl.dataset.fixItem = fix.appid;
            const gameNameText = fix.gameName || 'Unknown Game';
            itemEl.dataset.searchText = (gameNameText + ' ' + fix.appid + ' ' + (fix.fixType || '') + ' fix').toLowerCase();

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';

            const gameName = document.createElement('div');
            const nameColors = getThemeColors();
            gameName.style.cssText = `font-size:15px;font-weight:600;color:${nameColors.text};margin-bottom:6px;`;
            gameName.textContent = gameNameText + (fix.gameName ? '' : ' (' + fix.appid + ')');
            infoDiv.appendChild(gameName);

            if (!fix.gameName || fix.gameName.startsWith('Unknown Game')) {
                fetchSteamGameName(fix.appid).then(function (name) {
                    if (name) {
                        fix.gameName = name;
                        gameName.textContent = name;
                        itemEl.dataset.searchText = (name + ' ' + fix.appid + ' ' + (fix.fixType || '') + ' fix').toLowerCase();
                    }
                });
            }

            const detailsDiv = document.createElement('div');
            const detailsColors = getThemeColors();
            detailsDiv.style.cssText = `font-size:12px;color:${detailsColors.textSecondary};line-height:1.6;`;

            if (fix.fixType) {
                const typeSpan = document.createElement('div');
                const typeColors = getThemeColors();
                typeSpan.innerHTML = `<strong style="color:${typeColors.accent};">${t('settings.installedFixes.type', 'Type:')}</strong> ${fix.fixType}`;
                detailsDiv.appendChild(typeSpan);
            }

            if (fix.date) {
                const dateSpan = document.createElement('div');
                const dateColors = getThemeColors();
                dateSpan.innerHTML = `<strong style="color:${dateColors.accent};">${t('settings.installedFixes.date', 'Installed:')}</strong> ${fix.date}`;
                detailsDiv.appendChild(dateSpan);
            }

            if (fix.filesCount > 0) {
                const filesSpan = document.createElement('div');
                const filesColors = getThemeColors();
                filesSpan.innerHTML = `<strong style="color:${filesColors.accent};">${t('settings.installedFixes.files', '{count} files').replace('{count}', fix.filesCount)}</strong>`;
                detailsDiv.appendChild(filesSpan);
            }

            infoDiv.appendChild(detailsDiv);
            itemEl.appendChild(infoDiv);

            const deleteBtn = document.createElement('a');
            deleteBtn.href = '#';
            deleteBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(255,80,80,0.12);border:2px solid rgba(255,80,80,0.35);border-radius:12px;color:#ff5050;font-size:18px;text-decoration:none;transition:all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);cursor:pointer;flex-shrink:0;';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = t('settings.installedFixes.delete', 'Delete');
            deleteBtn.onmouseover = function () {
                this.style.background = 'rgba(255,80,80,0.25)';
                this.style.borderColor = 'rgba(255,80,80,0.6)';
                this.style.color = '#ff6b6b';
                this.style.transform = 'translateY(-2px) scale(1.05)';
                this.style.boxShadow = '0 6px 20px rgba(255,80,80,0.4), 0 0 0 4px rgba(255,80,80,0.1)';
            };
            deleteBtn.onmouseout = function () {
                this.style.background = 'rgba(255,80,80,0.12)';
                this.style.borderColor = 'rgba(255,80,80,0.35)';
                this.style.color = '#ff5050';
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = 'none';
            };

            deleteBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (deleteBtn.dataset.busy === '1') return;

                showLuaToolsConfirm(
                    fix.gameName || 'LuaTools',
                    t('settings.installedFixes.deleteConfirm', 'Are you sure you want to remove this fix? This will delete fix files and run Steam verification.'),
                    function () {
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
                            .then(function (res) {
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
                            .catch(function (err) {
                                alert(t('settings.installedFixes.deleteError', 'Failed to remove fix.') + ' ' + (err && err.message ? err.message : ''));
                                deleteBtn.dataset.busy = '0';
                                deleteBtn.style.opacity = '1';
                                deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedFixes.delete', 'Delete') + '</span>';
                            });
                    },
                    function () {
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

                Millennium.callServerMethod('luatools', 'GetUnfixStatus', {
                    appid: appid,
                    contentScriptQuery: ''
                })
                    .then(function (res) {
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
                            setTimeout(function () {
                                itemEl.remove();
                                // Check if list is now empty
                                if (container.children.length === 0) {
                                    const emptyFixesColors = getThemeColors();
                                    container.innerHTML = `<div style="padding:14px;background:${emptyFixesColors.bgTertiary};border:1px solid ${emptyFixesColors.border};border-radius:4px;color:${emptyFixesColors.textSecondary};text-align:center;">${t('settings.installedFixes.empty', 'No fixes installed yet.')}</div>`;
                                }
                            }, 300);

                            // Trigger Steam verification after a short delay
                            setTimeout(function () {
                                try {
                                    const verifyUrl = 'steam://validate/' + appid;
                                    window.location.href = verifyUrl;
                                    backendLog('LuaTools: Running verify for appid ' + appid);
                                } catch (_) { }
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
                    .catch(function (err) {
                        setTimeout(checkStatus, 500);
                    });
            }

            checkStatus();
        }

        function renderInstalledLuaSection() {
            const sectionEl = document.createElement('div');
            sectionEl.id = 'luatools-installed-lua-section';
            const sectionLuaColors = getThemeColors();
            sectionEl.style.cssText = `margin-top:36px;padding:24px;background:linear-gradient(135deg, rgba(${sectionLuaColors.rgbString},0.05) 0%, rgba(${sectionLuaColors.rgbString},0.08) 100%);border:2px solid ${sectionLuaColors.border};border-radius:14px;box-shadow:0 4px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);position:relative;overflow:hidden;`;

            const sectionGlow = document.createElement('div');
            sectionGlow.style.cssText = `position:absolute;top:-100%;left:-100%;width:300%;height:300%;background:radial-gradient(circle, rgba(${sectionLuaColors.rgbString},0.08) 0%, transparent 70%);pointer-events:none;`;
            sectionEl.appendChild(sectionGlow);

            const sectionTitle = document.createElement('div');
            const luaTitleColors = getThemeColors();
            sectionTitle.style.cssText = `font-size:22px;color:${luaTitleColors.accent};margin-bottom:20px;font-weight:700;text-align:center;text-shadow:0 2px 10px ${luaTitleColors.shadow};background:${luaTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;position:relative;z-index:1;letter-spacing:0.5px;`;
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

            Millennium.callServerMethod('luatools', 'GetInstalledLuaScripts', {
                contentScriptQuery: ''
            })
                .then(function (res) {
                    const response = typeof res === 'string' ? JSON.parse(res) : res;
                    if (!response || !response.success) {
                        const errLuaColors = getThemeColors();
                        container.innerHTML = `<div style="padding:14px;background:${errLuaColors.bgTertiary};border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">${t('settings.installedLua.error', 'Failed to load installed Lua scripts.')}</div>`;
                        return;
                    }

                    const scripts = Array.isArray(response.scripts) ? response.scripts : [];
                    if (scripts.length === 0) {
                        const emptyLuaColors = getThemeColors();
                        container.innerHTML = `<div style="padding:14px;background:${emptyLuaColors.bgTertiary};border:1px solid ${emptyLuaColors.border};border-radius:4px;color:${emptyLuaColors.textSecondary};text-align:center;">${t('settings.installedLua.empty', 'No Lua scripts installed yet.')}</div>`;
                        return;
                    }

                    container.innerHTML = '';

                    // Check if there are any unknown games
                    const hasUnknownGames = scripts.some(function (s) {
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

                    // Re-apply search filter after loading
                    if (state.searchQuery) {
                        setTimeout(applySearchFilter, 50);
                    }
                })
                .catch(function (err) {
                    const catchLuaColors = getThemeColors();
                    container.innerHTML = `<div style="padding:14px;background:${catchLuaColors.bgTertiary};border:1px solid #ff5c5c;border-radius:4px;color:#ff5c5c;">${t('settings.installedLua.error', 'Failed to load installed Lua scripts.')}</div>`;
                });
        }

        function createLuaListItem(script, container) {
            const itemEl = document.createElement('div');
            const itemLuaColors = getThemeColors();
            itemEl.style.cssText = `margin-bottom:12px;padding:14px;background:${itemLuaColors.bgTertiary};border:1px solid ${itemLuaColors.border};border-radius:6px;display:flex;justify-content:space-between;align-items:center;transition:all 0.2s ease;`;
            itemEl.onmouseover = function () {
                const c = getThemeColors();
                this.style.borderColor = c.accent;
                this.style.background = c.bgHover;
            };
            itemEl.onmouseout = function () {
                const c = getThemeColors();
                this.style.borderColor = c.border;
                this.style.background = c.bgTertiary;
            };

            // Add search data attributes
            itemEl.dataset.luaItem = script.appid;
            const gameNameText = script.gameName || 'Unknown Game';
            itemEl.dataset.searchText = (gameNameText + ' ' + script.appid + ' lua script' + (script.isDisabled ? ' disabled' : '')).toLowerCase();

            const infoDiv = document.createElement('div');
            infoDiv.style.cssText = 'flex:1;';

            const gameName = document.createElement('div');
            const gameNameLuaColors = getThemeColors();
            gameName.style.cssText = `font-size:15px;font-weight:600;color:${gameNameLuaColors.text};margin-bottom:6px;`;
            gameName.textContent = gameNameText + (script.gameName ? '' : ' (' + script.appid + ')');

            if (!script.gameName || script.gameName.startsWith('Unknown Game')) {
                fetchSteamGameName(script.appid).then(function (name) {
                    if (name) {
                        script.gameName = name;
                        gameName.textContent = name;
                        itemEl.dataset.searchText = (name + ' ' + script.appid + ' lua script' + (script.isDisabled ? ' disabled' : '')).toLowerCase();
                    }
                });
            }

            if (script.isDisabled) {
                const disabledBadge = document.createElement('span');
                disabledBadge.style.cssText = 'margin-left:8px;padding:2px 8px;background:rgba(255,92,92,0.2);border:1px solid #ff5c5c;border-radius:4px;font-size:11px;color:#ff5c5c;font-weight:500;';
                disabledBadge.textContent = t('settings.installedLua.disabled', 'Disabled');
                gameName.appendChild(disabledBadge);
            }

            infoDiv.appendChild(gameName);

            const detailsDiv = document.createElement('div');
            const detailsLuaColors = getThemeColors();
            detailsDiv.style.cssText = `font-size:12px;color:${detailsLuaColors.textSecondary};line-height:1.6;`;

            if (script.modifiedDate) {
                const dateSpan = document.createElement('div');
                const dateLuaColors = getThemeColors();
                dateSpan.innerHTML = `<strong style="color:${dateLuaColors.accent};">${t('settings.installedLua.modified', 'Modified:')}</strong> ${script.modifiedDate}`;
                detailsDiv.appendChild(dateSpan);
            }

            infoDiv.appendChild(detailsDiv);
            itemEl.appendChild(infoDiv);

            const deleteBtn = document.createElement('a');
            deleteBtn.href = '#';
            deleteBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:rgba(255,80,80,0.12);border:2px solid rgba(255,80,80,0.35);border-radius:12px;color:#ff5050;font-size:18px;text-decoration:none;transition:all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);cursor:pointer;flex-shrink:0;';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.title = t('settings.installedLua.delete', 'Remove');
            deleteBtn.onmouseover = function () {
                this.style.background = 'rgba(255,80,80,0.25)';
                this.style.borderColor = 'rgba(255,80,80,0.6)';
                this.style.color = '#ff6b6b';
                this.style.transform = 'translateY(-2px) scale(1.05)';
                this.style.boxShadow = '0 6px 20px rgba(255,80,80,0.4), 0 0 0 4px rgba(255,80,80,0.1)';
            };
            deleteBtn.onmouseout = function () {
                this.style.background = 'rgba(255,80,80,0.12)';
                this.style.borderColor = 'rgba(255,80,80,0.35)';
                this.style.color = '#ff5050';
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = 'none';
            };

            deleteBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (deleteBtn.dataset.busy === '1') return;

                showLuaToolsConfirm(
                    script.gameName || 'LuaTools',
                    t('settings.installedLua.deleteConfirm', 'Remove via LuaTools for this game?'),
                    function () {
                        // User confirmed
                        deleteBtn.dataset.busy = '1';
                        deleteBtn.style.opacity = '0.6';
                        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                        Millennium.callServerMethod('luatools', 'DeleteLuaToolsForApp', {
                            appid: script.appid,
                            contentScriptQuery: ''
                        })
                            .then(function (res) {
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
                                setTimeout(function () {
                                    itemEl.remove();
                                    // Check if list is now empty
                                    if (container.children.length === 0) {
                                        const emptyLuaColors = getThemeColors();
                                        container.innerHTML = `<div style="padding:14px;background:${emptyLuaColors.bgTertiary};border:1px solid ${emptyLuaColors.border};border-radius:4px;color:${emptyLuaColors.textSecondary};text-align:center;">${t('settings.installedLua.empty', 'No Lua scripts installed yet.')}</div>`;
                                    }
                                }, 300);
                            })
                            .catch(function (err) {
                                alert(t('settings.installedLua.deleteError', 'Failed to remove Lua script.') + ' ' + (err && err.message ? err.message : ''));
                                deleteBtn.dataset.busy = '0';
                                deleteBtn.style.opacity = '1';
                                deleteBtn.innerHTML = '<span><i class="fa-solid fa-trash"></i> ' + t('settings.installedLua.delete', 'Delete') + '</span>';
                            });
                    },
                    function () {
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

            return fetchSettingsConfig(force).then(function (config) {
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
            }).catch(function (err) {
                const message = err && err.message ? err.message : t('settings.error', 'Failed to load settings.');
                contentWrap.innerHTML = '<div style="padding:20px;color:#ff5c5c;">' + message + '</div>';
                setStatus(t('common.status.error', 'Error') + ': ' + message, '#ff5c5c');
            });
        }

        backBtn.addEventListener('click', function (e) {
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

        refreshBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (refreshBtn.dataset.busy === '1') return;
            refreshBtn.dataset.busy = '1';
            handleLoad(true).finally(function () {
                refreshBtn.dataset.busy = '0';
                refreshBtn.style.opacity = '1';
                applyStaticTranslations();
            });
        });

        saveBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (saveBtn.dataset.disabled === '1' || saveBtn.dataset.busy === '1') return;

            const changes = collectChanges();
            try {
                backendLog('LuaTools: collectChanges payload ' + JSON.stringify(changes));
            } catch (_) { }
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
            try {
                backendLog('LuaTools: sending settings payload ' + JSON.stringify(payloadToSend));
            } catch (_) { }
            // Pass flattened keys so Millennium handles the RPC arguments as expected.
            Millennium.callServerMethod('luatools', 'ApplySettingsChanges', {
                contentScriptQuery: '',
                changesJson: JSON.stringify(payloadToSend)
            }).then(function (res) {
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
                state.config.values = initialiseSettingsDraft({
                    schema: state.config.schema,
                    values: newValues
                });
                state.draft = initialiseSettingsDraft({
                    schema: state.config.schema,
                    values: newValues
                });

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
                } catch (_) { }

                // Invalidate the settings cache to force a fresh fetch on next settings load
                // This ensures any changes persist across page navigations
                try {
                    if (window.__LuaToolsSettings) {
                        window.__LuaToolsSettings.schema = null;
                    }
                } catch (_) { }

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

                // Reload theme if it changed
                const oldTheme = state.config.values?.general?.theme;
                const newTheme = state.draft?.general?.theme;
                if (oldTheme !== newTheme) {
                    ensureLuaToolsStyles();
                }
            }).catch(function (err) {
                const message = err && err.message ? err.message : t('settings.saveError', 'Failed to save settings.');
                setStatus(message, '#ff5c5c');
            }).finally(function () {
                saveBtn.dataset.busy = '0';
                applyStaticTranslations();
                updateSaveState();
            });
        });

        closeIconBtn.addEventListener('click', function (e) {
            e.preventDefault();
            overlay.remove();
        });

        discordIconBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const url = 'https://discord.gg/luatools';
            try {
                Millennium.callServerMethod('luatools', 'OpenExternalUrl', {
                    url,
                    contentScriptQuery: ''
                });
            } catch (_) { }
        });

        overlay.addEventListener('click', function (e) {
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
                try {
                    list[0].remove();
                } catch (_) {
                    break;
                }
            }
            // Also remove any download/progress overlays if present
            var list2 = document.getElementsByClassName('luatools-overlay');
            while (list2 && list2.length > 0) {
                try {
                    list2[0].remove();
                } catch (_) {
                    break;
                }
            }
        } catch (_) { }
    }

    // Custom modern alert dialog
    function showLuaToolsAlert(title, message, onClose) {
        if (document.querySelector('.luatools-alert-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();
        const overlay = document.createElement('div');
        overlay.className = 'luatools-alert-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const alertModalColors = getThemeColors();
        modal.style.cssText = `background:${alertModalColors.modalBg};color:${alertModalColors.text};border:2px solid ${alertModalColors.border};border-radius:8px;width:450px;padding:32px 36px;box-shadow:0 20px 60px rgba(0,0,0,.9), 0 0 0 1px ${alertModalColors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const titleEl = document.createElement('div');
        const alertTitleColors = getThemeColors();
        titleEl.style.cssText = `font-size:22px;color:${alertTitleColors.text};margin-bottom:20px;font-weight:700;text-align:left;text-shadow:0 2px 8px ${alertTitleColors.shadow};background:${alertTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        titleEl.textContent = String(title || 'LuaTools');

        const messageEl = document.createElement('div');
        const alertMsgColors = getThemeColors();
        messageEl.style.cssText = `font-size:15px;line-height:1.6;margin-bottom:28px;color:${alertMsgColors.textSecondary};text-align:left;padding:0 8px;`;
        messageEl.textContent = String(message || '');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;';

        const okBtn = document.createElement('a');
        okBtn.href = '#';
        okBtn.className = 'luatools-btn primary';
        okBtn.style.minWidth = '140px';
        okBtn.innerHTML = `<span>${lt('Close')}</span>`;
        okBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
            try {
                onClose && onClose();
            } catch (_) { }
        };

        btnRow.appendChild(okBtn);

        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                try {
                    onClose && onClose();
                } catch (_) { }
            }
        });

        document.body.appendChild(overlay);

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);
    }

    // Helper to show alert with fallback
    function ShowLuaToolsAlert(title, message) {
        try {
            showLuaToolsAlert(title, message);
        } catch (err) {
            backendLog('LuaTools: Alert error, falling back: ' + err);
            try {
                alert(String(title) + '\n\n' + String(message));
            } catch (_) { }
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
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const confirmColors = getThemeColors();
        modal.style.cssText = `background:${confirmColors.modalBg};color:${confirmColors.text};border:2px solid ${confirmColors.border};border-radius:8px;width:480px;padding:32px 36px;box-shadow:0 20px 60px rgba(0,0,0,.9), 0 0 0 1px ${confirmColors.shadowRgba};animation:slideUp 0.1s ease-out;`;

        const titleEl = document.createElement('div');
        const titleConfirmColors = getThemeColors();
        titleEl.style.cssText = `font-size:22px;color:${titleConfirmColors.text};margin-bottom:20px;font-weight:700;text-align:center;text-shadow:0 2px 8px ${titleConfirmColors.shadow};background:${titleConfirmColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        titleEl.textContent = String(title || 'LuaTools');

        const messageEl = document.createElement('div');
        const msgColors = getThemeColors();
        messageEl.style.cssText = `font-size:15px;line-height:1.6;margin-bottom:28px;color:${msgColors.textSecondary};text-align:center;`;
        messageEl.textContent = String(message || lt('Are you sure?'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'luatools-btn';
        cancelBtn.style.flex = '1';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
            try {
                onCancel && onCancel();
            } catch (_) { }
        };
        const confirmBtn = document.createElement('a');
        confirmBtn.href = '#';
        confirmBtn.className = 'luatools-btn primary';
        confirmBtn.style.flex = '1';
        confirmBtn.innerHTML = `<span>${lt('Confirm')}</span>`;
        confirmBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
            try {
                onConfirm && onConfirm();
            } catch (_) { }
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);

        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                try {
                    onCancel && onCancel();
                } catch (_) { }
            }
        });

        document.body.appendChild(overlay);

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);
    }

    // DLC warning modal
    function showDlcWarning(appid, fullgameAppid, fullgameName) {
        // Close settings so modal is visible
        closeSettingsOverlay();
        if (document.querySelector('.luatools-dlc-warning-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();

        const overlay = document.createElement('div');
        overlay.className = 'luatools-dlc-warning-overlay luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:100001;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        const colors = getThemeColors();
        modal.style.cssText = `background:${colors.modalBg};color:${colors.text};border:2px solid ${colors.border};border-radius:12px;width:520px;padding:36px;box-shadow:0 25px 70px rgba(0,0,0,.9);animation:slideUp 0.15s ease-out;`;

        const header = document.createElement('div');
        header.style.cssText = 'text-align:center;margin-bottom:24px;';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-circle-info';
        icon.style.cssText = `color:${colors.accent};font-size:48px;filter:drop-shadow(0 0 10px ${colors.shadow});`;
        header.appendChild(icon);

        const titleEl = document.createElement('div');
        titleEl.style.cssText = `font-size:24px;font-weight:800;text-align:center;margin-bottom:16px;background:${colors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        titleEl.textContent = lt('DLC Detected');

        const messageEl = document.createElement('div');
        messageEl.style.cssText = `font-size:16px;line-height:1.6;margin-bottom:32px;color:${colors.textSecondary};text-align:center;`;
        messageEl.innerHTML = lt('DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>').replace('{gameName}', fullgameName || lt('Base Game'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:16px;justify-content:center;';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'luatools-btn';
        cancelBtn.style.flex = '1';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
        };

        const goBtn = document.createElement('a');
        goBtn.href = 'https://store.steampowered.com/app/' + fullgameAppid;
        goBtn.className = 'luatools-btn primary';
        goBtn.style.flex = '1.5';
        goBtn.innerHTML = `<span>${lt('Go to Base Game')}</span>`;
        goBtn.onclick = function (e) {
            // Let the default link behavior happen (navigation)
            // But we can also remove the overlay
            setTimeout(() => overlay.remove(), 100);
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(goBtn);

        modal.appendChild(header);
        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);

        setTimeout(function () {
            if (window.GamepadNav) window.GamepadNav.scanElements();
        }, 150);
    }

    function showLuaToolsPlayableWarning(message, onProceed, onCancel) {
        // Close settings so modal is visible
        closeSettingsOverlay();
        if (document.querySelector('.luatools-playable-warning-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();

        const overlay = document.createElement('div');
        overlay.className = 'luatools-playable-warning-overlay luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);z-index:100001;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(180deg,#3a0f0f,#2a0b0b);color:#fff;border:2px solid rgba(255,80,80,0.9);border-radius:8px;width:540px;padding:24px 28px;box-shadow:0 20px 60px rgba(0,0,0,.9);';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:14px;justify-content:center;';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-triangle-exclamation';
        icon.style.cssText = 'color:#ffddda;font-size:28px;';
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:18px;font-weight:700;text-align:center;';
        titleEl.textContent = t('common.warning', 'Warning');
        header.appendChild(icon);
        header.appendChild(titleEl);

        const messageEl = document.createElement('div');
        messageEl.style.cssText = 'font-size:14px;line-height:1.5;margin-bottom:20px;color:#ffecec;text-align:center;padding:0 6px;';
        messageEl.textContent = String(message || 'This game may not work, support for it wont be given in our discord');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:12px;justify-content:center;';

        const cancelBtn = document.createElement('a');
        cancelBtn.href = '#';
        cancelBtn.className = 'luatools-btn';
        cancelBtn.style.flex = '1';
        cancelBtn.innerHTML = `<span>${lt('Cancel')}</span>`;
        cancelBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
            try {
                onCancel && onCancel();
            } catch (_) { }
        };

        const proceedBtn = document.createElement('a');
        proceedBtn.href = '#';
        proceedBtn.className = 'luatools-btn primary';
        proceedBtn.style.flex = '1';
        proceedBtn.innerHTML = `<span>${lt('Proceed')}</span>`;
        proceedBtn.onclick = function (e) {
            e.preventDefault();
            overlay.remove();
            try {
                onProceed && onProceed();
            } catch (_) { }
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(proceedBtn);

        modal.appendChild(header);
        modal.appendChild(messageEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.remove();
                try {
                    onCancel && onCancel();
                } catch (_) { }
            }
        });

        document.body.appendChild(overlay);

        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);
    }

    // Millennium disclaimer modal
    function showMillenniumDisclaimerModal() {
        if (document.querySelector('.luatools-disclaimer-overlay')) return;

        ensureLuaToolsStyles();
        ensureFontAwesome();

        const overlay = document.createElement('div');
        overlay.className = 'luatools-disclaimer-overlay luatools-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);z-index:100005;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:linear-gradient(180deg,#5a4100,#362600);color:#fff;border:2px solid rgba(255,180,60,0.9);border-radius:12px;width:580px;padding:36px;box-shadow:0 25px 70px rgba(0,0,0,.9);animation:slideUp 0.2s ease-out;';

        const iconContainer = document.createElement('div');
        iconContainer.style.cssText = 'text-align:center;margin-bottom:20px;';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-triangle-exclamation';
        icon.style.cssText = 'color:#FFE1A8;font-size:48px;filter:drop-shadow(0 0 10px rgba(255,225,168,0.5));';
        iconContainer.appendChild(icon);

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:24px;font-weight:800;text-align:center;margin-bottom:24px;color:#FFE1A8;letter-spacing:0.5px;';
        titleEl.textContent = t('disclaimer.title', 'Security & Support Notice');

        const messageEl = document.createElement('div');
        messageEl.style.cssText = 'font-size:15px;line-height:1.6;margin-bottom:28px;color:#ffecec;text-align:center;';

        const line1 = document.createElement('div');
        line1.style.cssText = 'margin-bottom:12px;font-weight:600;';
        line1.textContent = t('disclaimer.line1', 'LuaTools is not affiliated in any way with Millennium');

        const line2 = document.createElement('div');
        line2.style.cssText = 'margin-bottom:12px;';
        line2.textContent = t('disclaimer.line2', 'Millennium will NOT offer you support for this plugin on their discord server');

        const line3 = document.createElement('div');
        line3.style.cssText = 'font-weight:700;color:#ff8e8e;';
        line3.textContent = t('disclaimer.line3', 'You will be BANNED from both LuaTools and Millennium servers if you go to their discord asking for help');

        messageEl.appendChild(line1);
        messageEl.appendChild(line2);
        messageEl.appendChild(line3);

        const inputGroup = document.createElement('div');
        inputGroup.style.cssText = 'margin-bottom:24px;';

        const inputLabel = document.createElement('div');
        inputLabel.style.cssText = 'font-size:12px;color:#8f98a0;margin-bottom:10px;text-align:center;text-transform:uppercase;letter-spacing:1px;';
        inputLabel.textContent = t('disclaimer.inputLabel', 'type "I Understand" in the box bellow to continue');

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = t('disclaimer.inputPlaceholder', 'I Understand');
        input.style.cssText = 'width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:12px;color:#fff;font-size:14px;outline:none;text-align:center;transition:all 0.3s ease;';
        input.onfocus = function () {
            this.style.borderColor = 'rgba(255,255,255,0.3)';
            this.style.background = 'rgba(0,0,0,0.4)';
        };
        input.onblur = function () {
            this.style.borderColor = 'rgba(255,255,255,0.1)';
            this.style.background = 'rgba(0,0,0,0.3)';
        };

        inputGroup.appendChild(inputLabel);
        inputGroup.appendChild(input);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:center;';

        const confirmBtn = document.createElement('a');
        confirmBtn.href = '#';
        confirmBtn.className = 'luatools-btn primary';
        confirmBtn.style.minWidth = 'auto';
        confirmBtn.style.background = '#FFEA00';
        confirmBtn.style.color = '#000';
        confirmBtn.style.justifyContent = 'center';
        confirmBtn.innerHTML = `<span>${lt('Confirm')}</span>`;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.pointerEvents = 'none';

        var expectedPhrase = t('disclaimer.inputPlaceholder', 'I Understand').trim().toLowerCase();
        input.oninput = function () {
            if (this.value.trim().toLowerCase() === expectedPhrase) {
                confirmBtn.style.opacity = '1';
                confirmBtn.style.pointerEvents = 'auto';
                confirmBtn.style.boxShadow = '0 0 15px rgba(255,234,0,0.6)';
            } else {
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.pointerEvents = 'none';
                confirmBtn.style.boxShadow = 'none';
            }
        };

        confirmBtn.onclick = function (e) {
            e.preventDefault();
            if (input.value.trim().toLowerCase() === expectedPhrase) {
                localStorage.setItem('luatools millennium disclaimer accepted', '1');
                overlay.remove();
            }
        };

        btnRow.appendChild(confirmBtn);

        modal.appendChild(iconContainer);
        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(inputGroup);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);

        document.body.appendChild(overlay);

        // Focus input after a short delay
        setTimeout(() => input.focus(), 300);

        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);
    }

    // Ensure consistent spacing for our buttons
    function ensureStyles() {
        if (!document.getElementById('luatools-spacing-styles')) {
            const style = document.createElement('style');
            style.id = 'luatools-spacing-styles';
            style.textContent = `
                .luatools-restart-button, .luatools-icon-button { margin-left: 6px !important; margin-right: 0 !important; }
                .luatools-button { margin-right: 0 !important; position: relative !important; }
                .luatools-pills-container {
                    position: absolute !important;
                    top: -25px !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                    display: inline-flex;
                    gap: 4px;
                    align-items: center;
                    pointer-events: none;
                    z-index: 10;
                    white-space: nowrap;
                }
                .luatools-pill {
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 9px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    display: inline-flex;
                    align-items: center;
                    height: 16px;
                    line-height: 1;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    cursor: default;
                }
                .luatools-pill.red { background: rgba(255, 80, 80, 0.15); color: #ff5050; border: 1px solid rgba(255, 80, 80, 0.3); }
                .luatools-pill.green { background: rgba(92, 184, 92, 0.15); color: #5cb85c; border: 1px solid rgba(92, 184, 92, 0.3); }
                .luatools-pill.yellow { background: rgba(255, 193, 7, 0.15); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.3); }
                .luatools-pill.orange { background: rgba(255, 136, 0, 0.15); color: #ff8800; border: 1px solid rgba(255, 136, 0, 0.3); }
                .luatools-pill.gray { background: rgba(150, 150, 150, 0.15); color: #a0a0a0; border: 1px solid rgba(150, 150, 150, 0.3); }
            `;
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
        } catch (err) {
            backendLog('LuaTools: updateButtonTranslations error: ' + err);
        }
    }

    // Function to add the LuaTools button
    // Add throttle to prevent excessive executions
    let lastButtonCheckTime = 0;
    const BUTTON_CHECK_THROTTLE = 500; // Only run once every 500ms

    function addLuaToolsButton() {
        // Throttle to prevent blocking gamepad input
        const now = Date.now();
        if (now - lastButtonCheckTime < BUTTON_CHECK_THROTTLE) {
            return; // Skip this execution, too soon
        }
        lastButtonCheckTime = now;

        // Track current URL to detect page changes
        const currentUrl = window.location.href;
        if (window.__LuaToolsLastUrl !== currentUrl) {
            // Page changed - reset button insertion flag and update translations
            window.__LuaToolsLastUrl = currentUrl;
            window.__LuaToolsButtonInserted = false;
            window.__LuaToolsRestartInserted = false;
            window.__LuaToolsIconInserted = false;
            window.__LuaToolsHeaderInserted = false;
            window.__LuaToolsPresenceCheckInFlight = false;
            window.__LuaToolsPresenceCheckAppId = undefined;
            // Ensure translations are loaded and update existing buttons
            ensureTranslationsLoaded(false).then(function () {
                updateButtonTranslations();
            });
        }

        // Store Header Button Logic (when not on app page)
        const isAppPath = window.location.pathname.includes('/app/');
        if (!isAppPath) {
            const headerContainer = document.querySelector('._1wn1lBlAzl3HMRqS1llwie');
            if (headerContainer && !document.querySelector('.luatools-header-button') && !window.__LuaToolsHeaderInserted) {
                ensureLuaToolsStyles();
                const headerBtn = document.createElement('a');
                headerBtn.href = '#';
                // Use luatools-btn primary class for that premium modal look
                headerBtn.className = 'luatools-btn primary luatools-header-button Focusable';
                headerBtn.style.cssText = 'margin-left:12px; display:inline-flex; align-items:center; justify-content:center; align-self:center; cursor:pointer; flex-shrink:0; width:36px; height:36px; padding:0; border-radius:8px; border-width:1px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);';
                headerBtn.title = 'LuaTools Settings';

                headerBtn.setAttribute('data-tooltip-text', 'LuaTools Settings');

                const img = document.createElement('img');
                img.style.height = '18px';
                img.style.width = '18px';
                img.style.verticalAlign = 'middle';

                try {
                    Millennium.callServerMethod('luatools', 'GetIconDataUrl', {
                        contentScriptQuery: ''
                    }).then(function (res) {
                        try {
                            const payload = typeof res === 'string' ? JSON.parse(res) : res;
                            if (payload && payload.success && payload.dataUrl) {
                                img.src = payload.dataUrl;
                            } else {
                                img.src = 'LuaTools/luatools-icon.png';
                            }
                        } catch (_) {
                            img.src = 'LuaTools/luatools-icon.png';
                        }
                    });
                } catch (_) {
                    img.src = 'LuaTools/luatools-icon.png';
                }

                img.onerror = function () {
                    // cogwhell fallback
                    headerBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="LuaTools"><path fill="currentColor" d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.94 3.06l-2.12-.35a7.962 7.962 0 00-1.02-2.46l1.29-1.72a.75.75 0 00-.09-.97l-1.41-1.41a.75.75 0 00-.97-.09l-1.72 1.29c-.77-.44-1.6-.78-2.46-1.02L13.06 2.06A.75.75 0 0012.31 2h-1.62a.75.75 0 00-.75.65l-.35 2.12a7.962 7.962 0 00-2.46 1.02L5 4.6a.75.75 0 00-.97.09L2.62 6.1a.75.75 0 00-.09.97l1.29 1.72c-.44.77-.78 1.6-1.02 2.46l-2.12.35a.75.75 0 00-.65.75v1.62c0 .37.27.69.63.75l2.14.36c.24.86.58 1.69 1.02 2.46L2.53 18a.75.75 0 00.09.97l1.41 1.41c.26.26.67.29.97.09l1.72-1.29c.77.44 1.6.78 2.46 1.02l.35 2.12c.06.36.38.63.75.63h1.62c.37 0 .69-.27.75-.63l.36-2.14c.86-.24 1.69-.58 2.46-1.02l1.72 1.29c.3.2.71.17.97-.09l1.41-1.41c.26-.26.29-.67.09-.97l-1.29-1.72c.44-.77.78-1.6 1.02-2.46l2.12-.35c.36-.06.63-.38.63-.75v-1.62a.75.75 0 00-.65-.75z"/></svg>';
                };

                headerBtn.appendChild(img);

                headerBtn.onclick = function (e) {
                    e.preventDefault();
                    showSettingsPopup();
                };

                headerContainer.appendChild(headerBtn);
                window.__LuaToolsHeaderInserted = true;
                backendLog('Inserted store header button (non-app page)');
            }
        }

        // Check if we're in Big Picture mode
        const isBigPicture = window.__LUATOOLS_IS_BIG_PICTURE__;

        // Look for the appropriate container based on mode
        let targetContainer;
        if (isBigPicture) {
            // In Big Picture mode, use the queue button's parent as reference
            const queueBtn = document.querySelector('#queueBtnFollow');
            targetContainer = queueBtn ? queueBtn.parentElement : null;
        } else {
            // In normal mode, use the SteamDB buttons container
            targetContainer = document.querySelector('.steamdb-buttons') ||
                document.querySelector('[data-steamdb-buttons]') ||
                document.querySelector('.apphub_OtherSiteInfo');
        }

        if (targetContainer) {
            const steamdbContainer = targetContainer;

            // Insert a Restart Steam button between Community Hub and our LuaTools button
            try {
                if (!document.querySelector('.luatools-restart-button') && !window.__LuaToolsRestartInserted) {
                    ensureStyles();
                    // In Big Picture mode, use queue button as reference; otherwise use first link in container
                    const referenceBtn = isBigPicture ?
                        document.querySelector('#queueBtnFollow') :
                        steamdbContainer.querySelector('a');

                    // Use same custom button for both modes
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
                    } catch (_) { }

                    restartBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        try {
                            // Ensure any settings overlays are closed before confirm
                            closeSettingsOverlay();
                            showLuaToolsConfirm('LuaTools', lt('Restart Steam now?'),
                                function () {
                                    try {
                                        Millennium.callServerMethod('luatools', 'RestartSteam', {
                                            contentScriptQuery: ''
                                        });
                                    } catch (_) { }
                                },
                                function () {
                                    /* Cancel - do nothing */
                                }
                            );
                        } catch (_) {
                            showLuaToolsConfirm('LuaTools', lt('Restart Steam now?'),
                                function () {
                                    try {
                                        Millennium.callServerMethod('luatools', 'RestartSteam', {
                                            contentScriptQuery: ''
                                        });
                                    } catch (_) { }
                                },
                                function () {
                                    /* Cancel - do nothing */
                                }
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
                            // Use same custom button for both modes
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
                            } catch (_) { }

                            const ispan = document.createElement('span');
                            const img = document.createElement('img');
                            img.alt = '';
                            img.style.height = '16px';
                            img.style.width = '16px';
                            img.style.verticalAlign = 'middle';
                            // Try to fetch data URL for the icon from backend to avoid path issues
                            try {
                                Millennium.callServerMethod('luatools', 'GetIconDataUrl', {
                                    contentScriptQuery: ''
                                }).then(function (res) {
                                    try {
                                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                        if (payload && payload.success && payload.dataUrl) {
                                            img.src = payload.dataUrl;
                                        } else {
                                            img.src = 'LuaTools/luatools-icon.png';
                                        }
                                    } catch (_) {
                                        img.src = 'LuaTools/luatools-icon.png';
                                    }
                                });
                            } catch (_) {
                                img.src = 'LuaTools/luatools-icon.png';
                            }
                            // If image fails, fallback to inline SVG gear
                            img.onerror = function () {
                                ispan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.94 3.06l-2.12-.35a7.962 7.962 0 00-1.02-2.46l1.29-1.72a.75.75 0 00-.09-.97l-1.41-1.41a.75.75 0 00-.97-.09l-1.72 1.29c-.77-.44-1.6-.78-2.46-1.02L13.06 2.06A.75.75 0 0012.31 2h-1.62a.75.75 0 00-.75.65l-.35 2.12a7.962 7.962 0 00-2.46 1.02L5 4.6a.75.75 0 00-.97.09L2.62 6.1a.75.75 0 00-.09.97l1.29 1.72c-.44.77-.78 1.6-1.02 2.46l-2.12.35a.75.75 0 00-.65.75v1.62c0 .37.27.69.63.75l2.14.36c.24.86.58 1.69 1.02 2.46L2.53 18a.75.75 0 00.09.97l1.41 1.41c.26.26.67.29.97.09l1.72-1.29c.77.44 1.6.78 2.46 1.02l.35 2.12c.06.36.38.63.75.63h1.62c.37 0 .69-.27.75-.63l.36-2.14c.86-.24 1.69-.58 2.46-1.02l1.72 1.29c.3.2.71.17.97-.09l1.41-1.41c.26-.26.29-.67.09-.97l-1.29-1.72c.44-.77.78-1.6 1.02-2.46l2.12-.35c.36-.06.63-.38.63-.75v-1.62a.75.75 0 00-.65-.75z"/></svg>';
                            };
                            ispan.appendChild(img);
                            iconBtn.appendChild(ispan);
                            iconBtn.addEventListener('click', function (e) {
                                e.preventDefault();
                                showSettingsPopup();
                            });

                            steamdbContainer.appendChild(iconBtn);

                            window.__LuaToolsIconInserted = true;
                            backendLog('Inserted Icon button');
                        }
                    } catch (_) { }
                    window.__LuaToolsRestartInserted = true;
                    backendLog('Inserted Restart Steam button');
                }
            } catch (_) { }

            // Status Pills Logic
            // Always update translations for existing buttons (even if not a page change)
            const existingBtn = document.querySelector('.luatools-button');
            if (existingBtn) {
                ensureTranslationsLoaded(false).then(function () {
                    updateButtonTranslations();
                });
            }

            // Check if button already exists to avoid duplicates
            if (!existingBtn && !window.__LuaToolsButtonInserted) {

                // Create the LuaTools button modeled after existing SteamDB/PCGW buttons
                // In Big Picture mode, use queue button as reference; otherwise use first link in container
                let referenceBtn = isBigPicture ?
                    document.querySelector('#queueBtnFollow') :
                    steamdbContainer.querySelector('a');

                // Use same custom button for both modes
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
                } catch (_) { }

                // Local click handler suppressed; delegated handler manages actions
                luatoolsButton.addEventListener('click', function (e) {
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
                        Millennium.callServerMethod('luatools', 'HasLuaToolsForApp', {
                            appid,
                            contentScriptQuery: ''
                        }).then(function (res) {
                            try {
                                const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                if (payload && payload.success && payload.exists === true) {
                                    backendLog('LuaTools already present for this app; not inserting button');
                                    window.__LuaToolsPresenceCheckInFlight = false;
                                    return; // do not insert
                                }
                                // Re-check in case another caller inserted during async
                                if (!document.querySelector('.luatools-button') && !window.__LuaToolsButtonInserted) {
                                    // Insert after icon button (order: Restart → Icon → Add)
                                    const iconExisting = steamdbContainer.querySelector('.luatools-icon-button');
                                    const restartExisting = steamdbContainer.querySelector('.luatools-restart-button');
                                    if (iconExisting && iconExisting.before) {
                                        iconExisting.before(luatoolsButton);
                                    } else if (restartExisting && restartExisting.after) {
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
                            } catch (_) {
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
                            // Insert after icon button (order: Restart → Icon → Add)
                            const iconExisting = steamdbContainer.querySelector('.luatools-icon-button');
                            const restartExisting = steamdbContainer.querySelector('.luatools-restart-button');
                            if (iconExisting && iconExisting.before) {
                                iconExisting.before(luatoolsButton);
                            } else if (restartExisting && restartExisting.after) {
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
                } catch (_) {
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
            }

            // status pills!! fire emoji
            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : (window.__LuaToolsCurrentAppId || NaN);

                if (!isNaN(appid)) {
                    fetchGamesDatabase().then(function (db) {
                        const btn = steamdbContainer.querySelector('.luatools-button');
                        if (!btn) return;

                        let pillsContainer = btn.querySelector('.luatools-pills-container');

                        if (!pillsContainer) {
                            pillsContainer = document.createElement('div');
                            pillsContainer.className = 'luatools-pills-container';
                            btn.appendChild(pillsContainer);
                        }

                        const key = String(appid);
                        const gameData = (db && db[key]) ? db[key] : null;

                        // check denuvo
                        const drmNotice = document.querySelector('.DRM_notice');
                        const hasDenuvo = drmNotice && drmNotice.textContent.includes('Denuvo');

                        const fixesPromise = fetchFixes(appid);

                        fixesPromise.then(function (fixesData) {
                            const hasFixes = fixesData && (
                                (fixesData.genericFix && fixesData.genericFix.status === 200) ||
                                (fixesData.onlineFix && fixesData.onlineFix.status === 200)
                            );
                            const showDenuvoPill = hasDenuvo && !hasFixes;

                            const cacheKey = JSON.stringify({
                                d: gameData || 'untested',
                                showDenuvo: showDenuvoPill,
                                hasFixes: hasFixes
                            });

                            if (pillsContainer.dataset.content === cacheKey) return;
                            pillsContainer.dataset.content = cacheKey;

                            pillsContainer.innerHTML = '';

                            let status = 'untested';
                            if (gameData && typeof gameData.playable !== 'undefined') {
                                if (gameData.playable === 1) status = 'playable';
                                else if (gameData.playable === 0) status = 'unplayable';
                                else if (gameData.playable === 2) status = 'needs_fixes';
                            }

                            if (status === 'untested' && hasFixes) {
                                status = 'needs_fixes';
                            }

                            if (status !== 'untested') {
                                const pill = document.createElement('span');
                                pill.className = 'luatools-pill';
                                if (status === 'playable') {
                                    pill.classList.add('green');
                                    pill.textContent = t('gameStatus.playable', 'Playable');
                                } else if (status === 'unplayable') {
                                    pill.classList.add('red');
                                    pill.textContent = t('gameStatus.unplayable', 'Unplayable');
                                } else if (status === 'needs_fixes') {
                                    pill.classList.add('yellow');
                                    pill.textContent = t('gameStatus.needsFixes', 'Needs fixes');
                                }
                                pillsContainer.appendChild(pill);
                            }

                            // reset button state
                            const btn = steamdbContainer.querySelector('.luatools-button');
                            if (btn) {
                                btn.style.opacity = '';
                                btn.style.pointerEvents = '';
                                btn.style.cursor = '';
                                const span = btn.querySelector('span');
                                if (span && span.textContent === 'Unplayable') {
                                    span.textContent = lt('Add via LuaTools');
                                }
                            }

                            if (showDenuvoPill) {
                                const pill = document.createElement('span');
                                pill.className = 'luatools-pill orange';
                                pill.textContent = t('gameStatus.denuvo', 'Denuvo');
                                pillsContainer.appendChild(pill);
                            }
                        });
                    });
                }
            } catch (e) {
                /* ignore */
            }
        } else {
            if (!logState.missingOnce) {
                backendLog('LuaTools: steamdbContainer not found on this page');
                logState.missingOnce = true;
            }
        }
    }

    // Try to add the button immediately if DOM is ready
    function onFrontendReady() {
        // Fetch settings on startup to ensure saved theme is applied across pages
        try {
            fetchSettingsConfig(true).then(function (cfg) {
                try {
                    ensureLuaToolsStyles();
                } catch (_) { }

                // Show disclaimer after translations are loaded so it displays in the correct language
                try {
                    if (window.location.hostname === 'store.steampowered.com') {
                        if (localStorage.getItem('luatools millennium disclaimer accepted') !== '1') {
                            showMillenniumDisclaimerModal();
                        }
                    }
                } catch (_) { }
            }).catch(function (_) { });
        } catch (_) { }

        addLuaToolsButton();

        // Show gamepad hint if connected (only in Big Picture mode)
        setTimeout(function () {
            if (window.GamepadNav && window.GamepadNav.isConnected && window.GamepadNav.isConnected()) {
                backendLog('[LuaTools] Gamepad detected - Navigation enabled');

                // Only show visual hint in Big Picture mode
                if (window.__LUATOOLS_IS_BIG_PICTURE__) {
                    const hint = document.createElement('div');
                    hint.id = 'luatools-gamepad-hint';
                    hint.innerHTML = '🎮 ' + lt('bigpicture.mouseTip');
                    hint.style.cssText = '\
                        position: fixed;\
                        bottom: 20px;\
                        right: 20px;\
                        background: rgba(11, 20, 30, 0.9);\
                        color: #66c0f4;\
                        padding: 12px 16px;\
                        border-radius: 8px;\
                        font-size: 14px;\
                        z-index: 99998;\
                        border: 1px solid rgba(102, 192, 244, 0.3);\
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);\
                        animation: fadeInOut 3s ease-in-out;\
                    ';

                    // Add CSS animation if not already present
                    if (!document.querySelector('#luatools-gamepad-hint-styles')) {
                        const style = document.createElement('style');
                        style.id = 'luatools-gamepad-hint-styles';
                        style.textContent = '\
                            @keyframes fadeInOut {\
                                0% { opacity: 0; transform: translateY(10px); }\
                                10% { opacity: 1; transform: translateY(0); }\
                                90% { opacity: 1; transform: translateY(0); }\
                                100% { opacity: 0; transform: translateY(10px); }\
                            }\
                        ';
                        document.head.appendChild(style);
                    }

                    document.body.appendChild(hint);

                    // Auto-remove after animation
                    setTimeout(function () {
                        if (hint && hint.parentElement) {
                            hint.remove();
                        }
                    }, 3000);
                }
            }
        }, 500);

        // Ask backend if there is a queued startup message from InitApis
        try {
            if (typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                Millennium.callServerMethod('luatools', 'GetInitApisMessage', {
                    contentScriptQuery: ''
                }).then(function (res) {
                    try {
                        const payload = typeof res === 'string' ? JSON.parse(res) : res;
                        if (payload && payload.message) {
                            const msg = String(payload.message);
                            // Check if this is an update message (contains "update" or "restart")
                            const isUpdateMsg = msg.toLowerCase().includes('update') || msg.toLowerCase().includes('restart');

                            if (isUpdateMsg) {
                                // For update messages, use confirm dialog with OK (restart) and Cancel options
                                showLuaToolsConfirm('LuaTools', msg, function () {
                                    // User clicked Confirm - restart Steam
                                    try {
                                        Millennium.callServerMethod('luatools', 'RestartSteam', {
                                            contentScriptQuery: ''
                                        });
                                    } catch (_) { }
                                }, function () {
                                    // User clicked Cancel - do nothing (just closes dialog)
                                });
                            } else {
                                // For non-update messages, use regular alert
                                ShowLuaToolsAlert('LuaTools', msg);
                            }
                        }
                    } catch (_) { }
                });
                // Also show loaded apps list if present (only once per session, store page only)
                try {
                    if (window.location.hostname === 'store.steampowered.com') {
                        if (!sessionStorage.getItem('LuaToolsLoadedAppsGate')) {
                            sessionStorage.setItem('LuaToolsLoadedAppsGate', '1');
                            Millennium.callServerMethod('luatools', 'ReadLoadedApps', {
                                contentScriptQuery: ''
                            }).then(function (res) {
                                try {
                                    const payload = typeof res === 'string' ? JSON.parse(res) : res;
                                    const apps = (payload && payload.success && Array.isArray(payload.apps)) ? payload.apps : [];
                                    if (apps.length > 0) {
                                        showLoadedAppsPopup(apps);
                                    }
                                } catch (_) { }
                            });
                        }
                    }
                } catch (_) { }
            }
        } catch (_) { }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onFrontendReady);
    } else {
        onFrontendReady();
    }

    // Delegate click handling in case the DOM is re-rendered and listeners are lost
    // Use bubble phase instead of capture phase to avoid interfering with gamepad navigation
    document.addEventListener('click', function (evt) {
        // Quick exit if target doesn't have closest method or isn't an element
        if (!evt.target || !evt.target.closest) return;

        const anchor = evt.target.closest('.luatools-button');
        if (anchor) {
            evt.preventDefault();
            evt.stopPropagation(); // Stop propagation to avoid conflicts
            backendLog('LuaTools delegated click');
            try {
                const match = window.location.href.match(/https:\/\/store\.steampowered\.com\/app\/(\d+)/) || window.location.href.match(/https:\/\/steamcommunity\.com\/app\/(\d+)/);
                const appid = match ? parseInt(match[1], 10) : NaN;
                if (!isNaN(appid) && typeof Millennium !== 'undefined' && typeof Millennium.callServerMethod === 'function') {
                    if (runState.inProgress && runState.appid === appid) {
                        backendLog('LuaTools: operation already in progress for this appid');
                        return;
                    }

                    // Helper that continues with the normal add flow
                    const continueWithAdd = function () {
                        if (!document.querySelector('.luatools-overlay')) {
                            showTestPopup();
                        }
                        runState.inProgress = true;
                        runState.appid = appid;
                        Millennium.callServerMethod('luatools', 'StartAddViaLuaTools', {
                            appid,
                            contentScriptQuery: ''
                        });
                        startPolling(appid);
                    };

                    // First check if it's a DLC
                    fetch('https://store.steampowered.com/api/appdetails?appids=' + appid + '&filters=basic')
                        .then(function (res) {
                            return res.json();
                        })
                        .then(function (data) {
                            if (data && data[appid] && data[appid].success && data[appid].data) {
                                const info = data[appid].data;
                                if (info.type === 'dlc' && info.fullgame && info.fullgame.appid) {
                                    showDlcWarning(appid, info.fullgame.appid, info.fullgame.name);
                                    return;
                                }
                            }

                            // Not a DLC (or failed to check), proceed with database check
                            return fetchGamesDatabase().then(function (db) {
                                try {
                                    const key = String(appid);
                                    const gameData = db && db[key] ? db[key] : null;
                                    if (gameData && gameData.playable === 0) {
                                        // warning modal
                                        showLuaToolsPlayableWarning('This game may not work, support for it wont be given in our discord', function () {
                                            continueWithAdd();
                                        }, function () { });
                                    } else {
                                        continueWithAdd();
                                    }
                                } catch (_) {
                                    continueWithAdd();
                                }
                            });
                        })
                        .catch(function (err) {
                            backendLog('LuaTools: DLC check failed: ' + err);
                            continueWithAdd();
                        });
                }
            } catch (_) { }
        }
    }, false); // Changed from true to false (bubble phase instead of capture phase)

    // Poll backend for progress and update progress bar and text
    function startPolling(appid) {
        let done = false;
        let lastCheckedApi = null;
        let successfulApi = null; // Track which API successfully found the file
        const timer = setInterval(() => {
            if (done) {
                clearInterval(timer);
                return;
            }
            try {
                Millennium.callServerMethod('luatools', 'GetAddViaLuaToolsStatus', {
                    appid,
                    contentScriptQuery: ''
                }).then(function (res) {
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
                            const colors = getThemeColors();
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
                                        item.style.background = `rgba(${colors.rgbString},0.2)`;
                                        item.style.borderColor = colors.accent;
                                        apiStatus.innerHTML = `<span style="color:${colors.accent};">${lt('Found')}</span><i class="fa-solid fa-check" style="color:${colors.accent};"></i>`;
                                    } else if (!foundSuccessful) {
                                        // This API comes before the successful one, check if it has an error first
                                        if (st.apiErrors && st.apiErrors[apiName]) {
                                            const apiError = st.apiErrors[apiName];
                                            item.style.background = `rgba(255, 0, 0, 0.15)`;
                                            item.style.borderColor = '#ff5c5c';
                                            if (apiError.type === 'timeout') {
                                                apiStatus.innerHTML = `<span style="color:#ff5c5c;">${lt('Error, Timed Out')}</span><i class="fa-solid fa-clock" style="color:#ff5c5c;"></i>`;
                                            } else if (apiError.type === 'error') {
                                                const code = apiError.code ? String(apiError.code) : '';
                                                apiStatus.innerHTML = `<span style="color:#ff5c5c;">${lt('Error, Code: {code}').replace('{code}', code)}</span><i class="fa-solid fa-exclamation-triangle" style="color:#ff5c5c;"></i>`;
                                            }
                                        } else {
                                            // Mark as not found
                                            item.style.background = `rgba(0,0,0,0.2)`;
                                            item.style.borderColor = colors.borderRgba;
                                            apiStatus.innerHTML = `<span style="color:${colors.textSecondary};">${lt('Not found')}</span><i class="fa-solid fa-xmark" style="color:${colors.textSecondary};"></i>`;
                                        }
                                    } else {
                                        // This API comes after the successful one, mark as skipped
                                        item.style.background = `rgba(0,0,0,0.15)`;
                                        item.style.borderColor = colors.borderRgba;
                                        apiStatus.innerHTML = `<span style="color:${colors.textSecondary};">${lt('Skipped')}</span><i class="fa-solid fa-minus" style="color:${colors.textSecondary};"></i>`;
                                    }
                                });
                            }

                            // Mark previous API as not found if we moved to a new one (only during checking phase)
                            if (st.status === 'checking' && st.currentApi && st.currentApi !== lastCheckedApi && lastCheckedApi) {
                                apiItems.forEach((item) => {
                                    const apiName = item.getAttribute('data-api-name');
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus) return;

                                    if (apiName === lastCheckedApi) {
                                        item.style.background = `rgba(0,0,0,0.2)`;
                                        item.style.borderColor = colors.borderRgba;
                                        apiStatus.innerHTML = `<span style="color:${colors.textSecondary};">${lt('Not found')}</span><i class="fa-solid fa-xmark" style="color:${colors.textSecondary};"></i>`;
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
                                        item.style.background = `rgba(${colors.rgbString},0.15)`;
                                        item.style.borderColor = colors.accent;
                                        apiStatus.innerHTML = `<span style="color:${colors.accent};">${lt('Checking…')}</span><i class="fa-solid fa-spinner" style="color:${colors.accent};animation: spin 1.5s linear infinite;"></i>`;
                                    }
                                });

                                lastCheckedApi = st.currentApi;
                            }

                            // Show error statuses for APIs that errored (when not checking them anymore)
                            if (st.apiErrors && typeof st.apiErrors === 'object') {
                                apiItems.forEach((item) => {
                                    const apiName = item.getAttribute('data-api-name');
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus || !apiName) return;

                                    const apiError = st.apiErrors[apiName];
                                    if (!apiError) return;

                                    // Only show error if this API is not currently being checked
                                    if (st.currentApi === apiName && st.status === 'checking') return;

                                    // Don't overwrite "Found" status
                                    const statusText = apiStatus.textContent || '';
                                    if (statusText.includes('Found') || statusText.includes('Encontrado')) return;

                                    item.style.background = `rgba(255, 0, 0, 0.15)`;
                                    item.style.borderColor = '#ff5c5c';

                                    if (apiError.type === 'timeout') {
                                        apiStatus.innerHTML = `<span style="color:#ff5c5c;">${lt('Error, Timed Out')}</span><i class="fa-solid fa-clock" style="color:#ff5c5c;"></i>`;
                                    } else if (apiError.type === 'error') {
                                        const code = apiError.code ? String(apiError.code) : '';
                                        apiStatus.innerHTML = `<span style="color:#ff5c5c;">${lt('Error, Code: {code}').replace('{code}', code)}</span><i class="fa-solid fa-exclamation-triangle" style="color:#ff5c5c;"></i>`;
                                    }
                                });
                            }
                        }

                        // Update UI if overlay is present
                        if (st.status === 'checking' && st.currentApi && title) {
                            title.textContent = lt('LuaTools · {api}').replace('{api}', st.currentApi);
                        } else if ((st.status === 'downloading' || st.status === 'processing' || st.status === 'installing') && title) {
                            title.textContent = t('common.appName', 'LuaTools');
                        }

                        if (status) {
                            if (st.status === 'checking') status.textContent = lt('Checking availability…');
                            if (st.status === 'downloading') status.textContent = lt('Downloading…');
                            if (st.status === 'processing') status.textContent = lt('Processing package…');
                            if (st.status === 'installing') status.textContent = lt('Installing…');
                            if (st.status === 'done') status.textContent = lt('Finishing…');
                            if (st.status === 'failed') status.textContent = lt('Failed');
                        }
                        if (st.status === 'downloading' || st.status === 'processing' || st.status === 'installing') {
                            // reveal progress UI (if overlay visible)
                            if (wrap && wrap.style.display === 'none') wrap.style.display = 'block';
                            if (progressInfo && progressInfo.style.display === 'none') {
                                progressInfo.style.display = 'flex';
                                progressInfo.style.justifyContent = 'space-between';
                            }

                            const total = st.totalBytes || 0;
                            const read = st.bytesRead || 0;
                            let pct = total > 0 ? Math.floor((read / total) * 100) : (read ? 1 : 0);
                            if (pct > 100) pct = 100;
                            if (pct < 0) pct = 0;

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
                        if (st.status === 'done') {
                            // Update popup if visible
                            if (title) title.textContent = t('common.appName', 'LuaTools');
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
                                setTimeout(function () {
                                    if (wrap) wrap.style.display = 'none';
                                    if (progressInfo) progressInfo.style.display = 'none';
                                }, 300);
                            }
                            done = true;
                            clearInterval(timer);
                            runState.inProgress = false;
                            runState.appid = null;
                            // Remove button since game is added (works even if popup is hidden)
                            const btnEl = document.querySelector('.luatools-button');
                            if (btnEl && btnEl.parentElement) {
                                btnEl.parentElement.removeChild(btnEl);
                            }
                        }
                        if (st.status === 'failed') {
                            // Mark all APIs as not found when failed (unless they have error status)
                            if (overlay && !successfulApi) {
                                const colors = getThemeColors();
                                const apiItems = overlay.querySelectorAll('.luatools-api-item');
                                apiItems.forEach((item) => {
                                    const apiName = item.getAttribute('data-api-name');
                                    const apiStatus = item.querySelector('.luatools-api-status');
                                    if (!apiStatus) return;

                                    // Skip if this API already has an error status
                                    if (st.apiErrors && st.apiErrors[apiName]) {
                                        const apiError = st.apiErrors[apiName];
                                        item.style.background = `rgba(255, 0, 0, 0.15)`;
                                        item.style.borderColor = '#ff5c5c';
                                        if (apiError.type === 'timeout') {
                                            apiStatus.innerHTML = `<span style="color:#ff5c5c;">${lt('Error, Timed Out')}</span><i class="fa-solid fa-clock" style="color:#ff5c5c;"></i>`;
                                        } else if (apiError.type === 'error') {
                                            const code = apiError.code ? String(apiError.code) : '';
                                            apiStatus.innerHTML = `<span style="color:#ff5c5c;">${lt('Error, Code: {code}').replace('{code}', code)}</span><i class="fa-solid fa-exclamation-triangle" style="color:#ff5c5c;"></i>`;
                                        }
                                        return;
                                    }

                                    // Check if this API is still in "Waiting..." or "Checking..." state
                                    const statusText = apiStatus.textContent || '';
                                    if (statusText.includes('Waiting') || statusText.includes('Esperando') || statusText.includes('Checking') || statusText.includes('Verificando')) {
                                        item.style.background = `rgba(0,0,0,0.2)`;
                                        item.style.borderColor = colors.borderRgba;
                                        apiStatus.innerHTML = `<span style="color:${colors.textSecondary};">${lt('Not found')}</span><i class="fa-solid fa-xmark" style="color:${colors.textSecondary};"></i>`;
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
                            done = true;
                            clearInterval(timer);
                            runState.inProgress = false;
                            runState.appid = null;
                        }
                    } catch (_) { }
                });
            } catch (_) {
                clearInterval(timer);
            }
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
            window.__LuaToolsHeaderInserted = false;

            window.__LuaToolsPresenceCheckInFlight = false;
            window.__LuaToolsPresenceCheckAppId = undefined;
            // Update translations and re-add buttons
            ensureTranslationsLoaded(false).then(function () {
                updateButtonTranslations();
                addLuaToolsButton();
            });
        }
    }
    // Check URL changes periodically and on popstate
    // Reduced frequency to avoid blocking gamepad input
    setInterval(checkUrlChange, 2000); // Changed from 500ms to 2000ms (2 seconds)
    window.addEventListener('popstate', checkUrlChange);
    // Override pushState/replaceState to detect navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function () {
        originalPushState.apply(history, arguments);
        setTimeout(checkUrlChange, 100);
    };
    history.replaceState = function () {
        originalReplaceState.apply(history, arguments);
        setTimeout(checkUrlChange, 100);
    };

    // Use MutationObserver to catch dynamically added content
    // Heavily optimized and throttled version to avoid blocking gamepad
    if (typeof MutationObserver !== 'undefined') {
        let mutationTimeout;
        let lastMutationProcessTime = 0;
        const MUTATION_THROTTLE = 1000; // Only process once per second

        const observer = new MutationObserver(function (mutations) {
            // Additional throttle on top of debounce
            const now = Date.now();
            if (now - lastMutationProcessTime < MUTATION_THROTTLE) {
                return; // Skip if processed recently
            }

            // Debounce mutations to avoid blocking the UI
            clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(function () {
                lastMutationProcessTime = Date.now();

                let shouldUpdate = false;
                // Quick check: only process first 10 mutations to avoid long loops
                const mutationsToCheck = Math.min(mutations.length, 10);

                for (let i = 0; i < mutationsToCheck; i++) {
                    const mutation = mutations[i];
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // Only check first 3 added nodes to avoid blocking
                        const nodesToCheck = Math.min(mutation.addedNodes.length, 3);

                        for (let j = 0; j < nodesToCheck; j++) {
                            const node = mutation.addedNodes[j];
                            if (node.nodeType === 1) { // Element node
                                // Quick class check without querySelector (faster)
                                if (node.classList && (
                                    node.classList.contains('steamdb-buttons') ||
                                    node.classList.contains('apphub_OtherSiteInfo') ||
                                    node.id === 'queueBtnFollow'
                                )) {
                                    shouldUpdate = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (shouldUpdate) break;
                }

                if (shouldUpdate) {
                    updateButtonTranslations();
                    addLuaToolsButton();
                }
            }, 300); // Increased debounce to 300ms
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
        const loadedAppsModalColors = getThemeColors();
        modal.style.cssText = `background:${loadedAppsModalColors.modalBg};color:${loadedAppsModalColors.text};border:2px solid ${loadedAppsModalColors.border};border-radius:8px;width:560px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${loadedAppsModalColors.shadowRgba};animation:slideUp 0.1s ease-out;`;
        const title = document.createElement('div');
        const loadedAppsTitleColors = getThemeColors();
        title.style.cssText = `font-size:24px;color:${loadedAppsTitleColors.text};margin-bottom:20px;font-weight:700;text-shadow:0 2px 8px ${loadedAppsTitleColors.shadow};background:${loadedAppsTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;`;
        title.textContent = lt('LuaTools · Added Games');
        const body = document.createElement('div');
        const loadedAppsBodyColors = getThemeColors();
        body.style.cssText = `font-size:14px;line-height:1.8;margin-bottom:16px;max-height:320px;overflow:auto;padding:16px;border:1px solid ${loadedAppsBodyColors.border};border-radius:12px;background:${loadedAppsBodyColors.bgContainer};`;
        if (apps && apps.length) {
            const list = document.createElement('div');
            apps.forEach(function (item) {
                const a = document.createElement('a');
                a.href = 'steam://install/' + String(item.appid);
                a.textContent = String(item.name || item.appid);
                const linkColors = getThemeColors();
                a.style.cssText = `display:block;color:${linkColors.textSecondary};text-decoration:none;padding:10px 16px;margin-bottom:8px;background:rgba(${linkColors.rgbString},0.08);border:1px solid rgba(${linkColors.rgbString},0.2);border-radius:4px;transition:all 0.3s ease;`;
                a.onmouseover = function () {
                    const c = getThemeColors();
                    this.style.background = `rgba(${c.rgbString},0.2)`;
                    this.style.borderColor = c.accent;
                    this.style.transform = 'translateX(4px)';
                    this.style.color = c.text;
                };
                a.onmouseout = function () {
                    const c = getThemeColors();
                    this.style.background = `rgba(${c.rgbString},0.08)`;
                    this.style.borderColor = `rgba(${c.rgbString},0.2)`;
                    this.style.transform = 'translateX(0)';
                    this.style.color = c.textSecondary;
                };
                a.onclick = function (e) {
                    e.preventDefault();
                    try {
                        window.location.href = a.href;
                    } catch (_) { }
                };
                a.oncontextmenu = function (e) {
                    e.preventDefault();
                    const url = 'https://steamdb.info/app/' + String(item.appid) + '/';
                    try {
                        Millennium.callServerMethod('luatools', 'OpenExternalUrl', {
                            url,
                            contentScriptQuery: ''
                        });
                    } catch (_) { }
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
        dismissBtn.onclick = function (e) {
            e.preventDefault();
            try {
                Millennium.callServerMethod('luatools', 'DismissLoadedApps', {
                    contentScriptQuery: ''
                });
            } catch (_) { }
            try {
                sessionStorage.setItem('LuaToolsLoadedAppsShown', '1');
            } catch (_) { }
            overlay.remove();
        };
        btnRow.appendChild(instructionText);
        btnRow.appendChild(dismissBtn);
        modal.appendChild(title);
        modal.appendChild(body);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);

        // Re-scan elements for gamepad navigation
        setTimeout(function () {
            if (window.GamepadNav) {
                window.GamepadNav.scanElements();
            }
        }, 150);
    }

    // ============================================
    // GAMEPAD NAVIGATION INTEGRATION
    // ============================================
    // Note: The gamepad back handler is configured in the gamepad system at the top of this file
    // It already handles all overlay types automatically using OVERLAY_SELECTOR_STRING

})();