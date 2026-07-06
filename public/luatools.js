// LuaTools button injection (standalone plugin)

// ============================================
// GAMEPAD NAVIGATION SYSTEM - Inline Version
// ============================================
(function () {
  "use strict";

  // Inject gamepad navigation CSS
  const gamepadCSS = document.createElement("style");
  gamepadCSS.id = "gamepad-navigation-styles";
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
        .luatools-restart-button.active-focus {
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
    ".luatools-overlay",
    ".luatools-settings-overlay",
    ".luatools-alert-overlay",
    ".luatools-confirm-overlay",
    ".luatools-loadedapps-overlay",
  ];
  const OVERLAY_SELECTOR_STRING = OVERLAY_SELECTORS.join(", ");

  const CONFIG = {
    deadzone: 0.4, // Increased from 0.3 to prevent unwanted drift
    debounceTime: 200,
    stickThreshold: 0.7, // Increased threshold for stick navigation
    buttonMap: {
      A: 0,
      B: 1,
      DPAD_UP: 12,
      DPAD_DOWN: 13,
      DPAD_LEFT: 14,
      DPAD_RIGHT: 15,
    },
    axesMap: {
      LEFT_STICK_X: 0,
      LEFT_STICK_Y: 1,
    },
  };

  const state = {
    gamepadConnected: false,
    gamepadIndex: null,
    focusableElements: [],
    currentFocusIndex: 0,
    lastNavigationTime: 0,
    lastAxisValues: {
      x: 0,
      y: 0,
    },
    buttonStates: {},
    animationFrameId: null,
  };

  // duplicated from main code thing for reliability
  function isBigPictureMode() {
    if (typeof window.__LUATOOLS_IS_BIG_PICTURE__ !== "undefined") {
      return window.__LUATOOLS_IS_BIG_PICTURE__;
    }
    const htmlClasses = document.documentElement.className;
    const userAgent = navigator.userAgent;
    let score = 0;
    if (htmlClasses.includes("BasicUI")) score += 3;
    if (htmlClasses.includes("DesktopUI")) score -= 3;
    if (userAgent.includes("Valve Steam Gamepad")) score += 2;
    if (userAgent.includes("Valve Steam Client")) score -= 2;
    if (htmlClasses.includes("touch")) score += 1;
    return score > 0;
  }

  function onGamepadConnected(event) {
    console.log("[Gamepad] Gamepad conectado en Millennium:", event.gamepad.id);
    state.gamepadConnected = true;
    state.gamepadIndex = event.gamepad.index;
    if (!state.animationFrameId) {
      pollGamepad();
    }
    // Don't scan immediately - only scan when an overlay is opened
    // scanFocusableElements() will be called by the overlay's setTimeout
  }

  function onGamepadDisconnected(event) {
    console.log("[Gamepad] Gamepad disconnected:", event.gamepad.id);
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
      console.log("[Gamepad] No LuaTools overlay active, skipping scan");
      state.focusableElements = [];
      state.currentFocusIndex = 0;
      return;
    }

    // Only scan elements INSIDE the active overlay
    const selectors = [
      "button:not([disabled])",
      "a[href]:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex="0"]',
      '[tabindex]:not([tabindex="-1"])',
      ".focusable:not([disabled])",
    ].join(", ");

    // Use querySelectorAll on the overlay, not the whole document
    const elements = Array.from(activeOverlay.querySelectorAll(selectors));
    state.focusableElements = elements.filter(function (el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    });

    console.log(
      "[Gamepad] Scanned " +
        state.focusableElements.length +
        " focusable elements inside overlay",
    );

    if (state.focusableElements.length > 0) {
      focusElement(0);
    }
  }

  function focusElement(index) {
    const prevElement = state.focusableElements[state.currentFocusIndex];
    if (prevElement) {
      prevElement.blur();
      prevElement.classList.remove("active-focus");
    }

    if (index < 0) index = 0;
    if (index >= state.focusableElements.length)
      index = state.focusableElements.length - 1;

    state.currentFocusIndex = index;

    const element = state.focusableElements[index];
    if (element) {
      element.focus();
      element.classList.add("active-focus");
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
      console.log("[Gamepad] Focused element " + index + ":", element);
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
      case "up":
        newIndex--;
        break;
      case "down":
        newIndex++;
        break;
      case "left":
        newIndex = findElementInDirection("left");
        break;
      case "right":
        newIndex = findElementInDirection("right");
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

      if (direction === "left") {
        isInDirection = rect.right <= currentRect.left;
        distance = currentRect.left - rect.right;
      } else if (direction === "right") {
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
          console.log("[Gamepad] A button: clicking element", element);
          element.click();
          setTimeout(scanFocusableElements, 100);
        }
        break;

      case CONFIG.buttonMap.B:
        // B button disabled - users should use modal buttons
        console.log("[Gamepad] B button pressed - ignoring");
        break;

      case CONFIG.buttonMap.DPAD_UP:
        navigate("up");
        break;

      case CONFIG.buttonMap.DPAD_DOWN:
        navigate("down");
        break;

      case CONFIG.buttonMap.DPAD_LEFT:
        navigate("left");
        break;

      case CONFIG.buttonMap.DPAD_RIGHT:
        navigate("right");
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
        navigate("up");
      } else if (y > threshold && state.lastAxisValues.y <= threshold) {
        navigate("down");
      } else if (x < -threshold && state.lastAxisValues.x >= -threshold) {
        navigate("left");
      } else if (x > threshold && state.lastAxisValues.x <= threshold) {
        navigate("right");
      }
    }

    state.lastAxisValues.x = x;
    state.lastAxisValues.y = y;

    state.animationFrameId = requestAnimationFrame(pollGamepad);
  }

  // Block Steam's gamepad navigation when overlay is active
  function blockSteamNavigation(event) {
    const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

    if (hasActiveOverlay && state.gamepadConnected) {
      // Block arrow keys, Enter, Escape, Backspace and other navigation keys
      // Note: Steam may translate gamepad B button to Escape or Backspace
      const navKeys = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        "Escape",
        "Backspace",
        " ",
        "Tab",
      ];
      if (navKeys.includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        console.log("[Gamepad] Blocked Steam navigation key:", event.key);
        return false;
      }
    }
  }

  // Block clicks on Steam UI when overlay is active
  function blockSteamClicks(event) {
    const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

    if (hasActiveOverlay && state.gamepadConnected) {
      // Only allow clicks inside the overlay
      const clickedInsideOverlay = event.target.closest(
        OVERLAY_SELECTOR_STRING,
      );

      if (!clickedInsideOverlay) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        console.log("[Gamepad] Blocked click outside overlay");
        return false;
      }
    }
  }

  // Block browser history navigation when overlay is active
  function blockHistoryNavigation(event) {
    const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);
    if (hasActiveOverlay && state.gamepadConnected) {
      console.log("[Gamepad] Blocked history navigation (popstate)");
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // Push the current state back to prevent navigation
      window.history.pushState(null, "", window.location.href);
      return false;
    }
  }

  function init() {
    if (!isBigPictureMode()) {
      console.log("[Gamepad] Not in Big Picture Mode, skipping initialization");
      return;
    }

    console.log("[Gamepad] Initializing Gamepad Navigation System...");

    window.addEventListener("gamepadconnected", onGamepadConnected);
    window.addEventListener("gamepaddisconnected", onGamepadDisconnected);

    // Block Steam's keyboard navigation when overlay is active
    document.addEventListener("keydown", blockSteamNavigation, true);
    document.addEventListener("keyup", blockSteamNavigation, true);

    // Block clicks outside overlay when gamepad is active
    document.addEventListener("click", blockSteamClicks, true);
    document.addEventListener("mousedown", blockSteamClicks, true);

    // Block browser history navigation (back button)
    window.addEventListener("popstate", blockHistoryNavigation, true);

    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        onGamepadConnected({
          gamepad: gamepads[i],
        });
        break;
      }
    }

    // Don't scan on init - only scan when overlays are opened

    console.log("[Gamepad] Initialization complete");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.GamepadNav = {
    scanElements: scanFocusableElements,
    isConnected: function () {
      return state.gamepadConnected;
    },
  };
})();

// ============================================
// LUATOOLS MAIN CODE
// ============================================
(function () {
  "use strict";

  // Guard against re-injection into a still-alive JS context. CefInjectorService (LuaLoader mode)
  // re-injects this whole script whenever window.__LuaToolsReady isn't true yet — which can happen
  // while THIS injection's own async setup is still in flight (see the retry loop in
  // addLuaToolsButton() and where __LuaToolsReady actually gets set, near the end of this IIFE). Without
  // this guard, a second injection into the same live realm would throw "Identifier already declared"
  // on every top-level const below. A real navigation creates a brand-new JS realm with no such flag,
  // so this only ever blocks *redundant* re-injection, never a genuinely fresh page load.
  if (window.__LuaToolsInjected) return;
  window.__LuaToolsInjected = true;

  // ── Embedded translations (all locales; lazy-parsed per active language) ──
  // Each value is the locale's "strings" map as a JSON string; only the active
  // language is JSON.parse'd (ltGetLocaleStrings). No backend/fetch needed.
  const LT_LOCALES = {
    "ar": "{\"Add via LuaTools\":\"إضافة اللعبة للمكتبة\",\"Advanced\":\"مزايا أخرى\",\"All-In-One Fixes\":\"إصلاحات شاملة (الكل في واحد)\",\"Apply\":\"تطبيق\",\"Applying {fix}\":\"جاري تطبيق {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"هل أنت متأكد من إزالة الإصلاح؟ سيؤدي هذا الخيار إلى إزالة ملفات الإصلاح كاملة وإستعادة ملفات اللعبة الأصلية!\",\"Are you sure?\":\"هل أنت متأكد؟\",\"Back\":\"العودة\",\"Base Game\":\"اللعبة الأساسية\",\"Cancel\":\"إلغاء\",\"Cancellation failed\":\"فشل الإلغاء\",\"Cancelled\":\"تم الإلغاء\",\"Cancelled by user\":\"تم الإلغاء بواسطتك\",\"Cancelled: {reason}\":\"تم الإلغاء بسبب: {reason}\",\"Cancelling...\":\"جاري الإلغاء...\",\"Check for updates\":\"التحقق من التحديثات\",\"Checking availability…\":\"جاري التحقق من التوفر…\",\"Checking content…\":\"جاري فحص المحتوى…\",\"Checking generic fix...\":\"جاري التحقق من الإصلاح العام ...\",\"Checking key...\":\"جارٍ التحقق من المفتاح...\",\"Checking online-fix...\":\"جاري التحقق من إصلاح الأونلاين...\",\"Checking…\":\"جاري التحقق…\",\"Close\":\"إغلاق\",\"Confirm\":\"تأكيد\",\"Content details =>\":\"تفاصيل المحتوى =>\",\"DLC Detected\":\"تم اكتشاف محتوى إضافي\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"تتم إضافة المحتويات الإضافية مع اللعبة الأساسية. لإضافة إصلاحات لهذا المحتوى الإضافي، يرجى الانتقال إلى صفحة اللعبة الأساسية: <br><br><b>{gameName}</b>\",\"Discord\":\"الديسكورد\",\"Dismiss\":\"رفض\",\"Dlc: \":\"محتوى إضافي: \",\"Downloading...\":\"جاري التنزيل...\",\"Downloading: {percent}%\":\"جاري التنزيل: {percent}%\",\"Downloading…\":\"جاري التنزيل…\",\"Error applying fix\":\"خطأ في تطبيق الإصلاح\",\"Error checking for fixes\":\"تعذر التحقق من الإصلاحات\",\"Error starting Online Fix\":\"خطأ في تشغيل إصلاح الأونلاين\",\"Error starting un-fix\":\"تعذر في بدء إزالة الإصلاح\",\"Error! Code: {code}\":\"خطأ! في الرمز: {code}\",\"Error, Code: {code}\":\"خطأ، الرمز: {code}\",\"Error, Timed Out\":\"خطأ، انتهى الوقت\",\"Error: {error}\":\"خطأ: {error}\",\"Expires\":\"ينتهي\",\"Extracting to game folder...\":\"جاري الأستخراج إلى ملف اللعبة...\",\"Failed\":\"فشل\",\"Failed to cancel fix download\":\"فشل إلغاء تنزيل الإصلاح\",\"Failed to check for fixes.\":\"فشل التحقق من الإصلاحات!\",\"Failed to load free APIs.\":\"فشل تحيث الواجهة.\",\"Failed to start fix download\":\"فشل بدء تنزيل الإصلاح\",\"Failed to start un-fix\":\"فشل في بدء إزالة الإصلاح\",\"Failed to verify key\":\"فشل التحقق من المفتاح\",\"Failed: {error}\":\"فشل بسبب: {error}\",\"Fetch Free API's\":\"تحديث الداتا\",\"Fetching game name...\":\"جاري معرفة اسم اللعبة...\",\"Finishing…\":\"جاري الإنهاء…\",\"Fixes Menu\":\"قائمة الإصلاحات\",\"Found\":\"تم العثور\",\"Game Added!\":\"تمت إضافة اللعبة!\",\"Game added!\":\"تم إضافة اللعبة، فضلًا أعد تشغيل ستيم!\",\"Game folder\":\"ملف اللعبة\",\"Game install path not found\":\"لم يتم العثور على مسار تثبيت اللعبة\",\"Game not found on any available API.\":\"لم يتم العثور على اللعبة في أي من المصادر المتاحة.\",\"Generic Fix\":\"إصلاح عام\",\"Generic fix found!\":\"تم العثور على إصلاح عام!\",\"Go to Base Game\":\"الانتقال إلى اللعبة الأساسية\",\"Hide\":\"إخفاء\",\"Included\":\"مُضمّن\",\"Initializing download...\":\"جاري بدء التحميل...\",\"Installing…\":\"جاري التثبيت…\",\"Invalid Morrenus API Key format\":\"تنسيق مفتاح Morrenus API غير صالح\",\"Invalid key format\":\"تنسيق المفتاح غير صالح\",\"Invalid or rejected key\":\"مفتاح غير صالح أو مرفوض\",\"Join the Discord!\":\"انضم إلى مجتمع الديسكورد!\",\"Left click to install, Right click for SteamDB\":\"الزر الأيسر بالماوس للتحميل، الزر الأيمن بالماوس يعرض التفاصيل على SteamDB\",\"Loaded free APIs: {count}\":\"تم تحديث الواجهة:  {count}\",\"Loading APIs...\":\"جاري تحميل الواجهات...\",\"Loading fixes...\":\"جاري تحميل الإصلاحات...\",\"Look for Fixes\":\"البحث عن الإصلاحات\",\"LuaTools backend unavailable\":\"الواجهة غير متوفرة\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · قائمة إصلاحات AIO\",\"LuaTools · Added Games\":\"LuaTools · الألعاب المضافة\",\"LuaTools · Fixes Menu\":\"LuaTools · قائمة الإصلاحات\",\"LuaTools · Menu\":\"LuaTools · القائمة\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"إدارة اللعبة\",\"Missing\":\"مفقود\",\"No games found.\":\"لم يتم العثور على ألعاب!\",\"No generic fix\":\"لا يوجد إصلاح عام!\",\"No online-fix\":\"لا يوجد إصلاح للأونلاين!\",\"No updates available.\":\"لا توجد تحديثات متاحة!\",\"No workshop for the game\":\"لا يوجد ورشة عمل للعبة\",\"Not found\":\"غير موجود\",\"Online Fix\":\"إصلاح الأونلاين\",\"Online Fix (Unsteam)\":\"إصلاح الأونلاين من خارج ستيم\",\"Online-fix found!\":\"تم العثور على إصلاح الأونلاين!\",\"Only possible thanks to {name} 💜\":\"شكر خاص لـ {name} 💜\",\"Proceed\":\"متابعة\",\"Processing package…\":\"جاري معالجة الحزمة…\",\"Remove via LuaTools\":\"إزالة من المكتبة\",\"Removed {count} files. Running Steam verification...\":\"تمت إزالة {count} الملفات. جاري إعادة التحقق من ملفات اللعبة...\",\"Removing fix files...\":\"جاري إزالة ملفات الإصلاح...\",\"Restart Steam\":\"ريستارت ستيم\",\"Restart Steam now?\":\"إعادة تشغيل ستيم الآن؟\",\"Searching across sources...\":\"جاري البحث في المصادر...\",\"Select Download Source\":\"اختر مصدر التحميل\",\"Settings\":\"الإعدادات\",\"Skipped\":\"تم التخطي\",\"The game has been added successfully.\":\"تمت إضافة اللعبة بنجاح.\",\"This game may not work, support for it wont be given in our discord\":\"قد لا تعمل هذه اللعبة، ولن يتم تقديم الدعم لها في الديسكورد الخاص بنا\",\"Un-Fix (verify game)\":\"إزالة الإصلاح (التحقق من اللعبة)\",\"Un-Fixing game\":\"جاري إزالة إصلاح اللعبة\",\"Unknown Game\":\"لعبة غير معروفة\",\"Unknown error\":\"خطأ غير معروف\",\"Usage\":\"الاستخدام\",\"Verifying API limits...\":\"جارٍ التحقق من حدود API...\",\"Waiting…\":\"في الانتظار…\",\"Working…\":\"جاري العمل…\",\"Workshop: \":\"ورشة العمل: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"لقد تجاوزت حد التنزيل اليومي. يرجى الانتظار حتى الغد لمزيد من الاستخدامات، أو ترقية خطتك من موقع Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"مفتاح Morrenus API الخاص بك غير صالح أو منتهي الصلاحية. يرجى التحقق من مفتاحك في الإعدادات أو إعادة إنشائه من موقع Morrenus.\",\"bigpicture.mouseTip\":\"لاستخدام وضع الماوس في Steam: زر Guide + الجويستيك الأيمن، انقر RB\",\"common.alert.ok\":\"موافق\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"نوع الخيار غير مدعوم: {type}\",\"common.status.error\":\"خطأ\",\"common.status.loading\":\"جاري التحميل...\",\"common.status.success\":\"نجح\",\"common.translationMissing\":\"الترجمة مفقودة\",\"common.warning\":\"تحذير\",\"days left\":\"أيام متبقية\",\"disclaimer.inputLabel\":\"اكتب \\\"أنا أفهم\\\" في المربع أدناه للمتابعة\",\"disclaimer.inputPlaceholder\":\"أنا أفهم\",\"disclaimer.line1\":\"LuaTools ليس له أي علاقة بـ Millennium\",\"disclaimer.line2\":\"لن يقدم لك Millennium أي دعم لهذا الإضافة على سيرفر الديسكورد الخاص بهم\",\"disclaimer.line3\":\"سيتم حظرك من سيرفرات LuaTools و Millennium إذا ذهبت إلى الديسكورد الخاص بهم لطلب المساعدة\",\"disclaimer.title\":\"إشعار مهم\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"إصلاح متاح\",\"gameStatus.playable\":\"قابل للعب\",\"gameStatus.unplayable\":\"غير قابل للعب\",\"menu.advancedLabel\":\"التحديثات\",\"menu.checkForUpdates\":\"التحقق من التحديثات\",\"menu.discord\":\"ديسكورد\",\"menu.error.getPath\":\"خطأ في الحصول على مسار اللعبة\",\"menu.error.noAppId\":\"لا يوجد معرف للعبة حتى الآن\",\"menu.error.noInstall\":\"اللعبة غير مثبتة\",\"menu.error.notInstalled\":\"اللعبة غير مثبتة! أضف وقم بتثبيتها أولاً :D\",\"menu.fetchFreeApis\":\"تحديث الواجهة\",\"menu.fixesMenu\":\"إصلاح الأونلاين\",\"menu.joinDiscordLabel\":\"انضم إلى مجتمع الديسكورد!\",\"menu.manageGameLabel\":\"إدارة اللعبة\",\"menu.remove.confirm\":\"هل أنت متأكد من حذف اللعبة من المكتبة؟\",\"menu.remove.failure\":\"فشل إزالة اللعبة من المكتبة\",\"menu.remove.success\":\"تم حذف اللعبة من المكتبة بنجاح!\",\"menu.removeLuaTools\":\"إزالة من المكتبة\",\"menu.settings\":\"الإعدادات\",\"menu.title\":\"LuaTools · القائمة\",\"settings.close\":\"إغلاق\",\"settings.donateKeys.description\":\"التبرع بمافتيح فك حماية الألعاب!\",\"settings.donateKeys.label\":\"تبرع بالمفاتيح\",\"settings.donateKeys.no\":\"لا\",\"settings.donateKeys.yes\":\"نعم\",\"settings.empty\":\"لا توجد إعدادات متاحة!\",\"settings.error\":\"فشل تحميل الإعدادات!\",\"settings.fastDownload.description\":\"اختر أول مصدر متاح تلقائيًا عند إضافة لعبة.\",\"settings.fastDownload.label\":\"تنزيل سريع\",\"settings.general\":\"عام\",\"settings.generalDescription\":\"وصف الإعدادات العامة\",\"settings.installedFixes.date\":\"تاريخ التثبيت:\",\"settings.installedFixes.delete\":\"حذف\",\"settings.installedFixes.deleteConfirm\":\"هل أنت متأكد من أنك تريد إزالة هذا الإصلاح؟ سيتم حذف ملفات الإصلاح وتشغيل التحقق من Steam.\",\"settings.installedFixes.deleteError\":\"فشل إزالة الإصلاح.\",\"settings.installedFixes.deleteSuccess\":\"تم إزالة الإصلاح بنجاح!\",\"settings.installedFixes.deleting\":\"جارٍ إزالة الإصلاح...\",\"settings.installedFixes.empty\":\"لا توجد إصلاحات مثبتة بعد.\",\"settings.installedFixes.error\":\"فشل تحميل الإصلاحات المثبتة.\",\"settings.installedFixes.files\":\"{count} ملف\",\"settings.installedFixes.loading\":\"جارٍ البحث عن الإصلاحات المثبتة...\",\"settings.installedFixes.title\":\"الإصلاحات المثبتة\",\"settings.installedFixes.type\":\"النوع:\",\"settings.installedLua.delete\":\"إزالة\",\"settings.installedLua.deleteConfirm\":\"إزالة عبر LuaTools لهذه اللعبة؟\",\"settings.installedLua.deleteError\":\"فشلت الإزالة عبر LuaTools.\",\"settings.installedLua.deleteSuccess\":\"تمت الإزالة عبر LuaTools بنجاح!\",\"settings.installedLua.deleting\":\"جارٍ الإزالة عبر LuaTools...\",\"settings.installedLua.disabled\":\"معطل\",\"settings.installedLua.empty\":\"لا توجد سكريبتات Lua مثبتة بعد.\",\"settings.installedLua.error\":\"فشل تحميل سكريبتات Lua المثبتة.\",\"settings.installedLua.loading\":\"جارٍ البحث عن سكريبتات Lua المثبتة...\",\"settings.installedLua.modified\":\"تاريخ التعديل:\",\"settings.installedLua.title\":\"الألعاب عبر LuaTools\",\"settings.installedLua.unknownInfo\":\"الألعاب التي تظهر 'لعبة غير معروفة' تم تثبيتها من مصادر خارجية (وليس عبر LuaTools).\",\"settings.language.description\":\"إختر لغة العرض\",\"settings.language.label\":\"اللغة\",\"settings.language.option.en\":\"الإنجليزية - English\",\"settings.language.option.pt-BR\":\"البرتغالية - Portuguese\",\"settings.loading\":\"جاري التحميل...\",\"settings.noChanges\":\"لا توجد تغييرات للحفظ!\",\"settings.refresh\":\"تحديث\",\"settings.refreshing\":\"جاري التحديث...\",\"settings.save\":\"حفظ الإعدادات\",\"settings.saveError\":\"فشل حفظ الإعدادات.\",\"settings.saveSuccess\":\"تم حفظ الإعدادات بنجاح!\",\"settings.saving\":\"جاري الحفظ...\",\"settings.search.clear\":\"مسح البحث\",\"settings.search.noResults\":\"لم يتم العثور على نتائج\",\"settings.search.placeholder\":\"بحث في الإعدادات، الألعاب، الإصلاحات...\",\"settings.theme.description\":\"اختر سمة الألوان لواجهة LuaTools.\",\"settings.theme.label\":\"السمة\",\"settings.title\":\"LuaTools · الإعدادات\",\"settings.unsaved\":\"لم يتم الحفظ !\",\"settings.useSteamLanguage.description\":\"استخدم لغة عميل Steam بدلاً من إعداد LuaTools.\",\"settings.useSteamLanguage.label\":\"استخدام لغة Steam\",\"settings.useSteamLanguage.no\":\"لا\",\"settings.useSteamLanguage.yes\":\"نعم\",\"{fix} applied successfully!\":\"تم تطبيق {fix} بنجاح!\",\"settings.morrenusApiKey.label\":\"مفتاح API مورينوس\",\"settings.morrenusApiKey.description\":\"مفتاح API مطلوب لاستخدام مصدر سادي. احصل عليه من {link}\",\"settings.morrenusApiKey.placeholder\":\"أدخل مفتاح API الخاص بك\"}",
    "bg": "{\"Add via LuaTools\":\"Добави чрез LuaTools\",\"Advanced\":\"Разширени\",\"All-In-One Fixes\":\"Всичко-в-едно поправки\",\"Apply\":\"Приложи\",\"Applying {fix}\":\"Прилагане на {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Сигурни ли сте, че искате да премахнете поправката? Това ще изтрие файловете на поправката и ще провери файловете на играта.\",\"Are you sure?\":\"Сигурни ли сте?\",\"Back\":\"Назад\",\"Base Game\":\"Основна игра\",\"Cancel\":\"Отказ\",\"Cancellation failed\":\"Отмяната не успя\",\"Cancelled\":\"Отменено\",\"Cancelled by user\":\"Отменено от потребителя\",\"Cancelled: {reason}\":\"Отменено: {reason}\",\"Cancelling...\":\"Отменяне...\",\"Check for updates\":\"Провери за обновления\",\"Checking availability…\":\"Проверка на наличността…\",\"Checking content…\":\"Проверка на съдържанието…\",\"Checking generic fix...\":\"Проверка за обща поправка...\",\"Checking key...\":\"Проверка на ключа...\",\"Checking online-fix...\":\"Проверка за онлайн поправка...\",\"Checking…\":\"Проверка…\",\"Close\":\"Затвори\",\"Confirm\":\"Потвърди\",\"Content details =>\":\"Детайли за съдържанието =>\",\"DLC Detected\":\"Открит DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC-тата се добавят заедно с основната игра. За да добавите поправки за този DLC, моля отидете на страницата на основната игра: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Отхвърли\",\"Dlc: \":\"Допълнение: \",\"Downloading...\":\"Изтегляне...\",\"Downloading: {percent}%\":\"Изтегляне: {percent}%\",\"Downloading…\":\"Изтегляне…\",\"Error applying fix\":\"Грешка при прилагане на поправката\",\"Error checking for fixes\":\"Грешка при проверка за поправки\",\"Error starting Online Fix\":\"Грешка при стартиране на онлайн поправката\",\"Error starting un-fix\":\"Грешка при стартиране на премахването на поправката\",\"Error! Code: {code}\":\"Грешка! Код: {code}\",\"Error, Code: {code}\":\"Грешка, Код: {code}\",\"Error, Timed Out\":\"Грешка, времето изтече\",\"Error: {error}\":\"Грешка: {error}\",\"Expires\":\"Изтича\",\"Extracting to game folder...\":\"Разархивиране в папката на играта...\",\"Failed\":\"Неуспешно\",\"Failed to cancel fix download\":\"Неуспешна отмяна на изтеглянето на поправката\",\"Failed to check for fixes.\":\"Неуспешна проверка за поправки.\",\"Failed to load free APIs.\":\"Неуспешно зареждане на безплатни API-та.\",\"Failed to start fix download\":\"Неуспешно стартиране на изтеглянето на поправката\",\"Failed to start un-fix\":\"Неуспешно стартиране на премахването на поправката\",\"Failed to verify key\":\"Неуспешна проверка на ключа\",\"Failed: {error}\":\"Неуспешно: {error}\",\"Fetch Free API's\":\"Зареди безплатни API-та\",\"Fetching game name...\":\"Зареждане на името на играта...\",\"Finishing…\":\"Завършване…\",\"Fixes Menu\":\"Меню с поправки\",\"Found\":\"Намерено\",\"Game Added!\":\"Играта е добавена!\",\"Game added!\":\"Играта е добавена!\",\"Game folder\":\"Папка на играта\",\"Game install path not found\":\"Пътят за инсталация на играта не е намерен\",\"Game not found on any available API.\":\"Играта не е намерена в нито един наличен API.\",\"Generic Fix\":\"Обща поправка\",\"Generic fix found!\":\"Намерена е обща поправка!\",\"Go to Base Game\":\"Към основната игра\",\"Hide\":\"Скрий\",\"Included\":\"Включено\",\"Initializing download...\":\"Инициализиране на изтеглянето...\",\"Installing…\":\"Инсталиране…\",\"Invalid Morrenus API Key format\":\"Невалиден формат на Morrenus API ключ\",\"Invalid key format\":\"Невалиден формат на ключа\",\"Invalid or rejected key\":\"Невалиден или отхвърлен ключ\",\"Join the Discord!\":\"Присъединете се в Discord!\",\"Left click to install, Right click for SteamDB\":\"Ляв клик за инсталиране, десен клик за SteamDB\",\"Loaded free APIs: {count}\":\"Заредени безплатни API-та: {count}\",\"Loading APIs...\":\"Зареждане на API-та...\",\"Loading fixes...\":\"Зареждане на поправки...\",\"Look for Fixes\":\"Търси поправки\",\"LuaTools backend unavailable\":\"Бекендът на LuaTools не е наличен\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Добавени игри\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Управление на играта\",\"Missing\":\"Липсва\",\"No games found.\":\"Няма намерени игри.\",\"No generic fix\":\"Няма обща поправка\",\"No online-fix\":\"Няма онлайн поправка\",\"No updates available.\":\"Няма налични обновления.\",\"No workshop for the game\":\"Няма уъркшоп за играта\",\"Not found\":\"Не е намерено\",\"Online Fix\":\"Онлайн поправка\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Намерена е онлайн поправка!\",\"Only possible thanks to {name} 💜\":\"Възможно само благодарение на {name} 💜\",\"Proceed\":\"Продължи\",\"Processing package…\":\"Обработка на пакета…\",\"Remove via LuaTools\":\"Премахни чрез LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Премахнати {count} файла. Стартиране на Steam проверка...\",\"Removing fix files...\":\"Премахване на файловете на поправката...\",\"Restart Steam\":\"Рестартирай Steam\",\"Restart Steam now?\":\"Рестартиране на Steam сега?\",\"Searching across sources...\":\"Търсене в източниците...\",\"Select Download Source\":\"Изберете източник за изтегляне\",\"Settings\":\"Настройки\",\"Skipped\":\"Пропуснато\",\"The game has been added successfully.\":\"Играта беше добавена успешно.\",\"This game may not work, support for it wont be given in our discord\":\"Тази игра може да не работи, поддръжка за нея няма да бъде предоставяна в нашия дискорд\",\"Un-Fix (verify game)\":\"Премахни поправка (провери играта)\",\"Un-Fixing game\":\"Премахване на поправката\",\"Unknown Game\":\"Непозната игра\",\"Unknown error\":\"Непозната грешка\",\"Usage\":\"Използване\",\"Verifying API limits...\":\"Проверка на API лимитите...\",\"Waiting…\":\"Изчакване…\",\"Working…\":\"Работи се…\",\"Workshop: \":\"Уъркшоп: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Превишихте дневния си лимит за изтегляне. Моля, изчакайте до утре или надградете плана си от сайта на Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Вашият Morrenus API ключ е невалиден или изтекъл. Моля, проверете ключа си в настройките или го генерирайте отново от сайта на Morrenus.\",\"bigpicture.mouseTip\":\"Ляв клик за инсталиране, десен клик за SteamDB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Неподдържана опция\",\"common.status.error\":\"Грешка\",\"common.status.loading\":\"Зареждане\",\"common.status.success\":\"Успешно\",\"common.translationMissing\":\"липсващ превод\",\"common.warning\":\"Предупреждение\",\"days left\":\"дни остават\",\"disclaimer.inputLabel\":\"Напишете \\\"Разбирам\\\" в полето по-долу, за да продължите\",\"disclaimer.inputPlaceholder\":\"Разбирам\",\"disclaimer.line1\":\"Този инструмент е предоставен такъв, какъвто е, без никакви гаранции.\",\"disclaimer.line2\":\"Използвайте го на свой собствен риск. Не носим отговорност за каквито и да е щети.\",\"disclaimer.line3\":\"С продължаването си вие приемате тези условия.\",\"disclaimer.title\":\"Отказ от отговорност\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Нуждае се от поправки\",\"gameStatus.playable\":\"Играема\",\"gameStatus.unplayable\":\"Неиграема\",\"menu.advancedLabel\":\"Разширени\",\"menu.checkForUpdates\":\"Провери за обновления\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Неуспешно получаване на пътя на играта\",\"menu.error.noAppId\":\"Не е намерен App ID\",\"menu.error.noInstall\":\"Пътят за инсталация не е намерен\",\"menu.error.notInstalled\":\"Играта не е инсталирана\",\"menu.fetchFreeApis\":\"Зареди безплатни API-та\",\"menu.fixesMenu\":\"Меню с поправки\",\"menu.joinDiscordLabel\":\"Присъединете се в Discord\",\"menu.manageGameLabel\":\"Управление на играта\",\"menu.remove.confirm\":\"Сигурни ли сте, че искате да премахнете тази игра от LuaTools?\",\"menu.remove.failure\":\"Неуспешно премахване на играта\",\"menu.remove.success\":\"Играта е премахната успешно\",\"menu.removeLuaTools\":\"Премахни чрез LuaTools\",\"menu.settings\":\"Настройки\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Затвори\",\"settings.donateKeys.description\":\"Споделяйте неизползвани ключове за игри, за да помогнете на общността\",\"settings.donateKeys.label\":\"Даряване на ключове\",\"settings.donateKeys.no\":\"Не\",\"settings.donateKeys.yes\":\"Да\",\"settings.empty\":\"Няма налични настройки\",\"settings.error\":\"Грешка при зареждане на настройките\",\"settings.fastDownload.description\":\"Автоматично избиране на първия наличен източник при добавяне на игра.\",\"settings.fastDownload.label\":\"Бързо изтегляне\",\"settings.general\":\"Общи\",\"settings.generalDescription\":\"Общи настройки на LuaTools\",\"settings.installedFixes.date\":\"Дата\",\"settings.installedFixes.delete\":\"Изтрий\",\"settings.installedFixes.deleteConfirm\":\"Сигурни ли сте, че искате да изтриете тази поправка?\",\"settings.installedFixes.deleteError\":\"Грешка при изтриване на поправката\",\"settings.installedFixes.deleteSuccess\":\"Поправката е изтрита успешно\",\"settings.installedFixes.deleting\":\"Изтриване…\",\"settings.installedFixes.empty\":\"Няма инсталирани поправки\",\"settings.installedFixes.error\":\"Грешка при зареждане на инсталираните поправки\",\"settings.installedFixes.files\":\"Файлове\",\"settings.installedFixes.loading\":\"Зареждане на инсталирани поправки…\",\"settings.installedFixes.title\":\"Инсталирани поправки\",\"settings.installedFixes.type\":\"Тип\",\"settings.installedLua.delete\":\"Изтрий\",\"settings.installedLua.deleteConfirm\":\"Сигурни ли сте, че искате да изтриете този Lua скрипт?\",\"settings.installedLua.deleteError\":\"Грешка при изтриване на Lua скрипта\",\"settings.installedLua.deleteSuccess\":\"Lua скриптът е изтрит успешно\",\"settings.installedLua.deleting\":\"Изтриване…\",\"settings.installedLua.disabled\":\"Деактивиран\",\"settings.installedLua.empty\":\"Няма инсталирани Lua скриптове\",\"settings.installedLua.error\":\"Грешка при зареждане на Lua скриптовете\",\"settings.installedLua.loading\":\"Зареждане на Lua скриптове…\",\"settings.installedLua.modified\":\"Променен\",\"settings.installedLua.title\":\"Инсталирани Lua скриптове\",\"settings.installedLua.unknownInfo\":\"Няма налична информация\",\"settings.language.description\":\"Изберете езика на интерфейса на LuaTools\",\"settings.language.label\":\"Език\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Зареждане…\",\"settings.noChanges\":\"Няма промени за запазване\",\"settings.refresh\":\"Обнови\",\"settings.refreshing\":\"Обновяване…\",\"settings.save\":\"Запази\",\"settings.saveError\":\"Грешка при запазване на настройките\",\"settings.saveSuccess\":\"Настройките са запазени успешно\",\"settings.saving\":\"Запазване…\",\"settings.search.clear\":\"Изчисти\",\"settings.search.noResults\":\"Няма намерени резултати\",\"settings.search.placeholder\":\"Търсене в настройките…\",\"settings.theme.description\":\"Изберете темата на интерфейса на LuaTools\",\"settings.theme.label\":\"Тема\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Имате незапазени промени\",\"settings.useSteamLanguage.description\":\"Автоматично използване на езика, зададен в Steam\",\"settings.useSteamLanguage.label\":\"Използвай езика на Steam\",\"settings.useSteamLanguage.no\":\"Не\",\"settings.useSteamLanguage.yes\":\"Да\",\"{fix} applied successfully!\":\"{fix} е приложена успешно!\",\"settings.morrenusApiKey.label\":\"Ключ на Morrenus API\",\"settings.morrenusApiKey.description\":\"API ключът е необходим за използване на Sadie Source. Вземете от {link}\",\"settings.morrenusApiKey.placeholder\":\"Въведете вашия API ключ\"}",
    "cs": "{\"Add via LuaTools\":\"Přidat přes LuaTools\",\"Advanced\":\"Pokročilé\",\"All-In-One Fixes\":\"All-In-One opravy\",\"Apply\":\"Použít\",\"Applying {fix}\":\"Používám {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Opravdu chcete odstranit opravu? Tímto odstraníte soubory opravy a ověříte herní soubory.\",\"Are you sure?\":\"Jste si jistý?\",\"Back\":\"Zpět\",\"Base Game\":\"Základní hra\",\"Cancel\":\"Zrušit\",\"Cancellation failed\":\"Zrušení se nezdařilo\",\"Cancelled\":\"Zrušeno\",\"Cancelled by user\":\"Zrušeno uživatelem\",\"Cancelled: {reason}\":\"Zrušeno: {reason}\",\"Cancelling...\":\"Probíhá rušení...\",\"Check for updates\":\"Zkontrolovat aktualizace\",\"Checking availability…\":\"Kontroluji dostupnost…\",\"Checking content…\":\"Kontrola obsahu…\",\"Checking generic fix...\":\"Kontroluji obecnou opravu...\",\"Checking key...\":\"Ověřování klíče...\",\"Checking online-fix...\":\"Kontroluji online opravu...\",\"Checking…\":\"Kontroluji…\",\"Close\":\"Zavřít\",\"Confirm\":\"Potvrdit\",\"Content details =>\":\"Podrobnosti obsahu =>\",\"DLC Detected\":\"DLC Detekováno\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC jsou přidávána spolu se základní hrou. Pro přidání oprav k tomuto DLC přejděte na stránku základní hry: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Zavřít\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Stahuji...\",\"Downloading: {percent}%\":\"Stahuji: {percent}%\",\"Downloading…\":\"Stahuji…\",\"Error applying fix\":\"Chyba při použití opravy\",\"Error checking for fixes\":\"Chyba při kontrole oprav\",\"Error starting Online Fix\":\"Chyba při spouštění Online opravy\",\"Error starting un-fix\":\"Chyba při odebírání opravy\",\"Error! Code: {code}\":\"Chyba! Kód: {code}\",\"Error, Code: {code}\":\"Chyba, Kód: {code}\",\"Error, Timed Out\":\"Chyba, Vypršel časový limit\",\"Error: {error}\":\"Chyba: {error}\",\"Expires\":\"Vyprší\",\"Extracting to game folder...\":\"Extrahuji do složky hry...\",\"Failed\":\"Nezdařilo se\",\"Failed to cancel fix download\":\"Nepodařilo se zrušit stahování opravy\",\"Failed to check for fixes.\":\"Nepodařilo se zkontrolovat opravy.\",\"Failed to load free APIs.\":\"Nepodařilo se načíst volná API.\",\"Failed to start fix download\":\"Nepodařilo se spustit stahování opravy\",\"Failed to start un-fix\":\"Nepodařilo se spustit odebrání opravy\",\"Failed to verify key\":\"Ověření klíče selhalo\",\"Failed: {error}\":\"Nezdařilo se: {error}\",\"Fetch Free API's\":\"Načíst volná API\",\"Fetching game name...\":\"Načítám název hry...\",\"Finishing…\":\"Dokončuji…\",\"Fixes Menu\":\"Menu oprav\",\"Found\":\"Nalezeno\",\"Game Added!\":\"Hra přidána!\",\"Game added!\":\"Hra přidána!\",\"Game folder\":\"Složka hry\",\"Game install path not found\":\"Cesta instalace hry nenalezena\",\"Game not found on any available API.\":\"Hra nebyla nalezena v žádném dostupném API.\",\"Generic Fix\":\"Obecná oprava\",\"Generic fix found!\":\"Nalezena obecná oprava!\",\"Go to Base Game\":\"Přejít na základní hru\",\"Hide\":\"Skrýt\",\"Included\":\"Zahrnuto\",\"Initializing download...\":\"Inicializace stahování...\",\"Installing…\":\"Instaluji…\",\"Invalid Morrenus API Key format\":\"Neplatný formát Morrenus API klíče\",\"Invalid key format\":\"Neplatný formát klíče\",\"Invalid or rejected key\":\"Neplatný nebo odmítnutý klíč\",\"Join the Discord!\":\"Připojte se na Discord!\",\"Left click to install, Right click for SteamDB\":\"Levým tlačítkem instalovat, pravým otevřít SteamDB\",\"Loaded free APIs: {count}\":\"Načteno volných API: {count}\",\"Loading APIs...\":\"Načítání API...\",\"Loading fixes...\":\"Načítám opravy...\",\"Look for Fixes\":\"Hledat opravy\",\"LuaTools backend unavailable\":\"Backend LuaTools nedostupný\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Menu oprav\",\"LuaTools · Added Games\":\"LuaTools · Přidané hry\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu oprav\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Spravovat hru\",\"Missing\":\"Chybí\",\"No games found.\":\"Nenalezeny žádné hry.\",\"No generic fix\":\"Žádná obecná oprava\",\"No online-fix\":\"Žádná online oprava\",\"No updates available.\":\"Žádné aktualizace nejsou dostupné.\",\"No workshop for the game\":\"Žádný workshop pro tuto hru\",\"Not found\":\"Nenalezeno\",\"Online Fix\":\"Online oprava\",\"Online Fix (Unsteam)\":\"Online oprava (Unsteam)\",\"Online-fix found!\":\"Online oprava nalezena!\",\"Only possible thanks to {name} 💜\":\"Možné pouze díky {name} 💜\",\"Proceed\":\"Pokračovat\",\"Processing package…\":\"Zpracovávám balíček…\",\"Remove via LuaTools\":\"Odstranit přes LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Odstraněno {count} souborů. Probíhá ověření Steamem...\",\"Removing fix files...\":\"Odstraňuji soubory opravy...\",\"Restart Steam\":\"Restartovat Steam\",\"Restart Steam now?\":\"Restartovat Steam nyní?\",\"Searching across sources...\":\"Hledání ve zdrojích...\",\"Select Download Source\":\"Vybrat zdroj stahování\",\"Settings\":\"Nastavení\",\"Skipped\":\"Přeskočeno\",\"The game has been added successfully.\":\"Hra byla úspěšně přidána.\",\"This game may not work, support for it wont be given in our discord\":\"Tato hra nemusí fungovat, podpora pro ni nebude poskytnuta na našem discordu\",\"Un-Fix (verify game)\":\"Odebrat opravu (ověřit hru)\",\"Un-Fixing game\":\"Odebírám opravu hry\",\"Unknown Game\":\"Neznámá hra\",\"Unknown error\":\"Neznámá chyba\",\"Usage\":\"Využití\",\"Verifying API limits...\":\"Ověřování API limitů...\",\"Waiting…\":\"Čekání…\",\"Working…\":\"Pracuji…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Překročili jste denní limit stahování. Počkejte do zítřka nebo upgradujte svůj plán na webu Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Váš Morrenus API klíč je neplatný nebo vypršel. Zkontrolujte klíč v nastavení nebo ho vygenerujte znovu na webu Morrenus.\",\"bigpicture.mouseTip\":\"Pro použití režimu myši ve Steam: Tlačítko Guide + Pravý joystick, kliknutí RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Nepodporovaný typ možnosti: {type}\",\"common.status.error\":\"Chyba\",\"common.status.loading\":\"Načítání...\",\"common.status.success\":\"Hotovo\",\"common.translationMissing\":\"překlad chybí\",\"common.warning\":\"Varování\",\"days left\":\"dní zbývá\",\"disclaimer.inputLabel\":\"Napište \\\"Chápu\\\" do pole níže pro pokračování\",\"disclaimer.inputPlaceholder\":\"Chápu\",\"disclaimer.line1\":\"LuaTools není žádným způsobem spojen s Millennium\",\"disclaimer.line2\":\"Millennium vám NEPOSKYTNE podporu pro tento plugin na jejich discord serveru\",\"disclaimer.line3\":\"Budete ZABANOVÁNI z obou serverů LuaTools a Millennium, pokud tam budete žádat o pomoc\",\"disclaimer.title\":\"Důležité upozornění\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Oprava dostupná\",\"gameStatus.playable\":\"Hratelné\",\"gameStatus.unplayable\":\"Nehratelné\",\"menu.advancedLabel\":\"Pokročilé\",\"menu.checkForUpdates\":\"Zkontrolovat aktualizace\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Chyba při získávání cesty hry\",\"menu.error.noAppId\":\"Nelze zjistit AppID hry\",\"menu.error.noInstall\":\"Nelze najít instalaci hry\",\"menu.error.notInstalled\":\"Hra není nainstalována! Nejprve ji přidejte a nainstalujte :D\",\"menu.fetchFreeApis\":\"Načíst volná API\",\"menu.fixesMenu\":\"Menu oprav\",\"menu.joinDiscordLabel\":\"Připojte se na Discord!\",\"menu.manageGameLabel\":\"Spravovat hru\",\"menu.remove.confirm\":\"Odstranit LuaTools pro tuto hru?\",\"menu.remove.failure\":\"Nepodařilo se odstranit LuaTools.\",\"menu.remove.success\":\"LuaTools byl u této aplikace odstraněn.\",\"menu.removeLuaTools\":\"Odstranit přes LuaTools\",\"menu.settings\":\"Nastavení\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Zavřít\",\"settings.donateKeys.description\":\"Darujte dešifrovací klíče pro hry, pomůže to všem!\",\"settings.donateKeys.label\":\"Darovat klíče\",\"settings.donateKeys.no\":\"Ne\",\"settings.donateKeys.yes\":\"Ano\",\"settings.empty\":\"Žádná nastavení nejsou k dispozici.\",\"settings.error\":\"Nepodařilo se načíst nastavení.\",\"settings.fastDownload.description\":\"Při přidávání hry automaticky vybrat první dostupný zdroj.\",\"settings.fastDownload.label\":\"Rychlé stahování\",\"settings.general\":\"Obecné\",\"settings.generalDescription\":\"Globální předvolby LuaTools.\",\"settings.installedFixes.date\":\"Nainstalováno:\",\"settings.installedFixes.delete\":\"Smazat\",\"settings.installedFixes.deleteConfirm\":\"Opravdu chcete odstranit tuto opravu? Tím se smažou soubory opravy a spustí se ověření Steam.\",\"settings.installedFixes.deleteError\":\"Nepodařilo se odstranit opravu.\",\"settings.installedFixes.deleteSuccess\":\"Oprava byla úspěšně odstraněna!\",\"settings.installedFixes.deleting\":\"Odstraňování opravy...\",\"settings.installedFixes.empty\":\"Zatím nejsou nainstalované žádné opravy.\",\"settings.installedFixes.error\":\"Nepodařilo se načíst nainstalované opravy.\",\"settings.installedFixes.files\":\"{count} souborů\",\"settings.installedFixes.loading\":\"Skenování nainstalovaných oprav...\",\"settings.installedFixes.title\":\"Nainstalované Opravy\",\"settings.installedFixes.type\":\"Typ:\",\"settings.installedLua.delete\":\"Odstranit\",\"settings.installedLua.deleteConfirm\":\"Odstranit přes LuaTools pro tuto hru?\",\"settings.installedLua.deleteError\":\"Nepodařilo se odstranit přes LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Úspěšně odstraněno přes LuaTools!\",\"settings.installedLua.deleting\":\"Odstraňování přes LuaTools...\",\"settings.installedLua.disabled\":\"Zakázáno\",\"settings.installedLua.empty\":\"Zatím nejsou nainstalované žádné Lua skripty.\",\"settings.installedLua.error\":\"Nepodařilo se načíst nainstalované Lua skripty.\",\"settings.installedLua.loading\":\"Skenování nainstalovaných Lua skriptů...\",\"settings.installedLua.modified\":\"Upraveno:\",\"settings.installedLua.title\":\"Hry přes LuaTools\",\"settings.installedLua.unknownInfo\":\"Hry zobrazující 'Neznámá hra' byly nainstalovány z externích zdrojů (ne přes LuaTools).\",\"settings.language.description\":\"Vyberte jazyk používaný v LuaTools.\",\"settings.language.label\":\"Jazyk\",\"settings.language.option.en\":\"Angličtina\",\"settings.language.option.pt-BR\":\"Brazilská portugalština\",\"settings.loading\":\"Načítám nastavení...\",\"settings.noChanges\":\"Žádné změny k uložení.\",\"settings.refresh\":\"Obnovit\",\"settings.refreshing\":\"Obnovuji...\",\"settings.save\":\"Uložit nastavení\",\"settings.saveError\":\"Nepodařilo se uložit nastavení.\",\"settings.saveSuccess\":\"Nastavení úspěšně uloženo.\",\"settings.saving\":\"Ukládám...\",\"settings.search.clear\":\"Vymazat hledání\",\"settings.search.noResults\":\"Nenalezeny žádné výsledky\",\"settings.search.placeholder\":\"Hledat nastavení, hry, opravy...\",\"settings.theme.description\":\"Vyberte barevné téma pro rozhraní LuaTools.\",\"settings.theme.label\":\"Téma\",\"settings.title\":\"LuaTools · Nastavení\",\"settings.unsaved\":\"Neuložené změny\",\"settings.useSteamLanguage.description\":\"Použijte jazyk klienta Steam místo nastavení LuaTools.\",\"settings.useSteamLanguage.label\":\"Použít jazyk Steamu\",\"settings.useSteamLanguage.no\":\"Ne\",\"settings.useSteamLanguage.yes\":\"Ano\",\"{fix} applied successfully!\":\"{fix} úspěšně použita!\",\"settings.morrenusApiKey.label\":\"Morrenus API klíč\",\"settings.morrenusApiKey.description\":\"API klíč je vyžadován pro použití Sadie Source. Získejte z {link}\",\"settings.morrenusApiKey.placeholder\":\"Zadejte svůj API klíč\"}",
    "da": "{\"Add via LuaTools\":\"Tilføj via LuaTools\",\"Advanced\":\"Avanceret\",\"All-In-One Fixes\":\"Alt-i-ét rettelser\",\"Apply\":\"Anvend\",\"Applying {fix}\":\"Anvender {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Er du sikker på, at du vil fjerne rettelsen? Dette vil slette rettelsesfilerne og verificere spilfilerne.\",\"Are you sure?\":\"Er du sikker?\",\"Back\":\"Tilbage\",\"Base Game\":\"Grundspil\",\"Cancel\":\"Annuller\",\"Cancellation failed\":\"Annullering mislykkedes\",\"Cancelled\":\"Annulleret\",\"Cancelled by user\":\"Annulleret af brugeren\",\"Cancelled: {reason}\":\"Annulleret: {reason}\",\"Cancelling...\":\"Annullerer...\",\"Check for updates\":\"Søg efter opdateringer\",\"Checking availability…\":\"Tjekker tilgængelighed…\",\"Checking content…\":\"Tjekker indhold…\",\"Checking generic fix...\":\"Tjekker generisk rettelse...\",\"Checking key...\":\"Kontrollerer nøgle...\",\"Checking online-fix...\":\"Tjekker online-rettelse...\",\"Checking…\":\"Tjekker…\",\"Close\":\"Luk\",\"Confirm\":\"Bekræft\",\"Content details =>\":\"Indholdsdetaljer =>\",\"DLC Detected\":\"DLC fundet\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC'er tilføjes sammen med grundspillet. For at tilføje rettelser til denne DLC, gå venligst til grundspillets side: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Afvis\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Downloader...\",\"Downloading: {percent}%\":\"Downloader: {percent}%\",\"Downloading…\":\"Downloader…\",\"Error applying fix\":\"Fejl ved anvendelse af rettelse\",\"Error checking for fixes\":\"Fejl ved søgning efter rettelser\",\"Error starting Online Fix\":\"Fejl ved start af online-rettelse\",\"Error starting un-fix\":\"Fejl ved start af fjernelse af rettelse\",\"Error! Code: {code}\":\"Fejl! Kode: {code}\",\"Error, Code: {code}\":\"Fejl, Kode: {code}\",\"Error, Timed Out\":\"Fejl, tidsgrænse overskredet\",\"Error: {error}\":\"Fejl: {error}\",\"Expires\":\"Udløber\",\"Extracting to game folder...\":\"Udpakker til spilmappen...\",\"Failed\":\"Mislykkedes\",\"Failed to cancel fix download\":\"Kunne ikke annullere download af rettelse\",\"Failed to check for fixes.\":\"Kunne ikke søge efter rettelser.\",\"Failed to load free APIs.\":\"Kunne ikke indlæse gratis API'er.\",\"Failed to start fix download\":\"Kunne ikke starte download af rettelse\",\"Failed to start un-fix\":\"Kunne ikke starte fjernelse af rettelse\",\"Failed to verify key\":\"Kunne ikke verificere nøgle\",\"Failed: {error}\":\"Mislykkedes: {error}\",\"Fetch Free API's\":\"Hent gratis API'er\",\"Fetching game name...\":\"Henter spilnavn...\",\"Finishing…\":\"Færdiggør…\",\"Fixes Menu\":\"Rettelsesmenu\",\"Found\":\"Fundet\",\"Game Added!\":\"Spil tilføjet!\",\"Game added!\":\"Spil tilføjet!\",\"Game folder\":\"Spilmappe\",\"Game install path not found\":\"Spilinstallationssti ikke fundet\",\"Game not found on any available API.\":\"Spillet blev ikke fundet på nogen tilgængelig API.\",\"Generic Fix\":\"Generisk rettelse\",\"Generic fix found!\":\"Generisk rettelse fundet!\",\"Go to Base Game\":\"Gå til grundspillet\",\"Hide\":\"Skjul\",\"Included\":\"Inkluderet\",\"Initializing download...\":\"Initialiserer download...\",\"Installing…\":\"Installerer…\",\"Invalid Morrenus API Key format\":\"Ugyldigt Morrenus API-nøgleformat\",\"Invalid key format\":\"Ugyldigt nøgleformat\",\"Invalid or rejected key\":\"Ugyldig eller afvist nøgle\",\"Join the Discord!\":\"Deltag i Discord!\",\"Left click to install, Right click for SteamDB\":\"Venstreklik for at installere, højreklik for SteamDB\",\"Loaded free APIs: {count}\":\"Indlæste gratis API'er: {count}\",\"Loading APIs...\":\"Indlæser API'er...\",\"Loading fixes...\":\"Indlæser rettelser...\",\"Look for Fixes\":\"Søg efter rettelser\",\"LuaTools backend unavailable\":\"LuaTools-backend ikke tilgængelig\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Tilføjede spil\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Administrer spil\",\"Missing\":\"Mangler\",\"No games found.\":\"Ingen spil fundet.\",\"No generic fix\":\"Ingen generisk rettelse\",\"No online-fix\":\"Ingen online-rettelse\",\"No updates available.\":\"Ingen opdateringer tilgængelige.\",\"No workshop for the game\":\"Ingen workshop til spillet\",\"Not found\":\"Ikke fundet\",\"Online Fix\":\"Online-rettelse\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-rettelse fundet!\",\"Only possible thanks to {name} 💜\":\"Kun muligt takket være {name} 💜\",\"Proceed\":\"Fortsæt\",\"Processing package…\":\"Behandler pakke…\",\"Remove via LuaTools\":\"Fjern via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} filer fjernet. Kører Steam-verificering...\",\"Removing fix files...\":\"Fjerner rettelsesfiler...\",\"Restart Steam\":\"Genstart Steam\",\"Restart Steam now?\":\"Genstart Steam nu?\",\"Searching across sources...\":\"Søger på tværs af kilder...\",\"Select Download Source\":\"Vælg downloadkilde\",\"Settings\":\"Indstillinger\",\"Skipped\":\"Sprunget over\",\"The game has been added successfully.\":\"Spillet er blevet tilføjet.\",\"This game may not work, support for it wont be given in our discord\":\"Dette spil virker muligvis ikke, der ydes ikke support til det i vores discord\",\"Un-Fix (verify game)\":\"Fjern rettelse (verificer spil)\",\"Un-Fixing game\":\"Fjerner rettelse fra spil\",\"Unknown Game\":\"Ukendt spil\",\"Unknown error\":\"Ukendt fejl\",\"Usage\":\"Forbrug\",\"Verifying API limits...\":\"Verificerer API-grænser...\",\"Waiting…\":\"Venter…\",\"Working…\":\"Arbejder…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Du har overskredet din daglige downloadgrænse. Vent til i morgen eller opgrader din plan på Morrenus-websitet.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Din Morrenus API-nøgle er ugyldig eller udløbet. Kontrollér din nøgle i indstillingerne eller generer en ny på Morrenus-websitet.\",\"bigpicture.mouseTip\":\"Venstreklik for at installere, højreklik for SteamDB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Ikke-understøttet mulighed\",\"common.status.error\":\"Fejl\",\"common.status.loading\":\"Indlæser\",\"common.status.success\":\"Succes\",\"common.translationMissing\":\"oversættelse mangler\",\"common.warning\":\"Advarsel\",\"days left\":\"dage tilbage\",\"disclaimer.inputLabel\":\"Skriv \\\"Jeg forstår\\\" i feltet nedenfor for at fortsætte\",\"disclaimer.inputPlaceholder\":\"Jeg forstår\",\"disclaimer.line1\":\"Dette værktøj leveres som det er, uden nogen garanti.\",\"disclaimer.line2\":\"Brug det på egen risiko. Vi er ikke ansvarlige for eventuelle skader.\",\"disclaimer.line3\":\"Ved at fortsætte accepterer du disse vilkår.\",\"disclaimer.title\":\"Ansvarsfraskrivelse\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Har brug for rettelser\",\"gameStatus.playable\":\"Spilbar\",\"gameStatus.unplayable\":\"Ikke spilbar\",\"menu.advancedLabel\":\"Avanceret\",\"menu.checkForUpdates\":\"Søg efter opdateringer\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Kunne ikke hente spilsti\",\"menu.error.noAppId\":\"Ingen App ID fundet\",\"menu.error.noInstall\":\"Installationssti ikke fundet\",\"menu.error.notInstalled\":\"Spillet er ikke installeret\",\"menu.fetchFreeApis\":\"Hent gratis API'er\",\"menu.fixesMenu\":\"Rettelsesmenu\",\"menu.joinDiscordLabel\":\"Deltag i Discord\",\"menu.manageGameLabel\":\"Administrer spil\",\"menu.remove.confirm\":\"Er du sikker på, at du vil fjerne dette spil fra LuaTools?\",\"menu.remove.failure\":\"Kunne ikke fjerne spillet\",\"menu.remove.success\":\"Spillet blev fjernet\",\"menu.removeLuaTools\":\"Fjern via LuaTools\",\"menu.settings\":\"Indstillinger\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Luk\",\"settings.donateKeys.description\":\"Del ubrugte spilnøgler for at hjælpe fællesskabet\",\"settings.donateKeys.label\":\"Donér nøgler\",\"settings.donateKeys.no\":\"Nej\",\"settings.donateKeys.yes\":\"Ja\",\"settings.empty\":\"Ingen tilgængelige indstillinger\",\"settings.error\":\"Fejl ved indlæsning af indstillinger\",\"settings.fastDownload.description\":\"Vælg automatisk den første tilgængelige kilde, når du tilføjer et spil.\",\"settings.fastDownload.label\":\"Hurtig download\",\"settings.general\":\"Generelt\",\"settings.generalDescription\":\"Generelle LuaTools-indstillinger\",\"settings.installedFixes.date\":\"Dato\",\"settings.installedFixes.delete\":\"Slet\",\"settings.installedFixes.deleteConfirm\":\"Er du sikker på, at du vil slette denne rettelse?\",\"settings.installedFixes.deleteError\":\"Fejl ved sletning af rettelse\",\"settings.installedFixes.deleteSuccess\":\"Rettelse slettet\",\"settings.installedFixes.deleting\":\"Sletter…\",\"settings.installedFixes.empty\":\"Ingen installerede rettelser\",\"settings.installedFixes.error\":\"Fejl ved indlæsning af installerede rettelser\",\"settings.installedFixes.files\":\"Filer\",\"settings.installedFixes.loading\":\"Indlæser installerede rettelser…\",\"settings.installedFixes.title\":\"Installerede rettelser\",\"settings.installedFixes.type\":\"Type\",\"settings.installedLua.delete\":\"Slet\",\"settings.installedLua.deleteConfirm\":\"Er du sikker på, at du vil slette dette Lua-script?\",\"settings.installedLua.deleteError\":\"Fejl ved sletning af Lua-script\",\"settings.installedLua.deleteSuccess\":\"Lua-script slettet\",\"settings.installedLua.deleting\":\"Sletter…\",\"settings.installedLua.disabled\":\"Deaktiveret\",\"settings.installedLua.empty\":\"Ingen installerede Lua-scripts\",\"settings.installedLua.error\":\"Fejl ved indlæsning af Lua-scripts\",\"settings.installedLua.loading\":\"Indlæser Lua-scripts…\",\"settings.installedLua.modified\":\"Ændret\",\"settings.installedLua.title\":\"Installerede Lua-scripts\",\"settings.installedLua.unknownInfo\":\"Ingen tilgængelig information\",\"settings.language.description\":\"Vælg sproget til LuaTools-grænsefladen\",\"settings.language.label\":\"Sprog\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Indlæser…\",\"settings.noChanges\":\"Ingen ændringer at gemme\",\"settings.refresh\":\"Opdater\",\"settings.refreshing\":\"Opdaterer…\",\"settings.save\":\"Gem\",\"settings.saveError\":\"Fejl ved gemning af indstillinger\",\"settings.saveSuccess\":\"Indstillinger gemt\",\"settings.saving\":\"Gemmer…\",\"settings.search.clear\":\"Ryd\",\"settings.search.noResults\":\"Ingen resultater fundet\",\"settings.search.placeholder\":\"Søg i indstillinger…\",\"settings.theme.description\":\"Vælg temaet til LuaTools-grænsefladen\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Du har ændringer, der ikke er gemt\",\"settings.useSteamLanguage.description\":\"Brug automatisk det sprog, der er indstillet i Steam\",\"settings.useSteamLanguage.label\":\"Brug Steam-sprog\",\"settings.useSteamLanguage.no\":\"Nej\",\"settings.useSteamLanguage.yes\":\"Ja\",\"{fix} applied successfully!\":\"{fix} anvendt!\",\"settings.morrenusApiKey.label\":\"Morrenus API nøgle\",\"settings.morrenusApiKey.description\":\"API nøgle kræves for at bruge Sadie Source. Få fra {link}\",\"settings.morrenusApiKey.placeholder\":\"Indtast din API nøgle\"}",
    "de": "{\"Add via LuaTools\":\"Über LuaTools hinzufügen\",\"Advanced\":\"Erweitert\",\"All-In-One Fixes\":\"Alles-in-einem-Fixes\",\"Apply\":\"Anwenden\",\"Applying {fix}\":\"{fix} wird angewendet\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Bist du sicher, dass du den Fix entfernen möchtest? Dabei werden die Fix-Dateien gelöscht und die Spieldateien überprüft.\",\"Are you sure?\":\"Bist du sicher?\",\"Back\":\"Zurück\",\"Base Game\":\"Hauptspiel\",\"Cancel\":\"Abbrechen\",\"Cancellation failed\":\"Abbruch fehlgeschlagen\",\"Cancelled\":\"Abgebrochen\",\"Cancelled by user\":\"Vom Benutzer abgebrochen\",\"Cancelled: {reason}\":\"Abgebrochen: {reason}\",\"Cancelling...\":\"Wird abgebrochen...\",\"Check for updates\":\"Nach Updates suchen\",\"Checking availability…\":\"Verfügbarkeit wird geprüft…\",\"Checking content…\":\"Inhalt wird überprüft…\",\"Checking generic fix...\":\"Generischer Fix wird geprüft...\",\"Checking key...\":\"Schlüssel wird überprüft...\",\"Checking online-fix...\":\"Online-Fix wird geprüft...\",\"Checking…\":\"Wird geprüft…\",\"Close\":\"Schließen\",\"Confirm\":\"Bestätigen\",\"Content details =>\":\"Inhaltsdetails =>\",\"DLC Detected\":\"DLC erkannt\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLCs werden zusammen mit dem Hauptspiel hinzugefügt. Um Fixes für diesen DLC hinzuzufügen, gehe bitte zur Seite des Hauptspiels: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Verwerfen\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Wird heruntergeladen...\",\"Downloading: {percent}%\":\"Herunterladen: {percent}%\",\"Downloading…\":\"Wird heruntergeladen…\",\"Error applying fix\":\"Fehler beim Anwenden des Fixes\",\"Error checking for fixes\":\"Fehler beim Suchen nach Fixes\",\"Error starting Online Fix\":\"Fehler beim Starten des Online-Fixes\",\"Error starting un-fix\":\"Fehler beim Starten der Fix-Entfernung\",\"Error! Code: {code}\":\"Fehler! Code: {code}\",\"Error, Code: {code}\":\"Fehler, Code: {code}\",\"Error, Timed Out\":\"Fehler, Zeitüberschreitung\",\"Error: {error}\":\"Fehler: {error}\",\"Expires\":\"Läuft ab\",\"Extracting to game folder...\":\"Wird in den Spielordner entpackt...\",\"Failed\":\"Fehlgeschlagen\",\"Failed to cancel fix download\":\"Fix-Download konnte nicht abgebrochen werden\",\"Failed to check for fixes.\":\"Suche nach Fixes fehlgeschlagen.\",\"Failed to load free APIs.\":\"Kostenlose APIs konnten nicht geladen werden.\",\"Failed to start fix download\":\"Fix-Download konnte nicht gestartet werden\",\"Failed to start un-fix\":\"Fix-Entfernung konnte nicht gestartet werden\",\"Failed to verify key\":\"Schlüssel konnte nicht überprüft werden\",\"Failed: {error}\":\"Fehlgeschlagen: {error}\",\"Fetch Free API's\":\"Kostenlose APIs abrufen\",\"Fetching game name...\":\"Spielname wird abgerufen...\",\"Finishing…\":\"Wird abgeschlossen…\",\"Fixes Menu\":\"Fixes-Menü\",\"Found\":\"Gefunden\",\"Game Added!\":\"Spiel hinzugefügt!\",\"Game added!\":\"Spiel hinzugefügt!\",\"Game folder\":\"Spielordner\",\"Game install path not found\":\"Installationspfad des Spiels nicht gefunden\",\"Game not found on any available API.\":\"Spiel auf keiner verfügbaren API gefunden.\",\"Generic Fix\":\"Generischer Fix\",\"Generic fix found!\":\"Generischer Fix gefunden!\",\"Go to Base Game\":\"Zum Hauptspiel\",\"Hide\":\"Ausblenden\",\"Included\":\"Enthalten\",\"Initializing download...\":\"Download wird initialisiert...\",\"Installing…\":\"Wird installiert…\",\"Invalid Morrenus API Key format\":\"Ungültiges Morrenus API-Schlüsselformat\",\"Invalid key format\":\"Ungültiges Schlüsselformat\",\"Invalid or rejected key\":\"Ungültiger oder abgelehnter Schlüssel\",\"Join the Discord!\":\"Tritt dem Discord bei!\",\"Left click to install, Right click for SteamDB\":\"Linksklick zum Installieren, Rechtsklick für SteamDB\",\"Loaded free APIs: {count}\":\"Kostenlose APIs geladen: {count}\",\"Loading APIs...\":\"APIs werden geladen...\",\"Loading fixes...\":\"Fixes werden geladen...\",\"Look for Fixes\":\"Nach Fixes suchen\",\"LuaTools backend unavailable\":\"LuaTools-Backend nicht verfügbar\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Hinzugefügte Spiele\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Spiel verwalten\",\"Missing\":\"Fehlt\",\"No games found.\":\"Keine Spiele gefunden.\",\"No generic fix\":\"Kein generischer Fix\",\"No online-fix\":\"Kein Online-Fix\",\"No updates available.\":\"Keine Updates verfügbar.\",\"No workshop for the game\":\"Kein Workshop für das Spiel\",\"Not found\":\"Nicht gefunden\",\"Online Fix\":\"Online-Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-Fix gefunden!\",\"Only possible thanks to {name} 💜\":\"Nur möglich dank {name} 💜\",\"Proceed\":\"Fortfahren\",\"Processing package…\":\"Paket wird verarbeitet…\",\"Remove via LuaTools\":\"Über LuaTools entfernen\",\"Removed {count} files. Running Steam verification...\":\"{count} Dateien entfernt. Steam-Überprüfung wird ausgeführt...\",\"Removing fix files...\":\"Fix-Dateien werden entfernt...\",\"Restart Steam\":\"Steam neustarten\",\"Restart Steam now?\":\"Steam jetzt neustarten?\",\"Searching across sources...\":\"Suche in allen Quellen...\",\"Select Download Source\":\"Download-Quelle auswählen\",\"Settings\":\"Einstellungen\",\"Skipped\":\"Übersprungen\",\"The game has been added successfully.\":\"Das Spiel wurde erfolgreich hinzugefügt.\",\"This game may not work, support for it wont be given in our discord\":\"Dieses Spiel funktioniert möglicherweise nicht, Support wird in unserem Discord nicht gegeben\",\"Un-Fix (verify game)\":\"Fix entfernen (Spiel überprüfen)\",\"Un-Fixing game\":\"Fix wird entfernt\",\"Unknown Game\":\"Unbekanntes Spiel\",\"Unknown error\":\"Unbekannter Fehler\",\"Usage\":\"Nutzung\",\"Verifying API limits...\":\"API-Limits werden überprüft...\",\"Waiting…\":\"Warten…\",\"Working…\":\"Wird verarbeitet…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Du hast dein tägliches Download-Limit überschritten. Bitte warte bis morgen oder upgrade deinen Plan auf der Morrenus-Website.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Dein Morrenus API-Schlüssel ist ungültig oder abgelaufen. Bitte überprüfe deinen Schlüssel in den Einstellungen oder erstelle einen neuen auf der Morrenus-Website.\",\"bigpicture.mouseTip\":\"Linksklick zum Installieren, Rechtsklick für SteamDB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Nicht unterstützte Option\",\"common.status.error\":\"Fehler\",\"common.status.loading\":\"Laden\",\"common.status.success\":\"Erfolgreich\",\"common.translationMissing\":\"Übersetzung fehlt\",\"common.warning\":\"Warnung\",\"days left\":\"Tage übrig\",\"disclaimer.inputLabel\":\"Tippe \\\"Ich verstehe\\\" in das Feld unten ein, um fortzufahren\",\"disclaimer.inputPlaceholder\":\"Ich verstehe\",\"disclaimer.line1\":\"Dieses Tool wird ohne jegliche Garantie bereitgestellt.\",\"disclaimer.line2\":\"Die Nutzung erfolgt auf eigene Gefahr. Wir übernehmen keine Haftung für etwaige Schäden.\",\"disclaimer.line3\":\"Durch Fortfahren akzeptierst du diese Bedingungen.\",\"disclaimer.title\":\"Haftungsausschluss\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Benötigt Fixes\",\"gameStatus.playable\":\"Spielbar\",\"gameStatus.unplayable\":\"Nicht spielbar\",\"menu.advancedLabel\":\"Erweitert\",\"menu.checkForUpdates\":\"Nach Updates suchen\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Spielpfad konnte nicht abgerufen werden\",\"menu.error.noAppId\":\"Keine App ID gefunden\",\"menu.error.noInstall\":\"Installationspfad nicht gefunden\",\"menu.error.notInstalled\":\"Spiel ist nicht installiert\",\"menu.fetchFreeApis\":\"Kostenlose APIs abrufen\",\"menu.fixesMenu\":\"Fixes-Menü\",\"menu.joinDiscordLabel\":\"Tritt dem Discord bei\",\"menu.manageGameLabel\":\"Spiel verwalten\",\"menu.remove.confirm\":\"Bist du sicher, dass du dieses Spiel aus LuaTools entfernen möchtest?\",\"menu.remove.failure\":\"Spiel konnte nicht entfernt werden\",\"menu.remove.success\":\"Spiel erfolgreich entfernt\",\"menu.removeLuaTools\":\"Über LuaTools entfernen\",\"menu.settings\":\"Einstellungen\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Schließen\",\"settings.donateKeys.description\":\"Teile ungenutzte Spielschlüssel, um der Community zu helfen\",\"settings.donateKeys.label\":\"Schlüssel spenden\",\"settings.donateKeys.no\":\"Nein\",\"settings.donateKeys.yes\":\"Ja\",\"settings.empty\":\"Keine Einstellungen verfügbar\",\"settings.error\":\"Fehler beim Laden der Einstellungen\",\"settings.fastDownload.description\":\"Automatisch die erste verfügbare Quelle beim Hinzufügen eines Spiels wählen.\",\"settings.fastDownload.label\":\"Schneller Download\",\"settings.general\":\"Allgemein\",\"settings.generalDescription\":\"Allgemeine LuaTools-Einstellungen\",\"settings.installedFixes.date\":\"Datum\",\"settings.installedFixes.delete\":\"Löschen\",\"settings.installedFixes.deleteConfirm\":\"Bist du sicher, dass du diesen Fix löschen möchtest?\",\"settings.installedFixes.deleteError\":\"Fehler beim Löschen des Fixes\",\"settings.installedFixes.deleteSuccess\":\"Fix erfolgreich gelöscht\",\"settings.installedFixes.deleting\":\"Wird gelöscht…\",\"settings.installedFixes.empty\":\"Keine installierten Fixes\",\"settings.installedFixes.error\":\"Fehler beim Laden der installierten Fixes\",\"settings.installedFixes.files\":\"Dateien\",\"settings.installedFixes.loading\":\"Installierte Fixes werden geladen…\",\"settings.installedFixes.title\":\"Installierte Fixes\",\"settings.installedFixes.type\":\"Typ\",\"settings.installedLua.delete\":\"Löschen\",\"settings.installedLua.deleteConfirm\":\"Bist du sicher, dass du dieses Lua-Skript löschen möchtest?\",\"settings.installedLua.deleteError\":\"Fehler beim Löschen des Lua-Skripts\",\"settings.installedLua.deleteSuccess\":\"Lua-Skript erfolgreich gelöscht\",\"settings.installedLua.deleting\":\"Wird gelöscht…\",\"settings.installedLua.disabled\":\"Deaktiviert\",\"settings.installedLua.empty\":\"Keine installierten Lua-Skripte\",\"settings.installedLua.error\":\"Fehler beim Laden der Lua-Skripte\",\"settings.installedLua.loading\":\"Lua-Skripte werden geladen…\",\"settings.installedLua.modified\":\"Geändert\",\"settings.installedLua.title\":\"Installierte Lua-Skripte\",\"settings.installedLua.unknownInfo\":\"Keine Informationen verfügbar\",\"settings.language.description\":\"Wähle die Sprache der LuaTools-Oberfläche\",\"settings.language.label\":\"Sprache\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Laden…\",\"settings.noChanges\":\"Keine Änderungen zum Speichern\",\"settings.refresh\":\"Aktualisieren\",\"settings.refreshing\":\"Wird aktualisiert…\",\"settings.save\":\"Speichern\",\"settings.saveError\":\"Fehler beim Speichern der Einstellungen\",\"settings.saveSuccess\":\"Einstellungen erfolgreich gespeichert\",\"settings.saving\":\"Wird gespeichert…\",\"settings.search.clear\":\"Leeren\",\"settings.search.noResults\":\"Keine Ergebnisse gefunden\",\"settings.search.placeholder\":\"Einstellungen durchsuchen…\",\"settings.theme.description\":\"Wähle das Design der LuaTools-Oberfläche\",\"settings.theme.label\":\"Design\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Du hast ungespeicherte Änderungen\",\"settings.useSteamLanguage.description\":\"Automatisch die in Steam eingestellte Sprache verwenden\",\"settings.useSteamLanguage.label\":\"Steam-Sprache verwenden\",\"settings.useSteamLanguage.no\":\"Nein\",\"settings.useSteamLanguage.yes\":\"Ja\",\"{fix} applied successfully!\":\"{fix} erfolgreich angewendet!\",\"settings.morrenusApiKey.label\":\"Morrenus API-Schlüssel\",\"settings.morrenusApiKey.description\":\"API-Schlüssel erforderlich für Sadie Source. Hol ihn dir unter {link}\",\"settings.morrenusApiKey.placeholder\":\"Gib deinen API-Schlüssel ein\"}",
    "el": "{\"Add via LuaTools\":\"Προσθήκη μέσω LuaTools\",\"Advanced\":\"Για προχωρημένους\",\"All-In-One Fixes\":\"Διορθώσεις All-In-One\",\"Apply\":\"Εφαρμογή\",\"Applying {fix}\":\"Εφαρμογή {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Είστε σίγουροι ότι θέλετε να αφαιρέσετε τη διόρθωση; Αυτό θα αφαιρέσει τα αρχεία της διόρθωσης και θα επαληθεύσει τα αρχεία του παιχνιδιού.\",\"Are you sure?\":\"Είστε σίγουροι?\",\"Back\":\"Πίσω\",\"Base Game\":\"Βασικό Παιχνίδι\",\"Cancel\":\"Ακύρωση\",\"Cancellation failed\":\"Η ακύρωση απέτυχε\",\"Cancelled\":\"Ακυρώθηκε\",\"Cancelled by user\":\"Ακυρώθηκε από τον χρήστη\",\"Cancelled: {reason}\":\"Ακυρώθηκε: {reason}\",\"Cancelling...\":\"Ακύρωση...\",\"Check for updates\":\"Έλεγχος για ενημερώσεις\",\"Checking availability…\":\"Έλεγχος διαθεσιμότητας…\",\"Checking content…\":\"Έλεγχος περιεχομένου…\",\"Checking generic fix...\":\"Έλεγχος γενικής διόρθωσης...\",\"Checking key...\":\"Έλεγχος κλειδιού...\",\"Checking online-fix...\":\"Έλεγχος Online-Fix...\",\"Checking…\":\"Έλεγχος…\",\"Close\":\"Κλείσιμο\",\"Confirm\":\"Επιβεβαίωση\",\"Content details =>\":\"Λεπτομέρειες περιεχομένου =>\",\"DLC Detected\":\"Εντοπίστηκε DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"Τα DLC προστίθενται μαζί με το βασικό παιχνίδι. Για να προσθέσετε διορθώσεις για αυτό το DLC, μεταβείτε στη σελίδα του βασικού παιχνιδιού: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Απόρριψη\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Λήψη...\",\"Downloading: {percent}%\":\"Λήψη: {percent}%\",\"Downloading…\":\"Λήψη…\",\"Error applying fix\":\"Σφάλμα κατά την εκτέλεση της επιδιόρθωσης\",\"Error checking for fixes\":\"Σφάλμα κατά τον έλεγχο για διορθώσεις\",\"Error starting Online Fix\":\"Σφάλμα εκκίνησης της Online-Fix\",\"Error starting un-fix\":\"Σφάλμα εκκίνησης της διαδικασίας αφαίρεσης διόρθωσης\",\"Error! Code: {code}\":\"Σφάλμα! Κωδικός: {code}\",\"Error, Code: {code}\":\"Σφάλμα, Κωδικός: {code}\",\"Error, Timed Out\":\"Σφάλμα, Λήξη χρονικού ορίου\",\"Error: {error}\":\"Σφάλμα: {error}\",\"Expires\":\"Λήγει\",\"Extracting to game folder...\":\"Εξαγωγή στο φάκελο παιχνιδιού...\",\"Failed\":\"Απέτυχε\",\"Failed to cancel fix download\":\"Αποτυχία ακύρωσης λήψης διόρθωσης\",\"Failed to check for fixes.\":\"Αποτυχία ελέγχου για διορθώσεις.\",\"Failed to load free APIs.\":\"Αποτυχία φόρτωσης δωρεάν API.\",\"Failed to start fix download\":\"Αποτυχία έναρξης λήψης διόρθωσης\",\"Failed to start un-fix\":\"Αποτυχία έναρξης του un-fix\",\"Failed to verify key\":\"Αποτυχία επαλήθευσης κλειδιού\",\"Failed: {error}\":\"Απέτυχε: {error}\",\"Fetch Free API's\":\"Ανάκτηση δωρεάν API\",\"Fetching game name...\":\"Αναζήτηση ονόματος παιχνιδιού...\",\"Finishing…\":\"Ολοκλήρωση…\",\"Fixes Menu\":\"Μενού διορθώσεων\",\"Found\":\"Βρέθηκε\",\"Game Added!\":\"Το παιχνίδι προστέθηκε!\",\"Game added!\":\"Προστέθηκε το παιχνίδι!\",\"Game folder\":\"Φάκελος παιχνιδιού\",\"Game install path not found\":\"Δεν βρέθηκε η διαδρομή εγκατάστασης του παιχνιδιού\",\"Game not found on any available API.\":\"Το παιχνίδι δεν βρέθηκε σε κανένα διαθέσιμο API.\",\"Generic Fix\":\"Γενική Διόρθωση\",\"Generic fix found!\":\"Βρέθηκε γενική διόρθωση!\",\"Go to Base Game\":\"Μετάβαση στο Βασικό Παιχνίδι\",\"Hide\":\"Απόκρυψη\",\"Included\":\"Συμπεριλαμβάνεται\",\"Initializing download...\":\"Αρχικοποίηση λήψης...\",\"Installing…\":\"Εγκατάσταση…\",\"Invalid Morrenus API Key format\":\"Μη έγκυρη μορφή κλειδιού Morrenus API\",\"Invalid key format\":\"Μη έγκυρη μορφή κλειδιού\",\"Invalid or rejected key\":\"Μη έγκυρο ή απορριφθέν κλειδί\",\"Join the Discord!\":\"Μπείτε στο Discord!\",\"Left click to install, Right click for SteamDB\":\"Αριστερό κλικ για εγκατάσταση, δεξί κλικ για SteamDB\",\"Loaded free APIs: {count}\":\"Φορτώθηκαν δωρεάν API: {count}\",\"Loading APIs...\":\"Φόρτωση API...\",\"Loading fixes...\":\"Φόρτωση διορθώσεων...\",\"Look for Fixes\":\"Αναζήτηση διορθώσεων\",\"LuaTools backend unavailable\":\"Μη διαθέσιμο backend LuaTools\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Μενού AIO Διορθώσεων\",\"LuaTools · Added Games\":\"LuaTools · Προστέθηκαν παιχνίδια\",\"LuaTools · Fixes Menu\":\"LuaTools · Μενού διορθώσεων\",\"LuaTools · Menu\":\"LuaTools · Μενού\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Διαχείριση παιχνιδιού\",\"Missing\":\"Λείπει\",\"No games found.\":\"Δεν βρέθηκαν παιχνίδια.\",\"No generic fix\":\"Δεν υπάρχει γενική διόρθωση\",\"No online-fix\":\"Δεν υπάρχει Online-Fix\",\"No updates available.\":\"Δεν υπάρχουν διαθέσιμες ενημερώσεις.\",\"No workshop for the game\":\"Δεν υπάρχει workshop για το παιχνίδι\",\"Not found\":\"Δεν βρέθηκε\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Βρέθηκε Online-Fix!\",\"Only possible thanks to {name} 💜\":\"Εφικτό μόνο χάρη στον/στην {name} 💜\",\"Proceed\":\"Συνέχεια\",\"Processing package…\":\"Επεξεργασία πακέτου…\",\"Remove via LuaTools\":\"Αφαίρεση μέσω LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Αφαιρέθηκαν {count} αρχεία. Εκτελείται επαλήθευση Steam...\",\"Removing fix files...\":\"Αφαίρεση αρχείων διόρθωσης...\",\"Restart Steam\":\"Επανεκκίνηση του Steam\",\"Restart Steam now?\":\"Επανεκκίνηση του Steam τώρα;\",\"Searching across sources...\":\"Αναζήτηση σε όλες τις πηγές...\",\"Select Download Source\":\"Επιλογή πηγής λήψης\",\"Settings\":\"Ρυθμίσεις\",\"Skipped\":\"Παραλείφθηκε\",\"The game has been added successfully.\":\"Το παιχνίδι προστέθηκε επιτυχώς.\",\"This game may not work, support for it wont be given in our discord\":\"Αυτό το παιχνίδι ενδέχεται να μην λειτουργεί, η υποστήριξη γι' αυτό δεν θα παρέχεται στο discord μας\",\"Un-Fix (verify game)\":\"Αφαίρεση διόρθωσης (επαλήθευση παιχνιδιού)\",\"Un-Fixing game\":\"Αφαίρεση διόρθωσης από το παιχνίδι\",\"Unknown Game\":\"Άγνωστο παιχνίδι\",\"Unknown error\":\"Άγνωστο σφάλμα\",\"Usage\":\"Χρήση\",\"Verifying API limits...\":\"Επαλήθευση ορίων API...\",\"Waiting…\":\"Αναμονή…\",\"Working…\":\"Εργάζεται…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Έχετε υπερβεί το ημερήσιο όριο λήψεων. Περιμένετε μέχρι αύριο ή αναβαθμίστε το πλάνο σας στον ιστότοπο Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Το κλειδί Morrenus API είναι μη έγκυρο ή έχει λήξει. Ελέγξτε το κλειδί σας στις ρυθμίσεις ή δημιουργήστε νέο στον ιστότοπο Morrenus.\",\"bigpicture.mouseTip\":\"Για χρήση λειτουργίας ποντικιού στο Steam: Κουμπί Guide + Δεξί Joystick, κλικ με RB\",\"common.alert.ok\":\"Εντάξει\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Μη υποστηριζόμενος τύπος επιλογής: {type}\",\"common.status.error\":\"Σφάλμα\",\"common.status.loading\":\"Φόρτωση...\",\"common.status.success\":\"Επιτυχία\",\"common.translationMissing\":\"λείπει μετάφραση\",\"common.warning\":\"Προειδοποίηση\",\"days left\":\"ημέρες απομένουν\",\"disclaimer.inputLabel\":\"Πληκτρολογήστε \\\"Καταλαβαίνω\\\" στο πλαίσιο παρακάτω για να συνεχίσετε\",\"disclaimer.inputPlaceholder\":\"Καταλαβαίνω\",\"disclaimer.line1\":\"Το LuaTools δεν σχετίζεται με κανέναν τρόπο με το Millennium\",\"disclaimer.line2\":\"Το Millennium ΔΕΝ θα σας προσφέρει υποστήριξη για αυτό το plugin στον διακομιστή discord τους\",\"disclaimer.line3\":\"Θα ΑΠΟΚΛΕΙΣΤΕΙΤΕ και από τους δύο διακομιστές LuaTools και Millennium αν πάτε στο discord τους ζητώντας βοήθεια\",\"disclaimer.title\":\"Σημαντική Ειδοποίηση\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Διαθέσιμη διόρθωση\",\"gameStatus.playable\":\"Παίξιμο\",\"gameStatus.unplayable\":\"Μη παίξιμο\",\"menu.advancedLabel\":\"Για προχωρημένους\",\"menu.checkForUpdates\":\"Έλεγχος για ενημερώσεις\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Σφάλμα λήψης διαδρομής παιχνιδιού\",\"menu.error.noAppId\":\"Αδύνατος ο εντοπισμός του AppID του παιχνιδιού\",\"menu.error.noInstall\":\"Δεν βρέθηκε η εγκατάσταση του παιχνιδιού\",\"menu.error.notInstalled\":\"Το παιχνίδι δεν είναι εγκατεστημένο! Προσθέστε και εγκαταστήστε το πρώτα :D\",\"menu.fetchFreeApis\":\"Λήψη δωρεάν APIs\",\"menu.fixesMenu\":\"Μενού διορθώσεων\",\"menu.joinDiscordLabel\":\"Μπείτε στο Discord!\",\"menu.manageGameLabel\":\"Διαχείριση παιχνιδιού\",\"menu.remove.confirm\":\"Αφαίρεση μέσω LuaTools για αυτό το παιχνίδι;\",\"menu.remove.failure\":\"Αποτυχία αφαίρεσης του LuaTools.\",\"menu.remove.success\":\"Το LuaTools αφαιρέθηκε για αυτήν την εφαρμογή.\",\"menu.removeLuaTools\":\"Αφαίρεση μέσω LuaTools\",\"menu.settings\":\"Ρυθμίσεις\",\"menu.title\":\"LuaTools · Μενού\",\"settings.close\":\"Κλείσιμο\",\"settings.donateKeys.description\":\"Δωρίστε κλειδιά ξεκλειδώματος για παιχνίδια, βοηθάει τους πάντες!\",\"settings.donateKeys.label\":\"Δωρεά κλειδιών\",\"settings.donateKeys.no\":\"Όχι\",\"settings.donateKeys.yes\":\"Ναι\",\"settings.empty\":\"Δεν υπάρχουν διαθέσιμες ρυθμίσεις ακόμη.\",\"settings.error\":\"Αποτυχία φόρτωσης ρυθμίσεων.\",\"settings.fastDownload.description\":\"Αυτόματη επιλογή της πρώτης διαθέσιμης πηγής κατά την προσθήκη παιχνιδιού.\",\"settings.fastDownload.label\":\"Γρήγορη λήψη\",\"settings.general\":\"Γενικά\",\"settings.generalDescription\":\"Γενικές προτιμήσεις LuaTools.\",\"settings.installedFixes.date\":\"Εγκατεστάθηκε:\",\"settings.installedFixes.delete\":\"Διαγραφή\",\"settings.installedFixes.deleteConfirm\":\"Είστε σίγουροι ότι θέλετε να αφαιρέσετε αυτό το διορθωτικό; Αυτό θα διαγράψει τα αρχεία του διορθώματος και θα εκτελέσει την επαλήθευση Steam.\",\"settings.installedFixes.deleteError\":\"Αποτυχία αφαίρεσης διορθώματος.\",\"settings.installedFixes.deleteSuccess\":\"Το διορθωτικό αφαιρέθηκε με επιτυχία!\",\"settings.installedFixes.deleting\":\"Αφαίρεση διορθώματος...\",\"settings.installedFixes.empty\":\"Δεν υπάρχουν εγκατεστημένα διορθώματα ακόμα.\",\"settings.installedFixes.error\":\"Αποτυχία φόρτωσης εγκατεστημένων διορθωμάτων.\",\"settings.installedFixes.files\":\"{count} αρχεία\",\"settings.installedFixes.loading\":\"Σάρωση εγκατεστημένων διορθωμάτων...\",\"settings.installedFixes.title\":\"Εγκατεστημένα Διορθώματα\",\"settings.installedFixes.type\":\"Τύπος:\",\"settings.installedLua.delete\":\"Αφαίρεση\",\"settings.installedLua.deleteConfirm\":\"Αφαίρεση μέσω LuaTools για αυτό το παιχνίδι;\",\"settings.installedLua.deleteError\":\"Αποτυχία αφαίρεσης μέσω LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Αφαιρέθηκε μέσω LuaTools με επιτυχία!\",\"settings.installedLua.deleting\":\"Αφαίρεση μέσω LuaTools...\",\"settings.installedLua.disabled\":\"Απενεργοποιημένο\",\"settings.installedLua.empty\":\"Δεν υπάρχουν εγκατεστημένα Lua scripts ακόμα.\",\"settings.installedLua.error\":\"Αποτυχία φόρτωσης εγκατεστημένων Lua scripts.\",\"settings.installedLua.loading\":\"Σάρωση εγκατεστημένων Lua scripts...\",\"settings.installedLua.modified\":\"Τροποποιήθηκε:\",\"settings.installedLua.title\":\"Παιχνίδια μέσω LuaTools\",\"settings.installedLua.unknownInfo\":\"Παιχνίδια που εμφανίζουν 'Άγνωστο Παιχνίδι' εγκαταστάθηκαν από εξωτερικές πηγές (όχι μέσω LuaTools).\",\"settings.language.description\":\"Επιλέξτε τη γλώσσα που χρησιμοποιεί το LuaTools.\",\"settings.language.label\":\"Γλώσσα\",\"settings.language.option.en\":\"Αγγλικά\",\"settings.language.option.pt-BR\":\"Βραζιλιάνικα 'Πορτογαλικά'\",\"settings.loading\":\"Φόρτωση ρυθμίσεων...\",\"settings.noChanges\":\"Δεν υπάρχουν αλλαγές για αποθήκευση.\",\"settings.refresh\":\"Ανανέωση\",\"settings.refreshing\":\"Ανανεώνεται...\",\"settings.save\":\"Αποθήκευση ρυθμίσεων\",\"settings.saveError\":\"Αποτυχία αποθήκευσης ρυθμίσεων.\",\"settings.saveSuccess\":\"Οι ρυθμίσεις αποθηκεύτηκαν με επιτυχία.\",\"settings.saving\":\"Αποθήκευση...\",\"settings.search.clear\":\"Καθαρισμός αναζήτησης\",\"settings.search.noResults\":\"Δεν βρέθηκαν αποτελέσματα\",\"settings.search.placeholder\":\"Αναζήτηση ρυθμίσεων, παιχνιδιών, διορθώσεων...\",\"settings.theme.description\":\"Επιλέξτε το θέμα χρωμάτων για τη διεπαφή LuaTools.\",\"settings.theme.label\":\"Θέμα\",\"settings.title\":\"LuaTools · Ρυθμίσεις\",\"settings.unsaved\":\"Μη αποθηκευμένες αλλαγές\",\"settings.useSteamLanguage.description\":\"Χρησιμοποιήστε τη γλώσσα του πελάτη Steam αντί για τη ρύθμιση LuaTools.\",\"settings.useSteamLanguage.label\":\"Χρήση Γλώσσας Steam\",\"settings.useSteamLanguage.no\":\"Όχι\",\"settings.useSteamLanguage.yes\":\"Ναι\",\"{fix} applied successfully!\":\"Το {fix} εφαρμόστηκε επιτυχώς!\",\"settings.morrenusApiKey.label\":\"Κλειδί Morrenus API\",\"settings.morrenusApiKey.description\":\"Το κλειδί API απαιτείται για τη χρήση της Sadie Source. Αποκτήστε το από το {link}\",\"settings.morrenusApiKey.placeholder\":\"Εισαγάγετε το κλειδί API\"}",
    "en": "{\"Add via LuaTools\":\"Add via LuaTools\",\"Advanced\":\"Advanced\",\"All-In-One Fixes\":\"All-In-One Fixes\",\"Apply\":\"Apply\",\"Applying {fix}\":\"Applying {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Are you sure you want to un-fix? This will remove fix files and verify game files.\",\"Are you sure?\":\"Are you sure?\",\"Back\":\"Back\",\"Base Game\":\"Base Game\",\"Cancel\":\"Cancel\",\"Cancellation failed\":\"Cancellation failed\",\"Cancelled\":\"Cancelled\",\"Cancelled by user\":\"Cancelled by user\",\"Cancelled: {reason}\":\"Cancelled: {reason}\",\"Cancelling...\":\"Cancelling...\",\"Check for updates\":\"Check for updates\",\"Checking availability…\":\"Checking availability…\",\"Checking content…\":\"Checking content…\",\"Checking generic fix...\":\"Checking generic fix...\",\"Checking key...\":\"Checking key...\",\"Checking online-fix...\":\"Checking online-fix...\",\"Checking…\":\"Checking…\",\"Close\":\"Close\",\"Confirm\":\"Confirm\",\"Content details =>\":\"Content details =>\",\"DLC Detected\":\"DLC Detected\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLCs are added together with the base game. To add this DLC, please go to the base game page: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Dismiss\",\"Dlc: \":\"Dlc: \",\"Downloading...\":\"Downloading...\",\"Downloading: {percent}%\":\"Downloading: {percent}%\",\"Downloading…\":\"Downloading…\",\"Error applying fix\":\"Error applying fix\",\"Error checking for fixes\":\"Error checking for fixes\",\"Error starting Online Fix\":\"Error starting Online Fix\",\"Error starting un-fix\":\"Error starting un-fix\",\"Error! Code: {code}\":\"Error! Code: {code}\",\"Error, Code: {code}\":\"Error, Code: {code}\",\"Error, Timed Out\":\"Error, Timed Out\",\"Error: {error}\":\"Error: {error}\",\"Expires\":\"Expires\",\"Extracting to game folder...\":\"Extracting to game folder...\",\"Failed\":\"Failed\",\"Failed to cancel fix download\":\"Failed to cancel fix download\",\"Failed to check for fixes.\":\"Failed to check for fixes.\",\"Failed to load free APIs.\":\"Failed to load free APIs.\",\"Failed to start fix download\":\"Failed to start fix download\",\"Failed to start un-fix\":\"Failed to start un-fix\",\"Failed to verify key\":\"Failed to verify key\",\"Failed: {error}\":\"Failed: {error}\",\"Fetch Free API's\":\"Fetch Free API's\",\"Fetching game name...\":\"Fetching game name...\",\"Finishing…\":\"Finishing…\",\"Fixes Menu\":\"Fixes Menu\",\"Found\":\"Found\",\"Game Added!\":\"Game Added!\",\"Game added!\":\"Game added!\",\"Game folder\":\"Game folder\",\"Game install path not found\":\"Game install path not found\",\"Game not found on any available API.\":\"Game not found on any available API.\",\"Generic Fix\":\"Generic Fix\",\"Generic fix found!\":\"Generic fix found!\",\"Go to Base Game\":\"Go to Base Game\",\"Hide\":\"Hide\",\"Included\":\"Included 🎉\",\"Initializing download...\":\"Initializing download...\",\"Installing…\":\"Installing…\",\"Invalid Morrenus API Key format\":\"Invalid Morrenus API Key format\",\"Invalid key format\":\"Invalid key format\",\"Invalid or rejected key\":\"Invalid or rejected key\",\"Join the Discord!\":\"Join the Discord!\",\"Left click to install, Right click for SteamDB\":\"Left click to install, Right click for SteamDB\",\"Loaded free APIs: {count}\":\"Loaded free APIs: {count}\",\"Loading APIs...\":\"Loading APIs...\",\"Loading fixes...\":\"Loading fixes...\",\"Look for Fixes\":\"Look for Fixes\",\"LuaTools backend unavailable\":\"LuaTools backend unavailable\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Added Games\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Manage Game\",\"Missing\":\"Missing ❌\",\"No games found.\":\"No games found.\",\"No generic fix\":\"No generic fix\",\"No online-fix\":\"No online-fix\",\"No updates available.\":\"No updates available.\",\"No workshop for the game\":\"No workshop for the game ✅\",\"Not found\":\"Not found\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix found!\",\"Only possible thanks to {name} 💜\":\"Only possible thanks to {name} 💜\",\"Proceed\":\"Proceed\",\"Processing package…\":\"Processing package…\",\"Remove via LuaTools\":\"Remove via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Removed {count} files. Running Steam verification...\",\"Removing fix files...\":\"Removing fix files...\",\"Restart Steam\":\"Restart Steam\",\"Restart Steam now?\":\"Restart Steam now?\",\"Searching across sources...\":\"Searching across sources...\",\"Select Download Source\":\"Select Download Source\",\"Settings\":\"Settings\",\"Skipped\":\"Skipped\",\"The game has been added successfully.\":\"The game has been added successfully.\",\"This game may not work, support for it wont be given in our discord\":\"This game may not work, support for it wont be given in our discord\",\"Un-Fix (verify game)\":\"Un-Fix (verify game)\",\"Un-Fixing game\":\"Un-Fixing game\",\"Unknown Game\":\"Unknown Game\",\"Unknown error\":\"Unknown error\",\"Usage\":\"Usage\",\"Verifying API limits...\":\"Verifying API limits...\",\"Waiting…\":\"Waiting…\",\"Working…\":\"Working…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\",\"bigpicture.mouseTip\":\"To use mouse mode in Steam: Guide Button + Right Joystick, click with RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Unsupported option type: {type}\",\"common.status.error\":\"Error\",\"common.status.loading\":\"Loading...\",\"common.status.success\":\"Success\",\"common.translationMissing\":\"translation missing\",\"common.warning\":\"Warning\",\"days left\":\"days left\",\"disclaimer.inputLabel\":\"type \\\"I Understand\\\" in the box bellow to continue\",\"disclaimer.inputPlaceholder\":\"I Understand\",\"disclaimer.line1\":\"LuaTools is not affiliated in any way with Millennium\",\"disclaimer.line2\":\"Millennium will NOT offer you support for this plugin on their discord server\",\"disclaimer.line3\":\"You will be BANNED from both LuaTools and Millennium servers if you go to their discord asking for help\",\"disclaimer.title\":\"Important Notice\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Fix Available\",\"gameStatus.playable\":\"Playable\",\"gameStatus.unplayable\":\"Unplayable\",\"menu.advancedLabel\":\"Advanced\",\"menu.checkForUpdates\":\"Check For Updates\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Error getting game path\",\"menu.error.noAppId\":\"Could not determine game AppID\",\"menu.error.noInstall\":\"Could not find game installation\",\"menu.error.notInstalled\":\"Game not installed! Add and install it first :D\",\"menu.fetchFreeApis\":\"Fetch Free APIs\",\"menu.fixesMenu\":\"Fixes Menu\",\"menu.joinDiscordLabel\":\"Join the Discord!\",\"menu.manageGameLabel\":\"Manage Game\",\"menu.remove.confirm\":\"Remove via LuaTools for this game?\",\"menu.remove.failure\":\"Failed to remove LuaTools.\",\"menu.remove.success\":\"LuaTools removed for this app.\",\"menu.removeLuaTools\":\"Remove via LuaTools\",\"menu.settings\":\"Settings\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Close\",\"settings.donateKeys.description\":\"Donate decryption keys for games, helps everyone!\",\"settings.donateKeys.label\":\"Donate Keys\",\"settings.donateKeys.no\":\"No\",\"settings.donateKeys.yes\":\"Yes\",\"settings.empty\":\"No settings available yet.\",\"settings.error\":\"Failed to load settings.\",\"settings.fastDownload.description\":\"Automatically choose the first available source when adding a game.\",\"settings.fastDownload.label\":\"Fast Download\",\"settings.general\":\"General\",\"settings.generalDescription\":\"Global LuaTools preferences.\",\"settings.installedFixes.date\":\"Installed:\",\"settings.installedFixes.delete\":\"Delete\",\"settings.installedFixes.deleteConfirm\":\"Are you sure you want to remove this fix? This will delete fix files and run Steam verification.\",\"settings.installedFixes.deleteError\":\"Failed to remove fix.\",\"settings.installedFixes.deleteSuccess\":\"Fix removed successfully!\",\"settings.installedFixes.deleting\":\"Removing fix...\",\"settings.installedFixes.empty\":\"No fixes installed yet.\",\"settings.installedFixes.error\":\"Failed to load installed fixes.\",\"settings.installedFixes.files\":\"{count} files\",\"settings.installedFixes.loading\":\"Scanning for installed fixes...\",\"settings.installedFixes.title\":\"Installed Fixes\",\"settings.installedFixes.type\":\"Type:\",\"settings.installedLua.delete\":\"Remove\",\"settings.installedLua.deleteConfirm\":\"Remove via LuaTools for this game?\",\"settings.installedLua.deleteError\":\"Failed to remove via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Removed via LuaTools successfully!\",\"settings.installedLua.deleting\":\"Removing via LuaTools...\",\"settings.installedLua.disabled\":\"Disabled\",\"settings.installedLua.empty\":\"No Lua scripts installed yet.\",\"settings.installedLua.error\":\"Failed to load installed Lua scripts.\",\"settings.installedLua.loading\":\"Scanning for installed Lua scripts...\",\"settings.installedLua.modified\":\"Modified:\",\"settings.installedLua.title\":\"Games via LuaTools\",\"settings.installedLua.unknownInfo\":\"Games showing 'Unknown Game' were installed from external sources (not via LuaTools).\",\"settings.language.description\":\"Choose the language used by LuaTools.\",\"settings.language.label\":\"Language\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Loading settings...\",\"settings.morrenusApiKey.label\":\"Morrenus API Key\",\"settings.morrenusApiKey.description\":\"API Key required to use Sadie Source. Get from {link}\",\"settings.morrenusApiKey.placeholder\":\"Enter your API Key\",\"settings.noChanges\":\"No changes to save.\",\"settings.refresh\":\"Refresh\",\"settings.refreshing\":\"Refreshing...\",\"settings.save\":\"Save Settings\",\"settings.saveError\":\"Failed to save settings.\",\"settings.saveSuccess\":\"Settings saved successfully.\",\"settings.saving\":\"Saving...\",\"settings.search.clear\":\"Clear search\",\"settings.search.noResults\":\"No matches found\",\"settings.search.placeholder\":\"Search settings, games, fixes...\",\"settings.theme.description\":\"Choose the color theme for LuaTools interface.\",\"settings.theme.label\":\"Theme\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Unsaved changes\",\"settings.useSteamLanguage.description\":\"Use the Steam client's language instead of LuaTools setting.\",\"settings.useSteamLanguage.label\":\"Use Steam Language\",\"settings.useSteamLanguage.no\":\"No\",\"settings.useSteamLanguage.yes\":\"Yes\",\"{fix} applied successfully!\":\"{fix} applied successfully!\"}",
    "es": "{\"Add via LuaTools\":\"Añadir con LuaTools\",\"Advanced\":\"Avanzado\",\"All-In-One Fixes\":\"Fixes Todo-en-Uno\",\"Apply\":\"Aplicar\",\"Applying {fix}\":\"Aplicando {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"¿Seguro que quieres des-fixear? Esto eliminará los archivos del fix y verificará los archivos del juego.\",\"Are you sure?\":\"¿Estás seguro?\",\"Back\":\"Volver\",\"Base Game\":\"Juego Base\",\"Cancel\":\"Cancelar\",\"Cancellation failed\":\"La cancelación falló\",\"Cancelled\":\"Cancelado\",\"Cancelled by user\":\"Cancelado por el usuario\",\"Cancelled: {reason}\":\"Cancelado: {reason}\",\"Cancelling...\":\"Cancelando...\",\"Check for updates\":\"Buscar actualizaciones\",\"Checking availability…\":\"Comprobando disponibilidad…\",\"Checking content…\":\"Comprobando contenido…\",\"Checking generic fix...\":\"Buscando fix genérico...\",\"Checking key...\":\"Verificando clave...\",\"Checking online-fix...\":\"Buscando fix online...\",\"Checking…\":\"Verificando…\",\"Close\":\"Cerrar\",\"Confirm\":\"Confirmar\",\"Content details =>\":\"Detalles del contenido =>\",\"DLC Detected\":\"DLC Detectado\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"Los DLCs se añaden junto con el juego base. Para añadir este DLC, ve a la página del juego base: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Descartar\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Descargando...\",\"Downloading: {percent}%\":\"Descargando: {percent}%\",\"Downloading…\":\"Descargando…\",\"Error applying fix\":\"Error aplicando el fix\",\"Error checking for fixes\":\"Error comprobando fixes\",\"Error starting Online Fix\":\"Error al iniciar el Fix Online\",\"Error starting un-fix\":\"Error iniciando el des-fix\",\"Error! Code: {code}\":\"¡Error! Código: {code}\",\"Error, Code: {code}\":\"Error, Código: {code}\",\"Error, Timed Out\":\"Error, Tiempo de espera agotado\",\"Error: {error}\":\"Error: {error}\",\"Expires\":\"Expira\",\"Extracting to game folder...\":\"Extrayendo en la carpeta del juego...\",\"Failed\":\"Falló\",\"Failed to cancel fix download\":\"No se pudo cancelar la descarga del fix\",\"Failed to check for fixes.\":\"No se pudo comprobar si hay fixes.\",\"Failed to load free APIs.\":\"No se pudieron cargar las APIs gratuitas.\",\"Failed to start fix download\":\"No se pudo iniciar la descarga del fix\",\"Failed to start un-fix\":\"No se pudo iniciar el des-fix\",\"Failed to verify key\":\"Error al verificar la clave\",\"Failed: {error}\":\"Falló: {error}\",\"Fetch Free API's\":\"Obtener APIs gratuitas\",\"Fetching game name...\":\"Obteniendo nombre del juego...\",\"Finishing…\":\"Finalizando…\",\"Fixes Menu\":\"Menú de Fixes\",\"Found\":\"Encontrado\",\"Game Added!\":\"¡Juego añadido!\",\"Game added!\":\"¡Juego añadido!\",\"Game folder\":\"Carpeta del juego\",\"Game install path not found\":\"No se encontró la ruta de instalación del juego\",\"Game not found on any available API.\":\"Juego no encontrado en ninguna API disponible.\",\"Generic Fix\":\"Corrección Genérica\",\"Generic fix found!\":\"¡Fix genérico encontrado!\",\"Go to Base Game\":\"Ir al Juego Base\",\"Hide\":\"Ocultar\",\"Included\":\"Incluido\",\"Initializing download...\":\"Inicializando descarga...\",\"Installing…\":\"Instalando…\",\"Invalid Morrenus API Key format\":\"Formato de clave API de Morrenus inválido\",\"Invalid key format\":\"Formato de clave inválido\",\"Invalid or rejected key\":\"Clave inválida o rechazada\",\"Join the Discord!\":\"¡Únete al Discord!\",\"Left click to install, Right click for SteamDB\":\"Clic izquierdo para instalar, clic derecho para SteamDB\",\"Loaded free APIs: {count}\":\"APIs gratuitas cargadas: {count}\",\"Loading APIs...\":\"Cargando APIs...\",\"Loading fixes...\":\"Cargando fixes...\",\"Look for Fixes\":\"Buscar Fixes\",\"LuaTools backend unavailable\":\"Backend de LuaTools no disponible\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menú de Fixes AIO\",\"LuaTools · Added Games\":\"LuaTools · Juegos añadidos\",\"LuaTools · Fixes Menu\":\"LuaTools · Menú de Fixes\",\"LuaTools · Menu\":\"LuaTools · Menú\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Administrar juego\",\"Missing\":\"Falta\",\"No games found.\":\"No se encontraron juegos.\",\"No generic fix\":\"No hay fix genérico\",\"No online-fix\":\"No hay fix online.\",\"No updates available.\":\"No hay actualizaciones disponibles.\",\"No workshop for the game\":\"No hay workshop para el juego\",\"Not found\":\"No encontrado\",\"Online Fix\":\"Fix Online\",\"Online Fix (Unsteam)\":\"Fix Online (Unsteam)\",\"Online-fix found!\":\"¡Fix online encontrado!\",\"Only possible thanks to {name} 💜\":\"Solo es posible gracias a {name} 💜\",\"Proceed\":\"Continuar\",\"Processing package…\":\"Procesando paquete…\",\"Remove via LuaTools\":\"Eliminar con LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Se eliminaron {count} archivos. Ejecutando verificación de Steam...\",\"Removing fix files...\":\"Eliminando archivos del fix...\",\"Restart Steam\":\"Reiniciar Steam\",\"Restart Steam now?\":\"¿Reiniciar Steam ahora?\",\"Searching across sources...\":\"Buscando a través de las fuentes...\",\"Select Download Source\":\"Seleccionar Fuente de Descarga\",\"Settings\":\"Ajustes\",\"Skipped\":\"Omitido\",\"The game has been added successfully.\":\"El juego se ha añadido correctamente.\",\"This game may not work, support for it wont be given in our discord\":\"Este juego puede que no funcione, el soporte para él no será brindado en nuestro discord\",\"Un-Fix (verify game)\":\"Des-Fix (verificar juego)\",\"Un-Fixing game\":\"Des-fixeando el juego\",\"Unknown Game\":\"Juego desconocido\",\"Unknown error\":\"Error desconocido\",\"Usage\":\"Uso\",\"Verifying API limits...\":\"Verificando límites de API...\",\"Waiting…\":\"Esperando…\",\"Working…\":\"Trabajando…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Has excedido tu límite diario de descargas. Espera hasta mañana o mejora tu plan en el sitio web de Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Tu clave API de Morrenus es inválida o ha expirado. Revisa tu clave en los ajustes o genera una nueva en el sitio web de Morrenus.\",\"bigpicture.mouseTip\":\"Para usar el modo mouse en Steam: Botón guía + Joystick derecho, clic con RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Tipo de opción no soportado: {type}\",\"common.status.error\":\"Error\",\"common.status.loading\":\"Cargando...\",\"common.status.success\":\"Éxito\",\"common.translationMissing\":\"traducción faltante\",\"common.warning\":\"Advertencia\",\"days left\":\"días restantes\",\"disclaimer.inputLabel\":\"escribe \\\"Lo Entiendo\\\" en el cuadro de abajo para continuar\",\"disclaimer.inputPlaceholder\":\"Lo Entiendo\",\"disclaimer.line1\":\"LuaTools no tiene ninguna afiliación con Millennium\",\"disclaimer.line2\":\"Millennium NO te ofrecerá soporte para este plugin en su servidor de discord\",\"disclaimer.line3\":\"Serás BANEADO de los servidores de LuaTools y Millennium si vas a su discord a pedir ayuda\",\"disclaimer.title\":\"Aviso Importante\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Fix disponible\",\"gameStatus.playable\":\"Jugable\",\"gameStatus.unplayable\":\"No jugable\",\"menu.advancedLabel\":\"Avanzado\",\"menu.checkForUpdates\":\"Buscar actualizaciones\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Error al obtener la ruta del juego\",\"menu.error.noAppId\":\"No se pudo determinar el AppID del juego\",\"menu.error.noInstall\":\"No se encontró la instalación del juego\",\"menu.error.notInstalled\":\"¡Juego no instalado! Agrégalo e instálalo primero :D\",\"menu.fetchFreeApis\":\"Obtener APIs gratuitas\",\"menu.fixesMenu\":\"Menú de Fixes\",\"menu.joinDiscordLabel\":\"¡Únete al Discord!\",\"menu.manageGameLabel\":\"Administrar juego\",\"menu.remove.confirm\":\"¿Eliminar con LuaTools este juego?\",\"menu.remove.failure\":\"No se pudo eliminar LuaTools.\",\"menu.remove.success\":\"LuaTools eliminado para esta aplicación.\",\"menu.removeLuaTools\":\"Eliminar con LuaTools\",\"menu.settings\":\"Ajustes\",\"menu.title\":\"LuaTools · Menú\",\"settings.close\":\"Cerrar\",\"settings.donateKeys.description\":\"Dona claves de descifrado para juegos, ¡ayuda a todos! (No tiene ningun efecto negativo :) )\",\"settings.donateKeys.label\":\"Donar claves\",\"settings.donateKeys.no\":\"No\",\"settings.donateKeys.yes\":\"Sí\",\"settings.empty\":\"Aún no hay ajustes disponibles.\",\"settings.error\":\"No se pudieron cargar los ajustes.\",\"settings.fastDownload.description\":\"Elegir automáticamente la primera fuente disponible al añadir un juego.\",\"settings.fastDownload.label\":\"Descarga rápida\",\"settings.general\":\"General\",\"settings.generalDescription\":\"Preferencias globales de LuaTools.\",\"settings.installedFixes.date\":\"Instalado:\",\"settings.installedFixes.delete\":\"Eliminar\",\"settings.installedFixes.deleteConfirm\":\"¿Seguro que quieres eliminar este fix? Esto borrará los archivos del fix y ejecutará la verificación de Steam.\",\"settings.installedFixes.deleteError\":\"Error al eliminar el fix.\",\"settings.installedFixes.deleteSuccess\":\"¡Fix eliminado correctamente!\",\"settings.installedFixes.deleting\":\"Eliminando fix...\",\"settings.installedFixes.empty\":\"No hay fixes instalados aún.\",\"settings.installedFixes.error\":\"Error al cargar los fixes instalados.\",\"settings.installedFixes.files\":\"{count} archivos\",\"settings.installedFixes.loading\":\"Escaneando fixes instalados...\",\"settings.installedFixes.title\":\"Fixes Instalados\",\"settings.installedFixes.type\":\"Tipo:\",\"settings.installedLua.delete\":\"Eliminar\",\"settings.installedLua.deleteConfirm\":\"¿Eliminar con LuaTools este juego?\",\"settings.installedLua.deleteError\":\"Error al eliminar vía LuaTools.\",\"settings.installedLua.deleteSuccess\":\"¡Eliminado vía LuaTools correctamente!\",\"settings.installedLua.deleting\":\"Eliminando vía LuaTools...\",\"settings.installedLua.disabled\":\"Deshabilitado\",\"settings.installedLua.empty\":\"No hay scripts Lua instalados aún.\",\"settings.installedLua.error\":\"Error al cargar los scripts Lua instalados.\",\"settings.installedLua.loading\":\"Escaneando scripts Lua instalados...\",\"settings.installedLua.modified\":\"Modificado:\",\"settings.installedLua.title\":\"Juegos vía LuaTools\",\"settings.installedLua.unknownInfo\":\"Los juegos que muestran 'Juego desconocido' fueron instalados desde fuentes externas (no vía LuaTools).\",\"settings.language.description\":\"Elige el idioma utilizado por LuaTools.\",\"settings.language.label\":\"Idioma\",\"settings.language.option.en\":\"Inglés\",\"settings.language.option.pt-BR\":\"Portugués brasileño\",\"settings.loading\":\"Cargando ajustes...\",\"settings.noChanges\":\"No hay cambios para guardar.\",\"settings.refresh\":\"Actualizar\",\"settings.refreshing\":\"Actualizando...\",\"settings.save\":\"Guardar ajustes\",\"settings.saveError\":\"No se pudieron guardar los ajustes.\",\"settings.saveSuccess\":\"Ajustes guardados correctamente.\",\"settings.saving\":\"Guardando...\",\"settings.search.clear\":\"Limpiar búsqueda\",\"settings.search.noResults\":\"No se encontraron resultados\",\"settings.search.placeholder\":\"Buscar ajustes, juegos, fixes...\",\"settings.theme.description\":\"Elige el tema de color para la interfaz de LuaTools.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Ajustes\",\"settings.unsaved\":\"Cambios sin guardar\",\"settings.useSteamLanguage.description\":\"Usar el idioma del cliente de Steam en lugar de la configuración de LuaTools.\",\"settings.useSteamLanguage.label\":\"Usar Idioma de Steam\",\"settings.useSteamLanguage.no\":\"No\",\"settings.useSteamLanguage.yes\":\"Sí\",\"{fix} applied successfully!\":\"¡{fix} aplicado correctamente!\",\"settings.morrenusApiKey.label\":\"Llave API de Morrenus\",\"settings.morrenusApiKey.description\":\"Llave API necesaria para usar Sadie Source. Consíguela en {link}\",\"settings.morrenusApiKey.placeholder\":\"Introduce tu clave API\"}",
    "fi": "{\"Add via LuaTools\":\"Lisää LuaTools-työkalulla\",\"Advanced\":\"Lisäasetukset\",\"All-In-One Fixes\":\"Kaikki-yhdessä-korjaukset\",\"Apply\":\"Käytä\",\"Applying {fix}\":\"Otetaan käyttöön {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Haluatko varmasti poistaa korjauksen? Tämä poistaa korjaustiedostot ja vahvistaa pelitiedostot.\",\"Are you sure?\":\"Oletko varma?\",\"Back\":\"Takaisin\",\"Base Game\":\"Peruspeli\",\"Cancel\":\"Peruuta\",\"Cancellation failed\":\"Peruutus epäonnistui\",\"Cancelled\":\"Peruutettu\",\"Cancelled by user\":\"Käyttäjä peruutti\",\"Cancelled: {reason}\":\"Peruutettu: {reason}\",\"Cancelling...\":\"Peruutetaan...\",\"Check for updates\":\"Tarkista päivitykset\",\"Checking availability…\":\"Tarkistetaan saatavuutta…\",\"Checking content…\":\"Tarkistetaan sisältöä…\",\"Checking generic fix...\":\"Tarkistetaan yleistä korjausta...\",\"Checking key...\":\"Tarkistetaan avainta...\",\"Checking online-fix...\":\"Tarkistetaan verkkokorjausta...\",\"Checking…\":\"Tarkistetaan…\",\"Close\":\"Sulje\",\"Confirm\":\"Vahvista\",\"Content details =>\":\"Sisällön tiedot =>\",\"DLC Detected\":\"DLC havaittu\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC:t lisätään yhdessä peruspelin kanssa. Lisätäksesi korjauksia tälle DLC:lle, siirry peruspelin sivulle: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Ohita\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Ladataan...\",\"Downloading: {percent}%\":\"Ladataan: {percent}%\",\"Downloading…\":\"Ladataan…\",\"Error applying fix\":\"Virhe korjausta käyttöön otettaessa\",\"Error checking for fixes\":\"Virhe korjauksia tarkistettaessa\",\"Error starting Online Fix\":\"Virhe verkkokorjausta käynnistettäessä\",\"Error starting un-fix\":\"Virhe korjauksen poistoa käynnistettäessä\",\"Error! Code: {code}\":\"Virhe! Koodi: {code}\",\"Error, Code: {code}\":\"Virhe, Koodi: {code}\",\"Error, Timed Out\":\"Virhe, aikakatkaisu\",\"Error: {error}\":\"Virhe: {error}\",\"Expires\":\"Vanhenee\",\"Extracting to game folder...\":\"Puretaan pelikansioon...\",\"Failed\":\"Epäonnistui\",\"Failed to cancel fix download\":\"Korjauksen latauksen peruutus epäonnistui\",\"Failed to check for fixes.\":\"Korjausten tarkistus epäonnistui.\",\"Failed to load free APIs.\":\"Ilmaisten API-rajapintojen lataus epäonnistui.\",\"Failed to start fix download\":\"Korjauksen latauksen käynnistys epäonnistui\",\"Failed to start un-fix\":\"Korjauksen poiston käynnistys epäonnistui\",\"Failed to verify key\":\"Avaimen vahvistus epäonnistui\",\"Failed: {error}\":\"Epäonnistui: {error}\",\"Fetch Free API's\":\"Hae ilmaiset API-rajapinnat\",\"Fetching game name...\":\"Haetaan pelin nimeä...\",\"Finishing…\":\"Viimeistellään…\",\"Fixes Menu\":\"Korjausvalikko\",\"Found\":\"Löydetty\",\"Game Added!\":\"Peli lisätty!\",\"Game added!\":\"Peli lisätty!\",\"Game folder\":\"Pelikansio\",\"Game install path not found\":\"Pelin asennuspolkua ei löytynyt\",\"Game not found on any available API.\":\"Peliä ei löytynyt saatavilla olevista API:ista.\",\"Generic Fix\":\"Yleinen korjaus\",\"Generic fix found!\":\"Yleinen korjaus löydetty!\",\"Go to Base Game\":\"Siirry peruspeliin\",\"Hide\":\"Piilota\",\"Included\":\"Sisältyy\",\"Initializing download...\":\"Alustetaan latausta...\",\"Installing…\":\"Asennetaan…\",\"Invalid Morrenus API Key format\":\"Virheellinen Morrenus API-avaimen muoto\",\"Invalid key format\":\"Virheellinen avaimen muoto\",\"Invalid or rejected key\":\"Virheellinen tai hylätty avain\",\"Join the Discord!\":\"Liity Discord-palvelimelle!\",\"Left click to install, Right click for SteamDB\":\"Vasemmalla napsautuksella asennat, oikealla avaat SteamDB:n\",\"Loaded free APIs: {count}\":\"Ilmaisia API-rajapintoja ladattu: {count}\",\"Loading APIs...\":\"Ladataan API:ita...\",\"Loading fixes...\":\"Ladataan korjauksia...\",\"Look for Fixes\":\"Etsi korjauksia\",\"LuaTools backend unavailable\":\"LuaTools-taustajärjestelmä ei ole käytettävissä\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Lisätyt pelit\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Hallitse peliä\",\"Missing\":\"Puuttuu\",\"No games found.\":\"Pelejä ei löytynyt.\",\"No generic fix\":\"Ei yleistä korjausta\",\"No online-fix\":\"Ei verkkokorjausta\",\"No updates available.\":\"Ei saatavilla olevia päivityksiä.\",\"No workshop for the game\":\"Ei workshopia pelille\",\"Not found\":\"Ei löytynyt\",\"Online Fix\":\"Verkkokorjaus\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Verkkokorjaus löydetty!\",\"Only possible thanks to {name} 💜\":\"Mahdollista vain {name} ansiosta 💜\",\"Proceed\":\"Jatka\",\"Processing package…\":\"Käsitellään pakettia…\",\"Remove via LuaTools\":\"Poista LuaTools-työkalulla\",\"Removed {count} files. Running Steam verification...\":\"{count} tiedostoa poistettu. Suoritetaan Steam-vahvistus...\",\"Removing fix files...\":\"Poistetaan korjaustiedostoja...\",\"Restart Steam\":\"Käynnistä Steam uudelleen\",\"Restart Steam now?\":\"Käynnistetäänkö Steam uudelleen nyt?\",\"Searching across sources...\":\"Etsitään kaikista lähteistä...\",\"Select Download Source\":\"Valitse latauslähde\",\"Settings\":\"Asetukset\",\"Skipped\":\"Ohitettu\",\"The game has been added successfully.\":\"Peli on lisätty onnistuneesti.\",\"This game may not work, support for it wont be given in our discord\":\"Tämä peli ei välttämättä toimi, tukea sille ei anneta discordissamme\",\"Un-Fix (verify game)\":\"Poista korjaus (vahvista peli)\",\"Un-Fixing game\":\"Poistetaan pelin korjausta\",\"Unknown Game\":\"Tuntematon peli\",\"Unknown error\":\"Tuntematon virhe\",\"Usage\":\"Käyttö\",\"Verifying API limits...\":\"Tarkistetaan API-rajoja...\",\"Waiting…\":\"Odotetaan…\",\"Working…\":\"Työstetään…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Olet ylittänyt päivittäisen latausrajasi. Odota huomiseen tai päivitä suunnitelmasi Morrenus-sivustolla.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Morrenus API-avaimesi on virheellinen tai vanhentunut. Tarkista avaimesi asetuksista tai luo uusi Morrenus-sivustolla.\",\"bigpicture.mouseTip\":\"Vasemmalla napsautuksella asennat, oikealla avaat SteamDB:n\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Ei-tuettu valinta\",\"common.status.error\":\"Virhe\",\"common.status.loading\":\"Ladataan\",\"common.status.success\":\"Onnistui\",\"common.translationMissing\":\"käännös puuttuu\",\"common.warning\":\"Varoitus\",\"days left\":\"päivää jäljellä\",\"disclaimer.inputLabel\":\"Kirjoita \\\"Ymmärrän\\\" alla olevaan kenttään jatkaaksesi\",\"disclaimer.inputPlaceholder\":\"Ymmärrän\",\"disclaimer.line1\":\"Tämä työkalu tarjotaan sellaisenaan, ilman minkäänlaista takuuta.\",\"disclaimer.line2\":\"Käytä omalla vastuullasi. Emme ole vastuussa mistään vahingoista.\",\"disclaimer.line3\":\"Jatkamalla hyväksyt nämä ehdot.\",\"disclaimer.title\":\"Vastuuvapauslauseke\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Tarvitsee korjauksia\",\"gameStatus.playable\":\"Pelattava\",\"gameStatus.unplayable\":\"Ei pelattavissa\",\"menu.advancedLabel\":\"Lisäasetukset\",\"menu.checkForUpdates\":\"Tarkista päivitykset\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Pelin polun hakeminen epäonnistui\",\"menu.error.noAppId\":\"App ID:tä ei löytynyt\",\"menu.error.noInstall\":\"Asennuspolkua ei löytynyt\",\"menu.error.notInstalled\":\"Peliä ei ole asennettu\",\"menu.fetchFreeApis\":\"Hae ilmaiset API-rajapinnat\",\"menu.fixesMenu\":\"Korjausvalikko\",\"menu.joinDiscordLabel\":\"Liity Discord-palvelimelle\",\"menu.manageGameLabel\":\"Hallitse peliä\",\"menu.remove.confirm\":\"Haluatko varmasti poistaa tämän pelin LuaTools-työkalusta?\",\"menu.remove.failure\":\"Pelin poistaminen epäonnistui\",\"menu.remove.success\":\"Peli poistettu onnistuneesti\",\"menu.removeLuaTools\":\"Poista LuaTools-työkalulla\",\"menu.settings\":\"Asetukset\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Sulje\",\"settings.donateKeys.description\":\"Jaa käyttämättömät peliavaimet yhteisön hyväksi\",\"settings.donateKeys.label\":\"Lahjoita avaimia\",\"settings.donateKeys.no\":\"Ei\",\"settings.donateKeys.yes\":\"Kyllä\",\"settings.empty\":\"Ei asetuksia saatavilla\",\"settings.error\":\"Virhe asetusten lataamisessa\",\"settings.fastDownload.description\":\"Valitse automaattisesti ensimmäinen saatavilla oleva lähde peliä lisättäessä.\",\"settings.fastDownload.label\":\"Pikalataus\",\"settings.general\":\"Yleiset\",\"settings.generalDescription\":\"LuaTools-yleiset asetukset\",\"settings.installedFixes.date\":\"Päivämäärä\",\"settings.installedFixes.delete\":\"Poista\",\"settings.installedFixes.deleteConfirm\":\"Haluatko varmasti poistaa tämän korjauksen?\",\"settings.installedFixes.deleteError\":\"Virhe korjausta poistettaessa\",\"settings.installedFixes.deleteSuccess\":\"Korjaus poistettu onnistuneesti\",\"settings.installedFixes.deleting\":\"Poistetaan…\",\"settings.installedFixes.empty\":\"Ei asennettuja korjauksia\",\"settings.installedFixes.error\":\"Virhe asennettujen korjausten lataamisessa\",\"settings.installedFixes.files\":\"Tiedostot\",\"settings.installedFixes.loading\":\"Ladataan asennettuja korjauksia…\",\"settings.installedFixes.title\":\"Asennetut korjaukset\",\"settings.installedFixes.type\":\"Tyyppi\",\"settings.installedLua.delete\":\"Poista\",\"settings.installedLua.deleteConfirm\":\"Haluatko varmasti poistaa tämän Lua-skriptin?\",\"settings.installedLua.deleteError\":\"Virhe Lua-skriptiä poistettaessa\",\"settings.installedLua.deleteSuccess\":\"Lua-skripti poistettu onnistuneesti\",\"settings.installedLua.deleting\":\"Poistetaan…\",\"settings.installedLua.disabled\":\"Pois käytöstä\",\"settings.installedLua.empty\":\"Ei asennettuja Lua-skriptejä\",\"settings.installedLua.error\":\"Virhe Lua-skriptien lataamisessa\",\"settings.installedLua.loading\":\"Ladataan Lua-skriptejä…\",\"settings.installedLua.modified\":\"Muokattu\",\"settings.installedLua.title\":\"Asennetut Lua-skriptit\",\"settings.installedLua.unknownInfo\":\"Tietoja ei saatavilla\",\"settings.language.description\":\"Valitse LuaTools-käyttöliittymän kieli\",\"settings.language.label\":\"Kieli\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Ladataan…\",\"settings.noChanges\":\"Ei tallennettavia muutoksia\",\"settings.refresh\":\"Päivitä\",\"settings.refreshing\":\"Päivitetään…\",\"settings.save\":\"Tallenna\",\"settings.saveError\":\"Virhe asetusten tallentamisessa\",\"settings.saveSuccess\":\"Asetukset tallennettu onnistuneesti\",\"settings.saving\":\"Tallennetaan…\",\"settings.search.clear\":\"Tyhjennä\",\"settings.search.noResults\":\"Tuloksia ei löytynyt\",\"settings.search.placeholder\":\"Hae asetuksista…\",\"settings.theme.description\":\"Valitse LuaTools-käyttöliittymän teema\",\"settings.theme.label\":\"Teema\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Sinulla on tallentamattomia muutoksia\",\"settings.useSteamLanguage.description\":\"Käytä automaattisesti Steamissa asetettua kieltä\",\"settings.useSteamLanguage.label\":\"Käytä Steam-kieltä\",\"settings.useSteamLanguage.no\":\"Ei\",\"settings.useSteamLanguage.yes\":\"Kyllä\",\"{fix} applied successfully!\":\"{fix} otettu käyttöön onnistuneesti!\",\"settings.morrenusApiKey.label\":\"Morrenus API-avain\",\"settings.morrenusApiKey.description\":\"API-avain tarvitaan Sadie Sourcen käyttöön. Hanki osoitteesta {link}\",\"settings.morrenusApiKey.placeholder\":\"Syötä API-avaimesi\"}",
    "fr": "{\"Add via LuaTools\":\"Ajouter via LuaTools\",\"Advanced\":\"Avancé\",\"All-In-One Fixes\":\"Correctifs tout-en-un\",\"Apply\":\"Appliquer\",\"Applying {fix}\":\"Application de {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Êtes-vous sûr de vouloir supprimer le correctif ? Cela supprimera les fichiers de correctif et vérifiera les fichiers du jeu.\",\"Are you sure?\":\"Êtes-vous sûr ?\",\"Back\":\"Retour\",\"Base Game\":\"Jeu de base\",\"Cancel\":\"Annuler\",\"Cancellation failed\":\"Échec de l'annulation\",\"Cancelled\":\"Annulé\",\"Cancelled by user\":\"Annulé par l'utilisateur\",\"Cancelled: {reason}\":\"Annulé : {reason}\",\"Cancelling...\":\"Annulation...\",\"Check for updates\":\"Vérifier les mises à jour.\",\"Checking availability…\":\"Vérification de la disponibilité…\",\"Checking content…\":\"Vérification du contenu…\",\"Checking generic fix...\":\"Vérification du correctif générique...\",\"Checking key...\":\"Vérification de la clé...\",\"Checking online-fix...\":\"Vérification du correctif Online-Fix...\",\"Checking…\":\"Vérification…\",\"Close\":\"Fermer\",\"Confirm\":\"Confirmer\",\"Content details =>\":\"Détails du contenu =>\",\"DLC Detected\":\"DLC Détecté\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"Les DLC sont ajoutés avec le jeu de base. Pour ajouter des correctifs pour ce DLC, rendez-vous sur la page du jeu de base : <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Fermer\",\"Dlc: \":\"Dlc\",\"Downloading...\":\"Téléchargement...\",\"Downloading: {percent}%\":\"Téléchargement : {percent}%\",\"Downloading…\":\"Téléchargement…\",\"Error applying fix\":\"Erreur lors de l'application du correctif.\",\"Error checking for fixes\":\"Erreur lors de la vérification des correctifs.\",\"Error starting Online Fix\":\"Erreur lors du démarrage des correctifs Online-Fix.\",\"Error starting un-fix\":\"Erreur lors du démarrage de la suppression du correctif.\",\"Error! Code: {code}\":\"Erreur ! Code : {code}\",\"Error, Code: {code}\":\"Erreur, Code : {code}\",\"Error, Timed Out\":\"Erreur, Délai d'attente dépassé\",\"Error: {error}\":\"Erreur : {error}\",\"Expires\":\"Expire\",\"Extracting to game folder...\":\"Extraction vers le dossier du jeu...\",\"Failed\":\"Échec\",\"Failed to cancel fix download\":\"Échec de l'annulation du téléchargement du correctif.\",\"Failed to check for fixes.\":\"Échec de la vérification des correctifs.\",\"Failed to load free APIs.\":\"Échec du chargement des API gratuites.\",\"Failed to start fix download\":\"Échec du démarrage du téléchargement du correctif.\",\"Failed to start un-fix\":\"Échec du démarrage de la suppression du correctif.\",\"Failed to verify key\":\"Échec de la vérification de la clé\",\"Failed: {error}\":\"Échec : {error}\",\"Fetch Free API's\":\"Récupérer les API Gratuites.\",\"Fetching game name...\":\"Récupération du nom du jeu...\",\"Finishing…\":\"Finalisation…\",\"Fixes Menu\":\"Menu des correctifs\",\"Found\":\"Trouvé\",\"Game Added!\":\"Jeu ajouté !\",\"Game added!\":\"Jeu ajouté !\",\"Game folder\":\"Dossier du jeu\",\"Game install path not found\":\"Chemin d'installation du jeu introuvable.\",\"Game not found on any available API.\":\"Jeu non trouvé sur les API disponibles.\",\"Generic Fix\":\"Correctif Générique\",\"Generic fix found!\":\"Correctif générique trouvé !\",\"Go to Base Game\":\"Aller au jeu de base\",\"Hide\":\"Masquer\",\"Included\":\"Inclus\",\"Initializing download...\":\"Initialisation du téléchargement...\",\"Installing…\":\"Installation…\",\"Invalid Morrenus API Key format\":\"Format de clé API Morrenus invalide\",\"Invalid key format\":\"Format de clé invalide\",\"Invalid or rejected key\":\"Clé invalide ou rejetée\",\"Join the Discord!\":\"Rejoignez le Discord !\",\"Left click to install, Right click for SteamDB\":\"Clic gauche pour installer. Clic droit pour SteamDB.\",\"Loaded free APIs: {count}\":\"API gratuites chargées : {count}\",\"Loading APIs...\":\"Chargement des API...\",\"Loading fixes...\":\"Chargement des correctifs...\",\"Look for Fixes\":\"Rechercher des correctifs\",\"LuaTools backend unavailable\":\"Backend LuaTools indisponible.\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menu des correctifs tout-en-un\",\"LuaTools · Added Games\":\"LuaTools · Jeux ajoutés\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu des correctifs\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Gérer le jeu\",\"Missing\":\"Manquant\",\"No games found.\":\"Aucun jeux trouvé.\",\"No generic fix\":\"Aucun correctif générique\",\"No online-fix\":\"Aucun correctif Online-Fix\",\"No updates available.\":\"Aucune mise à jour disponible.\",\"No workshop for the game\":\"Pas de workshop pour le jeu\",\"Not found\":\"Introuvable\",\"Online Fix\":\"Correctif en ligne (Online-Fix)\",\"Online Fix (Unsteam)\":\"Correctif en ligne (Unsteam)\",\"Online-fix found!\":\"Online-Fix trouvé !\",\"Only possible thanks to {name} 💜\":\"Possible uniquement grâce à {name} 💜\",\"Proceed\":\"Continuer\",\"Processing package…\":\"Traitement du paquet…\",\"Remove via LuaTools\":\"Retirer via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} fichiers supprimés. Exécution de la vérification Steam...\",\"Removing fix files...\":\"Suppression des fichiers de correctif...\",\"Restart Steam\":\"Redémarrer Steam\",\"Restart Steam now?\":\"Redémarrer Steam maintenant ?\",\"Searching across sources...\":\"Recherche dans toutes les sources...\",\"Select Download Source\":\"Choisir la source de téléchargement\",\"Settings\":\"Paramètres\",\"Skipped\":\"Ignoré\",\"The game has been added successfully.\":\"Le jeu a été ajouté avec succès.\",\"This game may not work, support for it wont be given in our discord\":\"Ce jeu peut possiblement ne pas fonctionner, aucun support ne sera donné sur notre discord\",\"Un-Fix (verify game)\":\"Supprimer le correctif (vérifier le jeu)\",\"Un-Fixing game\":\"Suppression du correctif du jeu.\",\"Unknown Game\":\"Jeu Inconnu\",\"Unknown error\":\"Erreur inconnue\",\"Usage\":\"Utilisation\",\"Verifying API limits...\":\"Vérification des limites API...\",\"Waiting…\":\"En attente…\",\"Working…\":\"Travail en cours…\",\"Workshop: \":\"Workshop:\",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Vous avez dépassé votre limite de téléchargement quotidienne. Veuillez attendre demain ou mettre à niveau votre plan sur le site Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Votre clé API Morrenus est invalide ou expirée. Veuillez vérifier votre clé dans les paramètres ou en régénérer une sur le site Morrenus.\",\"bigpicture.mouseTip\":\"Pour utiliser le mode souris dans Steam : Bouton Guide + Joystick droit, clic avec RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Type d'option non pris en charge : {type}\",\"common.status.error\":\"Erreur\",\"common.status.loading\":\"Chargement...\",\"common.status.success\":\"Succès\",\"common.translationMissing\":\"Traduction manquante\",\"common.warning\":\"Avertissement\",\"days left\":\"jours restants\",\"disclaimer.inputLabel\":\"tapez \\\"Je Comprends\\\" dans la case ci-dessous pour continuer\",\"disclaimer.inputPlaceholder\":\"Je Comprends\",\"disclaimer.line1\":\"LuaTools n'est affilié d'aucune façon à Millennium\",\"disclaimer.line2\":\"Millennium ne vous offrira PAS de support pour ce plugin sur leur serveur discord\",\"disclaimer.line3\":\"Vous serez BANNI des serveurs LuaTools et Millennium si vous allez sur leur discord demander de l'aide\",\"disclaimer.title\":\"Avis Important\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Correctif disponible\",\"gameStatus.playable\":\"Jouable\",\"gameStatus.unplayable\":\"Injouable\",\"menu.advancedLabel\":\"Avancé\",\"menu.checkForUpdates\":\"Vérifier les mises à jour\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Erreur lors de la récupération du chemin du jeu.\",\"menu.error.noAppId\":\"Impossible de déterminer l'AppID du jeu.\",\"menu.error.noInstall\":\"Impossible de trouver l'installation du jeu.\",\"menu.error.notInstalled\":\"Jeu non installé ! Ajoutez-le et installez-le d'abord :D\",\"menu.fetchFreeApis\":\"Récupérer les API Gratuites\",\"menu.fixesMenu\":\"Menu des correctifs\",\"menu.joinDiscordLabel\":\"Rejoignez le Discord !\",\"menu.manageGameLabel\":\"Gérer le Jeu\",\"menu.remove.confirm\":\"Retirer LuaTools pour ce jeu ?\",\"menu.remove.failure\":\"Échec du retrait de LuaTools.\",\"menu.remove.success\":\"LuaTools retiré pour cette application.\",\"menu.removeLuaTools\":\"Retirer via LuaTools\",\"menu.settings\":\"Paramètres\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Fermer\",\"settings.donateKeys.description\":\"Faire don des clés de décryptage pour les jeux, aide tout le monde !\",\"settings.donateKeys.label\":\"Faire don de clés\",\"settings.donateKeys.no\":\"Non\",\"settings.donateKeys.yes\":\"Oui\",\"settings.empty\":\"Aucun paramètre disponible pour le moment.\",\"settings.error\":\"Échec du chargement des paramètres.\",\"settings.fastDownload.description\":\"Choisir automatiquement la première source disponible lors de l'ajout d'un jeu.\",\"settings.fastDownload.label\":\"Téléchargement rapide\",\"settings.general\":\"Général\",\"settings.generalDescription\":\"Préférences globales de LuaTools.\",\"settings.installedFixes.date\":\"Installé :\",\"settings.installedFixes.delete\":\"Supprimer\",\"settings.installedFixes.deleteConfirm\":\"Êtes-vous sûr de vouloir supprimer ce correctif ? Cela supprimera les fichiers du correctif et exécutera la vérification Steam.\",\"settings.installedFixes.deleteError\":\"Échec de la suppression du correctif.\",\"settings.installedFixes.deleteSuccess\":\"Correctif supprimé avec succès !\",\"settings.installedFixes.deleting\":\"Suppression du correctif...\",\"settings.installedFixes.empty\":\"Aucun correctif installé pour le moment.\",\"settings.installedFixes.error\":\"Échec du chargement des correctifs installés.\",\"settings.installedFixes.files\":\"{count} fichiers\",\"settings.installedFixes.loading\":\"Recherche de correctifs installés...\",\"settings.installedFixes.title\":\"Correctifs Installés\",\"settings.installedFixes.type\":\"Type :\",\"settings.installedLua.delete\":\"Supprimer\",\"settings.installedLua.deleteConfirm\":\"Supprimer via LuaTools pour ce jeu ?\",\"settings.installedLua.deleteError\":\"Échec de la suppression via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Supprimé via LuaTools avec succès !\",\"settings.installedLua.deleting\":\"Suppression via LuaTools...\",\"settings.installedLua.disabled\":\"Désactivé\",\"settings.installedLua.empty\":\"Aucun script Lua installé pour le moment.\",\"settings.installedLua.error\":\"Échec du chargement des scripts Lua installés.\",\"settings.installedLua.loading\":\"Recherche de scripts Lua installés...\",\"settings.installedLua.modified\":\"Modifié :\",\"settings.installedLua.title\":\"Jeux via LuaTools\",\"settings.installedLua.unknownInfo\":\"Les jeux affichant 'Jeu inconnu' ont été installés depuis des sources externes (pas via LuaTools).\",\"settings.language.description\":\"Choisissez la langue utilisée par LuaTools.\",\"settings.language.label\":\"Langue\",\"settings.language.option.en\":\"Anglais\",\"settings.language.option.pt-BR\":\"Portugais Brésilien\",\"settings.loading\":\"Chargement des paramètres...\",\"settings.noChanges\":\"Aucune modification à enregistrer.\",\"settings.refresh\":\"Actualiser\",\"settings.refreshing\":\"Actualisation...\",\"settings.save\":\"Enregistrer les paramètres\",\"settings.saveError\":\"Échec de l'enregistrement des paramètres.\",\"settings.saveSuccess\":\"Paramètres enregistrés avec succès.\",\"settings.saving\":\"Enregistrement...\",\"settings.search.clear\":\"Effacer la recherche\",\"settings.search.noResults\":\"Aucun résultat trouvé\",\"settings.search.placeholder\":\"Rechercher paramètres, jeux, correctifs...\",\"settings.theme.description\":\"Choisissez le thème de couleur pour l'interface LuaTools.\",\"settings.theme.label\":\"Thème\",\"settings.title\":\"LuaTools · Paramètres\",\"settings.unsaved\":\"Modifications non enregistrées\",\"settings.useSteamLanguage.description\":\"Utiliser la langue du client Steam au lieu de celle de LuaTools.\",\"settings.useSteamLanguage.label\":\"Utiliser la langue de Steam\",\"settings.useSteamLanguage.no\":\"Non\",\"settings.useSteamLanguage.yes\":\"Oui\",\"{fix} applied successfully!\":\"{fix} appliqué avec succès !\",\"settings.morrenusApiKey.label\":\"Clé API Morrenus\",\"settings.morrenusApiKey.description\":\"Clé API requise pour utiliser Sadie Source. Obtenez-la sur {link}\",\"settings.morrenusApiKey.placeholder\":\"Entrez votre clé API\"}",
    "he": "{\"Add via LuaTools\":\"הוסף דרך LuaTools\",\"Advanced\":\"מתקדם\",\"All-In-One Fixes\":\"תיקונים כוללים\",\"Apply\":\"החל\",\"Applying {fix}\":\"מחיל {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"האם אתה בטוח שברצונך להסיר תיקון? זה יסיר קבצי תיקון ויאמת קבצי משחק.\",\"Are you sure?\":\"האם אתה בטוח?\",\"Back\":\"חזרה\",\"Base Game\":\"משחק בסיס\",\"Cancel\":\"בטל\",\"Cancellation failed\":\"הביטול נכשל\",\"Cancelled\":\"בוטל\",\"Cancelled by user\":\"בוטל על ידי המשתמש\",\"Cancelled: {reason}\":\"בוטל: {reason}\",\"Cancelling...\":\"מבטל...\",\"Check for updates\":\"בדוק עדכונים\",\"Checking availability…\":\"בודק זמינות…\",\"Checking content…\":\"בודק תוכן…\",\"Checking generic fix...\":\"בודק תיקון כללי...\",\"Checking key...\":\"בודק מפתח...\",\"Checking online-fix...\":\"בודק online-fix...\",\"Checking…\":\"בודק…\",\"Close\":\"סגור\",\"Confirm\":\"אשר\",\"Content details =>\":\"פרטי תוכן =>\",\"DLC Detected\":\"DLC זוהה\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLCs מתווספים יחד עם משחק הבסיס. להוספת תיקונים עבור DLC זה, עבור לדף משחק הבסיס: <br><br><b>{gameName}</b>\",\"Discord\":\"דיסקורד\",\"Dismiss\":\"סגור\",\"Dlc: \":\"תוכן נוסף: \",\"Downloading...\":\"מוריד...\",\"Downloading: {percent}%\":\"מוריד: {percent}%\",\"Downloading…\":\"מוריד…\",\"Error applying fix\":\"שגיאה בהחלת תיקון\",\"Error checking for fixes\":\"שגיאה בבדיקת תיקונים\",\"Error starting Online Fix\":\"שגיאה בהפעלת Online Fix\",\"Error starting un-fix\":\"שגיאה בהתחלת הסרת תיקון\",\"Error! Code: {code}\":\"שגיאה! קוד: {code}\",\"Error, Code: {code}\":\"שגיאה, קוד: {code}\",\"Error, Timed Out\":\"שגיאה, פג הזמן\",\"Error: {error}\":\"שגיאה: {error}\",\"Expires\":\"פג תוקף\",\"Extracting to game folder...\":\"מחלץ לתיקיית המשחק...\",\"Failed\":\"נכשל\",\"Failed to cancel fix download\":\"נכשל בביטול הורדת התיקון\",\"Failed to check for fixes.\":\"נכשל בבדיקת תיקונים.\",\"Failed to load free APIs.\":\"נכשל בטעינת ה-API החינמיים.\",\"Failed to start fix download\":\"נכשל בהתחלת הורדת התיקון\",\"Failed to start un-fix\":\"נכשל בהתחלת הסרת התיקון\",\"Failed to verify key\":\"אימות המפתח נכשל\",\"Failed: {error}\":\"נכשל: {error}\",\"Fetch Free API's\":\"טען API חינמיים\",\"Fetching game name...\":\"מביא שם משחק...\",\"Finishing…\":\"מסיים…\",\"Fixes Menu\":\"תפריט תיקונים\",\"Found\":\"נמצא\",\"Game Added!\":\"המשחק נוסף!\",\"Game added!\":\"משחק נוסף!\",\"Game folder\":\"תיקיית משחק\",\"Game install path not found\":\"נתיב התקנת המשחק לא נמצא\",\"Game not found on any available API.\":\"המשחק לא נמצא באף API זמין.\",\"Generic Fix\":\"תיקון כללי\",\"Generic fix found!\":\"תיקון כללי נמצא!\",\"Go to Base Game\":\"עבור למשחק הבסיס\",\"Hide\":\"הסתר\",\"Included\":\"כלול\",\"Initializing download...\":\"מאתחל הורדה...\",\"Installing…\":\"מתקין…\",\"Invalid Morrenus API Key format\":\"פורמט מפתח API של Morrenus לא תקין\",\"Invalid key format\":\"פורמט מפתח לא תקין\",\"Invalid or rejected key\":\"מפתח לא תקין או נדחה\",\"Join the Discord!\":\"הצטרף ל-Discord!\",\"Left click to install, Right click for SteamDB\":\"לחץ שמאל להתקנה, לחץ ימין ל-SteamDB\",\"Loaded free APIs: {count}\":\"API חינמיים נטענו: {count}\",\"Loading APIs...\":\"טוען ממשקי API...\",\"Loading fixes...\":\"טוען תיקונים...\",\"Look for Fixes\":\"חפש תיקונים\",\"LuaTools backend unavailable\":\"השרת האחורי של LuaTools לא זמין\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · תפריט תיקוני AIO\",\"LuaTools · Added Games\":\"LuaTools · משחקים שנוספו\",\"LuaTools · Fixes Menu\":\"LuaTools · תפריט תיקונים\",\"LuaTools · Menu\":\"LuaTools · תפריט\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"נהל משחק\",\"Missing\":\"חסר\",\"No games found.\":\"לא נמצאו משחקים.\",\"No generic fix\":\"אין תיקון כללי\",\"No online-fix\":\"אין online-fix\",\"No updates available.\":\"אין עדכונים זמינים.\",\"No workshop for the game\":\"אין סדנה למשחק\",\"Not found\":\"לא נמצא\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"online-fix נמצא!\",\"Only possible thanks to {name} 💜\":\"אפשרי רק בזכות {name} 💜\",\"Proceed\":\"המשך\",\"Processing package…\":\"מעבד חבילה…\",\"Remove via LuaTools\":\"הסר דרך LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} קבצים הוסרו. כעת מבוצע אימות Steam...\",\"Removing fix files...\":\"מסיר קבצי תיקון...\",\"Restart Steam\":\"הפעל מחדש את Steam\",\"Restart Steam now?\":\"הפעל מחדש את Steam עכשיו?\",\"Searching across sources...\":\"מחפש בכל המקורות...\",\"Select Download Source\":\"בחר מקור הורדה\",\"Settings\":\"הגדרות\",\"Skipped\":\"דולג\",\"The game has been added successfully.\":\"המשחק נוסף בהצלחה.\",\"This game may not work, support for it wont be given in our discord\":\"ייתכן שהמשחק לא יעבוד, לא יינתן לו תמיכה בדיסקורד שלנו\",\"Un-Fix (verify game)\":\"הסר תיקון (אמת משחק)\",\"Un-Fixing game\":\"מסיר תיקון משחק\",\"Unknown Game\":\"משחק לא ידוע\",\"Unknown error\":\"שגיאה לא ידועה\",\"Usage\":\"שימוש\",\"Verifying API limits...\":\"בודק מגבלות API...\",\"Waiting…\":\"ממתין…\",\"Working…\":\"עובד…\",\"Workshop: \":\"סדנה: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"חרגת ממגבלת ההורדות היומית. המתן עד מחר או שדרג את התוכנית שלך באתר Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"מפתח ה-API של Morrenus שלך לא תקין או פג תוקפו. בדוק את המפתח בהגדרות או צור מפתח חדש באתר Morrenus.\",\"bigpicture.mouseTip\":\"לשימוש במצב עכבר ב-Steam: כפתור Guide + ג'ויסטיק ימני, לחיצה עם RB\",\"common.alert.ok\":\"אישור\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"סוג אפשרות לא נתמך: {type}\",\"common.status.error\":\"שגיאה\",\"common.status.loading\":\"טוען...\",\"common.status.success\":\"הצלחה\",\"common.translationMissing\":\"תרגום חסר\",\"common.warning\":\"אזהרה\",\"days left\":\"ימים נותרו\",\"disclaimer.inputLabel\":\"הקלד \\\"אני מבין\\\" בתיבה למטה כדי להמשיך\",\"disclaimer.inputPlaceholder\":\"אני מבין\",\"disclaimer.line1\":\"LuaTools אינו קשור בשום אופן ל-Millennium\",\"disclaimer.line2\":\"Millennium לא יציע לך תמיכה עבור תוסף זה בשרת הדיסקורד שלהם\",\"disclaimer.line3\":\"תיחסם מהשרתים של LuaTools ו-Millennium אם תלך לדיסקורד שלהם לבקש עזרה\",\"disclaimer.title\":\"הודעה חשובה\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"תיקון זמין\",\"gameStatus.playable\":\"ניתן לשחק\",\"gameStatus.unplayable\":\"לא ניתן לשחק\",\"menu.advancedLabel\":\"אפשרויות מתקדמות\",\"menu.checkForUpdates\":\"בדוק עדכונים\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"שגיאה בקבלת נתיב המשחק\",\"menu.error.noAppId\":\"לא ניתן לקבוע את מזהה המשחק\",\"menu.error.noInstall\":\"לא ניתן למצוא את התקנת המשחק\",\"menu.error.notInstalled\":\"המשחק לא מותקן! הוסף והתקן אותו קודם :D\",\"menu.fetchFreeApis\":\"טען ממשקי API חינמיים\",\"menu.fixesMenu\":\"תפריט תיקונים\",\"menu.joinDiscordLabel\":\"הצטרף ל-Discord!\",\"menu.manageGameLabel\":\"נהל משחק\",\"menu.remove.confirm\":\"הסר LuaTools למשחק הזה?\",\"menu.remove.failure\":\"הסרת LuaTools נכשלה.\",\"menu.remove.success\":\"LuaTools הוסר ליישום הזה.\",\"menu.removeLuaTools\":\"הסר דרך LuaTools\",\"menu.settings\":\"הגדרות\",\"menu.title\":\"LuaTools · תפריט\",\"settings.close\":\"סגור\",\"settings.donateKeys.description\":\"אפשר ל-LuaTools לתרום מפתחות Steam מיותרים.\",\"settings.donateKeys.label\":\"תרומת מפתחות\",\"settings.donateKeys.no\":\"לא\",\"settings.donateKeys.yes\":\"כן\",\"settings.empty\":\"אין הגדרות זמינות עדיין.\",\"settings.error\":\"נכשל בטעינת ההגדרות.\",\"settings.fastDownload.description\":\"בחר אוטומטית את המקור הראשון הזמין בעת הוספת משחק.\",\"settings.fastDownload.label\":\"הורדה מהירה\",\"settings.general\":\"כללי\",\"settings.generalDescription\":\"העדפות גלובליות של LuaTools.\",\"settings.installedFixes.date\":\"הותקן:\",\"settings.installedFixes.delete\":\"מחק\",\"settings.installedFixes.deleteConfirm\":\"האם אתה בטוח שברצונך להסיר תיקון זה? זה ימחק את קבצי התיקון ויריץ אימות Steam.\",\"settings.installedFixes.deleteError\":\"נכשל בהסרת התיקון.\",\"settings.installedFixes.deleteSuccess\":\"תיקון הוסר בהצלחה!\",\"settings.installedFixes.deleting\":\"מסיר תיקון...\",\"settings.installedFixes.empty\":\"אין תיקונים מותקנים עדיין.\",\"settings.installedFixes.error\":\"נכשל בטעינת התיקונים המותקנים.\",\"settings.installedFixes.files\":\"{count} קבצים\",\"settings.installedFixes.loading\":\"סורק תיקונים מותקנים...\",\"settings.installedFixes.title\":\"תיקונים מותקנים\",\"settings.installedFixes.type\":\"סוג:\",\"settings.installedLua.delete\":\"הסר\",\"settings.installedLua.deleteConfirm\":\"הסר דרך LuaTools למשחק זה?\",\"settings.installedLua.deleteError\":\"נכשל בהסרה דרך LuaTools.\",\"settings.installedLua.deleteSuccess\":\"הוסר דרך LuaTools בהצלחה!\",\"settings.installedLua.deleting\":\"מסיר דרך LuaTools...\",\"settings.installedLua.disabled\":\"מושבת\",\"settings.installedLua.empty\":\"אין סקריפטים Lua מותקנים עדיין.\",\"settings.installedLua.error\":\"נכשל בטעינת הסקריפטים Lua המותקנים.\",\"settings.installedLua.loading\":\"סורק סקריפטים Lua מותקנים...\",\"settings.installedLua.modified\":\"שונה:\",\"settings.installedLua.title\":\"משחקים דרך LuaTools\",\"settings.installedLua.unknownInfo\":\"משחקים המציגים 'משחק לא ידוע' הותקנו ממקורות חיצוניים (לא דרך LuaTools).\",\"settings.language.description\":\"בחר את השפה שבה LuaTools ישתמש.\",\"settings.language.label\":\"שפה\",\"settings.language.option.en\":\"אנגלית\",\"settings.language.option.pt-BR\":\"פורטוגזית ברזילאית\",\"settings.loading\":\"טוען הגדרות...\",\"settings.noChanges\":\"אין שינויים לשמירה.\",\"settings.refresh\":\"רענון\",\"settings.refreshing\":\"מרענן...\",\"settings.save\":\"שמור הגדרות\",\"settings.saveError\":\"נכשל בשמירת ההגדרות.\",\"settings.saveSuccess\":\"ההגדרות נשמרו בהצלחה.\",\"settings.saving\":\"שומר...\",\"settings.search.clear\":\"נקה חיפוש\",\"settings.search.noResults\":\"לא נמצאו תוצאות\",\"settings.search.placeholder\":\"חפש הגדרות, משחקים, תיקונים...\",\"settings.theme.description\":\"בחר נושא צבעים לממשק LuaTools.\",\"settings.theme.label\":\"נושא\",\"settings.title\":\"LuaTools · הגדרות\",\"settings.unsaved\":\"שינויים שלא נשמרו\",\"settings.useSteamLanguage.description\":\"השתמש בשפת הלקוח של Steam במקום בהגדרת LuaTools.\",\"settings.useSteamLanguage.label\":\"השתמש בשפת Steam\",\"settings.useSteamLanguage.no\":\"לא\",\"settings.useSteamLanguage.yes\":\"כן\",\"{fix} applied successfully!\":\"{fix} הוחל בהצלחה!\",\"settings.morrenusApiKey.label\":\"מפתח API של מورנוס\",\"settings.morrenusApiKey.description\":\"מפתח API נדרש לשימוש ב-Sadie Source. קבל אותו מ-{link}\",\"settings.morrenusApiKey.placeholder\":\"הזן את מפתח ה-API שלך\"}",
    "hu": "{\"Add via LuaTools\":\"Hozzáadás LuaTools-szal\",\"Advanced\":\"Haladó\",\"All-In-One Fixes\":\"Minden-az-egyben javítások\",\"Apply\":\"Alkalmaz\",\"Applying {fix}\":\"{fix} alkalmazása\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Biztosan visszavonod a javítást? Ez törli a javítófájlokat és ellenőrzi a játékfájlokat.\",\"Are you sure?\":\"Biztosan?\",\"Back\":\"Vissza\",\"Base Game\":\"Alapjáték\",\"Cancel\":\"Mégse\",\"Cancellation failed\":\"A megszakítás sikertelen\",\"Cancelled\":\"Megszakítva\",\"Cancelled by user\":\"Felhasználó által megszakítva\",\"Cancelled: {reason}\":\"Megszakítva: {reason}\",\"Cancelling...\":\"Megszakítás...\",\"Check for updates\":\"Frissítések keresése\",\"Checking availability…\":\"Elérhetőség ellenőrzése…\",\"Checking content…\":\"Tartalom ellenőrzése…\",\"Checking generic fix...\":\"Általános javítás ellenőrzése...\",\"Checking key...\":\"Kulcs ellenőrzése...\",\"Checking online-fix...\":\"Online-fix ellenőrzése...\",\"Checking…\":\"Ellenőrzés…\",\"Close\":\"Bezárás\",\"Confirm\":\"Megerősítés\",\"Content details =>\":\"Tartalom részletei =>\",\"DLC Detected\":\"DLC észlelve\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"A DLC-k az alapjátékkal együtt kerülnek hozzáadásra. A DLC javításához kérjük, lépj az alapjáték oldalára: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Elvetés\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Letöltés...\",\"Downloading: {percent}%\":\"Letöltés: {percent}%\",\"Downloading…\":\"Letöltés…\",\"Error applying fix\":\"Hiba a javítás alkalmazásakor\",\"Error checking for fixes\":\"Hiba a javítások keresésekor\",\"Error starting Online Fix\":\"Hiba az Online Fix indításakor\",\"Error starting un-fix\":\"Hiba a javítás visszavonásakor\",\"Error! Code: {code}\":\"Hiba! Kód: {code}\",\"Error, Code: {code}\":\"Hiba, Kód: {code}\",\"Error, Timed Out\":\"Hiba, időtúllépés\",\"Error: {error}\":\"Hiba: {error}\",\"Expires\":\"Lejár\",\"Extracting to game folder...\":\"Kibontás a játékmappába...\",\"Failed\":\"Sikertelen\",\"Failed to cancel fix download\":\"A javítás letöltésének megszakítása sikertelen\",\"Failed to check for fixes.\":\"A javítások keresése sikertelen.\",\"Failed to load free APIs.\":\"Az ingyenes API-k betöltése sikertelen.\",\"Failed to start fix download\":\"A javítás letöltésének indítása sikertelen\",\"Failed to start un-fix\":\"A javítás visszavonásának indítása sikertelen\",\"Failed to verify key\":\"A kulcs ellenőrzése sikertelen\",\"Failed: {error}\":\"Sikertelen: {error}\",\"Fetch Free API's\":\"Ingyenes API-k lekérése\",\"Fetching game name...\":\"Játék nevének lekérése...\",\"Finishing…\":\"Befejezés…\",\"Fixes Menu\":\"Javítások menü\",\"Found\":\"Megtalálva\",\"Game Added!\":\"Játék hozzáadva!\",\"Game added!\":\"Játék hozzáadva!\",\"Game folder\":\"Játékmappa\",\"Game install path not found\":\"A játék telepítési útvonala nem található\",\"Game not found on any available API.\":\"A játék nem található egyetlen elérhető API-n sem.\",\"Generic Fix\":\"Általános javítás\",\"Generic fix found!\":\"Általános javítás megtalálva!\",\"Go to Base Game\":\"Ugrás az alapjátékra\",\"Hide\":\"Elrejtés\",\"Included\":\"Tartalmazza\",\"Initializing download...\":\"Letöltés inicializálása...\",\"Installing…\":\"Telepítés…\",\"Invalid Morrenus API Key format\":\"Érvénytelen Morrenus API kulcs formátum\",\"Invalid key format\":\"Érvénytelen kulcs formátum\",\"Invalid or rejected key\":\"Érvénytelen vagy elutasított kulcs\",\"Join the Discord!\":\"Csatlakozz a Discord-hoz!\",\"Left click to install, Right click for SteamDB\":\"Bal klikk a telepítéshez, jobb klikk a SteamDB-hez\",\"Loaded free APIs: {count}\":\"Betöltött ingyenes API-k: {count}\",\"Loading APIs...\":\"API-k betöltése...\",\"Loading fixes...\":\"Javítások betöltése...\",\"Look for Fixes\":\"Javítások keresése\",\"LuaTools backend unavailable\":\"LuaTools háttérszolgáltatás nem elérhető\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Hozzáadott játékok\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Játék kezelése\",\"Missing\":\"Hiányzik\",\"No games found.\":\"Nem találhatók játékok.\",\"No generic fix\":\"Nincs általános javítás\",\"No online-fix\":\"Nincs online-fix\",\"No updates available.\":\"Nincsenek elérhető frissítések.\",\"No workshop for the game\":\"Nincs workshop a játékhoz\",\"Not found\":\"Nem található\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix megtalálva!\",\"Only possible thanks to {name} 💜\":\"Csak {name} jóvoltából lehetséges 💜\",\"Proceed\":\"Tovább\",\"Processing package…\":\"Csomag feldolgozása…\",\"Remove via LuaTools\":\"Eltávolítás LuaTools-szal\",\"Removed {count} files. Running Steam verification...\":\"{count} fájl eltávolítva. Steam ellenőrzés futtatása...\",\"Removing fix files...\":\"Javítófájlok eltávolítása...\",\"Restart Steam\":\"Steam újraindítása\",\"Restart Steam now?\":\"Újraindítod a Steam-et most?\",\"Searching across sources...\":\"Keresés a források között...\",\"Select Download Source\":\"Letöltési forrás kiválasztása\",\"Settings\":\"Beállítások\",\"Skipped\":\"Kihagyva\",\"The game has been added successfully.\":\"A játék sikeresen hozzáadva.\",\"This game may not work, support for it wont be given in our discord\":\"Ez a játék esetleg nem működik, támogatást nem adunk hozzá a discordunkon\",\"Un-Fix (verify game)\":\"Javítás visszavonása (játék ellenőrzése)\",\"Un-Fixing game\":\"Javítás visszavonása\",\"Unknown Game\":\"Ismeretlen játék\",\"Unknown error\":\"Ismeretlen hiba\",\"Usage\":\"Használat\",\"Verifying API limits...\":\"API korlátok ellenőrzése...\",\"Waiting…\":\"Várakozás…\",\"Working…\":\"Feldolgozás…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Túllépted a napi letöltési limitet. Várj holnapig vagy frissítsd a terved a Morrenus weboldalán.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"A Morrenus API kulcsod érvénytelen vagy lejárt. Ellenőrizd a kulcsot a beállításokban vagy generálj újat a Morrenus weboldalán.\",\"bigpicture.mouseTip\":\"Az egér mód használatához Steam-ben: Guide gomb + Jobb kar, kattintás RB-vel\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Nem támogatott opció típus: {type}\",\"common.status.error\":\"Hiba\",\"common.status.loading\":\"Betöltés...\",\"common.status.success\":\"Sikeres\",\"common.translationMissing\":\"fordítás hiányzik\",\"common.warning\":\"Figyelmeztetés\",\"days left\":\"nap van hátra\",\"disclaimer.inputLabel\":\"Írd be az alábbi mezőbe, hogy \\\"Megértettem\\\" a folytatáshoz\",\"disclaimer.inputPlaceholder\":\"Megértettem\",\"disclaimer.line1\":\"A LuaTools semmilyen módon nem áll kapcsolatban a Millennium-mal\",\"disclaimer.line2\":\"A Millennium NEM nyújt támogatást ehhez a bővítményhez a Discord szerverükön\",\"disclaimer.line3\":\"KI LESZEL TILTVA mind a LuaTools, mind a Millennium szervereiről, ha a Discord-jukon kérsz segítséget\",\"disclaimer.title\":\"Fontos figyelmeztetés\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Javítás elérhető\",\"gameStatus.playable\":\"Játszható\",\"gameStatus.unplayable\":\"Nem játszható\",\"menu.advancedLabel\":\"Haladó\",\"menu.checkForUpdates\":\"Frissítések keresése\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Hiba a játék útvonalának lekérésekor\",\"menu.error.noAppId\":\"Nem sikerült meghatározni a játék AppID-ját\",\"menu.error.noInstall\":\"Nem található a játék telepítése\",\"menu.error.notInstalled\":\"A játék nincs telepítve! Előbb add hozzá és telepítsd :D\",\"menu.fetchFreeApis\":\"Ingyenes API-k lekérése\",\"menu.fixesMenu\":\"Javítások menü\",\"menu.joinDiscordLabel\":\"Csatlakozz a Discord-hoz!\",\"menu.manageGameLabel\":\"Játék kezelése\",\"menu.remove.confirm\":\"Eltávolítod a LuaTools-t ehhez a játékhoz?\",\"menu.remove.failure\":\"A LuaTools eltávolítása sikertelen.\",\"menu.remove.success\":\"LuaTools eltávolítva ehhez az alkalmazáshoz.\",\"menu.removeLuaTools\":\"Eltávolítás LuaTools-szal\",\"menu.settings\":\"Beállítások\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Bezárás\",\"settings.donateKeys.description\":\"Visszafejtési kulcsok felajánlása játékokhoz, ezzel mindenkin segítesz!\",\"settings.donateKeys.label\":\"Kulcsok felajánlása\",\"settings.donateKeys.no\":\"Nem\",\"settings.donateKeys.yes\":\"Igen\",\"settings.empty\":\"Még nincsenek elérhető beállítások.\",\"settings.error\":\"A beállítások betöltése sikertelen.\",\"settings.fastDownload.description\":\"Játék hozzáadásakor automatikusan válassza az első elérhető forrást.\",\"settings.fastDownload.label\":\"Gyors letöltés\",\"settings.general\":\"Általános\",\"settings.generalDescription\":\"Globális LuaTools beállítások.\",\"settings.installedFixes.date\":\"Telepítve:\",\"settings.installedFixes.delete\":\"Törlés\",\"settings.installedFixes.deleteConfirm\":\"Biztosan eltávolítod ezt a javítást? Ez törli a javítófájlokat és futtatja a Steam ellenőrzést.\",\"settings.installedFixes.deleteError\":\"A javítás eltávolítása sikertelen.\",\"settings.installedFixes.deleteSuccess\":\"Javítás sikeresen eltávolítva!\",\"settings.installedFixes.deleting\":\"Javítás eltávolítása...\",\"settings.installedFixes.empty\":\"Még nincsenek telepített javítások.\",\"settings.installedFixes.error\":\"A telepített javítások betöltése sikertelen.\",\"settings.installedFixes.files\":\"{count} fájl\",\"settings.installedFixes.loading\":\"Telepített javítások keresése...\",\"settings.installedFixes.title\":\"Telepített javítások\",\"settings.installedFixes.type\":\"Típus:\",\"settings.installedLua.delete\":\"Eltávolítás\",\"settings.installedLua.deleteConfirm\":\"Eltávolítod a LuaTools-t ehhez a játékhoz?\",\"settings.installedLua.deleteError\":\"Az eltávolítás LuaTools-szal sikertelen.\",\"settings.installedLua.deleteSuccess\":\"Sikeresen eltávolítva LuaTools-szal!\",\"settings.installedLua.deleting\":\"Eltávolítás LuaTools-szal...\",\"settings.installedLua.disabled\":\"Letiltva\",\"settings.installedLua.empty\":\"Még nincsenek telepített Lua szkriptek.\",\"settings.installedLua.error\":\"A telepített Lua szkriptek betöltése sikertelen.\",\"settings.installedLua.loading\":\"Telepített Lua szkriptek keresése...\",\"settings.installedLua.modified\":\"Módosítva:\",\"settings.installedLua.title\":\"Játékok LuaTools-szal\",\"settings.installedLua.unknownInfo\":\"Az 'Ismeretlen játék' jelzésű játékok külső forrásból lettek telepítve (nem LuaTools-szal).\",\"settings.language.description\":\"Válaszd ki a LuaTools által használt nyelvet.\",\"settings.language.label\":\"Nyelv\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Beállítások betöltése...\",\"settings.noChanges\":\"Nincs mentendő változás.\",\"settings.refresh\":\"Frissítés\",\"settings.refreshing\":\"Frissítés...\",\"settings.save\":\"Beállítások mentése\",\"settings.saveError\":\"A beállítások mentése sikertelen.\",\"settings.saveSuccess\":\"Beállítások sikeresen mentve.\",\"settings.saving\":\"Mentés...\",\"settings.search.clear\":\"Keresés törlése\",\"settings.search.noResults\":\"Nincs találat\",\"settings.search.placeholder\":\"Keresés beállításokban, játékokban, javításokban...\",\"settings.theme.description\":\"Válaszd ki a LuaTools felület színtémáját.\",\"settings.theme.label\":\"Téma\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Mentetlen változások\",\"settings.useSteamLanguage.description\":\"A Steam kliens nyelvének használata a LuaTools beállítás helyett.\",\"settings.useSteamLanguage.label\":\"Steam nyelv használata\",\"settings.useSteamLanguage.no\":\"Nem\",\"settings.useSteamLanguage.yes\":\"Igen\",\"{fix} applied successfully!\":\"{fix} sikeresen alkalmazva!\",\"settings.morrenusApiKey.label\":\"Morrenus API kulcs\",\"settings.morrenusApiKey.description\":\"API kulcs szükséges a Sadie Source használatához. Szerezze be innen: {link}\",\"settings.morrenusApiKey.placeholder\":\"Adja meg az API kulcsát\"}",
    "id": "{\"Add via LuaTools\":\"Tambahkan via LuaTools\",\"Advanced\":\"Lanjutan\",\"All-In-One Fixes\":\"Perbaikan All-In-One\",\"Apply\":\"Terapkan\",\"Applying {fix}\":\"Menerapkan {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Apakah Kamu yakin untuk membatalkan perbaikan? Ini akan menghapus berkas perbaikan dan akan memverifikasi berkas game.\",\"Are you sure?\":\"Apakah kamu yakin?\",\"Back\":\"Kembali\",\"Base Game\":\"Game Utama\",\"Cancel\":\"Batalkan\",\"Cancellation failed\":\"Pembatalan Gagal\",\"Cancelled\":\"Dibatalkan\",\"Cancelled by user\":\"Dibatalkan oleh user\",\"Cancelled: {reason}\":\"Dibatalkan: {reason}\",\"Cancelling...\":\"membatalkan...\",\"Check for updates\":\"Cek Pembaruan\",\"Checking availability…\":\"Memeriksa ketersediaan…\",\"Checking content…\":\"Memeriksa konten…\",\"Checking generic fix...\":\"Memeriksa perbaikan umum...\",\"Checking key...\":\"Memeriksa kunci...\",\"Checking online-fix...\":\"Memeriksa online-fix...\",\"Checking…\":\"Memeriksa…\",\"Close\":\"Tutup\",\"Confirm\":\"Konfirmasi\",\"Content details =>\":\"Detail konten =>\",\"DLC Detected\":\"DLC Terdeteksi\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC ditambahkan bersama dengan game utama. Untuk menambahkan perbaikan untuk DLC ini, silakan pergi ke halaman game utama: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Abaikan\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Mengunduh...\",\"Downloading: {percent}%\":\"Mengunduh: {percent}%\",\"Downloading…\":\"Mengunduh…\",\"Error applying fix\":\"Error Menerapkan perbaikan\",\"Error checking for fixes\":\"Error saat memeriksa perbaikan\",\"Error starting Online Fix\":\"Error memulai Online Fix\",\"Error starting un-fix\":\"Error memulai pembatalan perbaikan\",\"Error! Code: {code}\":\"Error! Kode: {code}\",\"Error, Code: {code}\":\"Error, Kode: {code}\",\"Error, Timed Out\":\"Error, Waktu habis\",\"Error: {error}\":\"Error: {error}\",\"Expires\":\"Kedaluwarsa\",\"Extracting to game folder...\":\"Mengekstrak ke folder game...\",\"Failed\":\"Gagal\",\"Failed to cancel fix download\":\"Gagal membatalkan unduhan perbaikan.\",\"Failed to check for fixes.\":\"Gagal untuk memeriksa perbaikan.\",\"Failed to load free APIs.\":\"Gagal untuk memuat API gratis.\",\"Failed to start fix download\":\"Gagal memulai unduhan perbaikan\",\"Failed to start un-fix\":\"Gagal memulai pembatalan perbaikan\",\"Failed to verify key\":\"Gagal memverifikasi kunci\",\"Failed: {error}\":\"Gagal: {error}\",\"Fetch Free API's\":\"Muat API gratis\",\"Fetching game name...\":\"Mendapatkan nama game...\",\"Finishing…\":\"Menyelesaikan…\",\"Fixes Menu\":\"Menu Perbaikan\",\"Found\":\"Ditemukan\",\"Game Added!\":\"Game ditambahkan!\",\"Game added!\":\"Game Ditambahkan!\",\"Game folder\":\"Folder Game\",\"Game install path not found\":\"Path instalasi game tidak ditemukan\",\"Game not found on any available API.\":\"Game tidak ditemukan di API mana pun yang tersedia.\",\"Generic Fix\":\"Perbaikan Umum\",\"Generic fix found!\":\"Perbaikan umum ditemukan!\",\"Go to Base Game\":\"Pergi ke Game Utama\",\"Hide\":\"Sembunyikan\",\"Included\":\"Termasuk\",\"Initializing download...\":\"Inisialisasi unduhan...\",\"Installing…\":\"Menginstal…\",\"Invalid Morrenus API Key format\":\"Format kunci API Morrenus tidak valid\",\"Invalid key format\":\"Format kunci tidak valid\",\"Invalid or rejected key\":\"Kunci tidak valid atau ditolak\",\"Join the Discord!\":\"Gabung Discord!\",\"Left click to install, Right click for SteamDB\":\"Klik kiri untuk menginstal, klik kanan untuk SteamDB\",\"Loaded free APIs: {count}\":\"API gratis dimuat: {count}\",\"Loading APIs...\":\"Memuat API...\",\"Loading fixes...\":\"Memuat perbaikan...\",\"Look for Fixes\":\"Cari perbaikan\",\"LuaTools backend unavailable\":\"Backend LuaTools Tidak tersedia\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menu Perbaikan AIO\",\"LuaTools · Added Games\":\"LuaTools · Game Ditambahkan\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu Perbaikan\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Kelola Game\",\"Missing\":\"Tidak ada\",\"No games found.\":\"Game tidak ditemukan.\",\"No generic fix\":\"Tidak ada perbaikan umum\",\"No online-fix\":\"Tidak ada online-fix\",\"No updates available.\":\"Tidak ada update yang tersedia.\",\"No workshop for the game\":\"Tidak ada workshop untuk game ini\",\"Not found\":\"Tidak ditemukan\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Melepas steam)\",\"Online-fix found!\":\"Online-fix ditemukan!\",\"Only possible thanks to {name} 💜\":\"Hanya memungkinkan berkat {name} 💜\",\"Proceed\":\"Lanjutkan\",\"Processing package…\":\"Memproses paket…\",\"Remove via LuaTools\":\"Hapus via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Menghapus {count} berkas. Menjalankan verifikasi Steam...\",\"Removing fix files...\":\"Menghapus berkas perbaikan...\",\"Restart Steam\":\"Mulai Ulang Steam\",\"Restart Steam now?\":\"Mulai ulang Steam sekarang?\",\"Searching across sources...\":\"Mencari di semua sumber...\",\"Select Download Source\":\"Pilih Sumber Unduhan\",\"Settings\":\"Pengaturan\",\"Skipped\":\"Dilewati\",\"The game has been added successfully.\":\"Game berhasil ditambahkan.\",\"This game may not work, support for it wont be given in our discord\":\"Game ini mungkin tidak berfungsi, dukungan tidak akan diberikan di discord kami\",\"Un-Fix (verify game)\":\"Membatalkan perbaikan (verifikasi game)\",\"Un-Fixing game\":\"Membatalkan perbaikan game\",\"Unknown Game\":\"Game tidak diketahui\",\"Unknown error\":\"Kesalahan tidak diketahui\",\"Usage\":\"Penggunaan\",\"Verifying API limits...\":\"Memverifikasi batas API...\",\"Waiting…\":\"Menunggu…\",\"Working…\":\"Bekerja…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Anda telah melebihi batas unduhan harian. Tunggu hingga besok atau tingkatkan paket Anda di situs web Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Kunci API Morrenus Anda tidak valid atau kedaluwarsa. Periksa kunci Anda di pengaturan atau buat ulang di situs web Morrenus.\",\"bigpicture.mouseTip\":\"Untuk menggunakan mode mouse di Steam: Tombol Guide + Joystick kanan, klik dengan RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Jenis opsi tidak didukung: {type}\",\"common.status.error\":\"Error\",\"common.status.loading\":\"Memuat...\",\"common.status.success\":\"Sukses\",\"common.translationMissing\":\"Terjemahan hilang\",\"common.warning\":\"Peringatan\",\"days left\":\"hari tersisa\",\"disclaimer.inputLabel\":\"ketik \\\"Saya Mengerti\\\" di kotak di bawah untuk melanjutkan\",\"disclaimer.inputPlaceholder\":\"Saya Mengerti\",\"disclaimer.line1\":\"LuaTools tidak berafiliasi dengan Millennium dengan cara apapun\",\"disclaimer.line2\":\"Millennium TIDAK akan memberikan dukungan untuk plugin ini di server discord mereka\",\"disclaimer.line3\":\"Kamu akan DIBLOKIR dari server LuaTools dan Millennium jika kamu pergi ke discord mereka meminta bantuan\",\"disclaimer.title\":\"Pemberitahuan Penting\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Perbaikan tersedia\",\"gameStatus.playable\":\"Dapat dimainkan\",\"gameStatus.unplayable\":\"Tidak dapat dimainkan\",\"menu.advancedLabel\":\"Lanjutan\",\"menu.checkForUpdates\":\"Cek Pembaruan\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Error saat mengambil path game\",\"menu.error.noAppId\":\"Tidak dapat menentukan AppID game\",\"menu.error.noInstall\":\"Tidak dapat mencari instalasi game\",\"menu.error.notInstalled\":\"Game belum terpasang! Tambahkan dan pasang terlebih dahulu :D\",\"menu.fetchFreeApis\":\"Muat API Gratis\",\"menu.fixesMenu\":\"Menu Perbaikan\",\"menu.joinDiscordLabel\":\"Gabung Discord!\",\"menu.manageGameLabel\":\"Kelola Game\",\"menu.remove.confirm\":\"Hapus via LuaTools untuk game ini?\",\"menu.remove.failure\":\"Gagal menghapus LuaTools.\",\"menu.remove.success\":\"LuaTools dihapus untuk aplikasi ini.\",\"menu.removeLuaTools\":\"Hapus via LuaTools\",\"menu.settings\":\"Pengaturan\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Tutup\",\"settings.donateKeys.description\":\"Donasikan kunci dekripsi untuk game, ini membantu semua orang!\",\"settings.donateKeys.label\":\"Donasikan kunci\",\"settings.donateKeys.no\":\"Tidak\",\"settings.donateKeys.yes\":\"Ya\",\"settings.empty\":\"Pengaturan belum tersedia.\",\"settings.error\":\"Gagal memuat pengaturan.\",\"settings.fastDownload.description\":\"Secara otomatis memilih sumber pertama yang tersedia saat menambahkan game.\",\"settings.fastDownload.label\":\"Unduhan Cepat\",\"settings.general\":\"Umum\",\"settings.generalDescription\":\"Preferensi Global LuaTools.\",\"settings.installedFixes.date\":\"Terpasang:\",\"settings.installedFixes.delete\":\"Hapus\",\"settings.installedFixes.deleteConfirm\":\"Apakah Anda yakin ingin menghapus perbaikan ini? Ini akan menghapus file perbaikan dan menjalankan verifikasi Steam.\",\"settings.installedFixes.deleteError\":\"Gagal menghapus perbaikan.\",\"settings.installedFixes.deleteSuccess\":\"Perbaikan berhasil dihapus!\",\"settings.installedFixes.deleting\":\"Menghapus perbaikan...\",\"settings.installedFixes.empty\":\"Belum ada perbaikan yang terpasang.\",\"settings.installedFixes.error\":\"Gagal memuat perbaikan yang terpasang.\",\"settings.installedFixes.files\":\"{count} file\",\"settings.installedFixes.loading\":\"Memindai perbaikan yang terpasang...\",\"settings.installedFixes.title\":\"Perbaikan Terpasang\",\"settings.installedFixes.type\":\"Jenis:\",\"settings.installedLua.delete\":\"Hapus\",\"settings.installedLua.deleteConfirm\":\"Hapus via LuaTools untuk game ini?\",\"settings.installedLua.deleteError\":\"Gagal menghapus via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Berhasil dihapus via LuaTools!\",\"settings.installedLua.deleting\":\"Menghapus via LuaTools...\",\"settings.installedLua.disabled\":\"Dinonaktifkan\",\"settings.installedLua.empty\":\"Belum ada skrip Lua yang terpasang.\",\"settings.installedLua.error\":\"Gagal memuat skrip Lua yang terpasang.\",\"settings.installedLua.loading\":\"Memindai skrip Lua yang terpasang...\",\"settings.installedLua.modified\":\"Dimodifikasi:\",\"settings.installedLua.title\":\"Game via LuaTools\",\"settings.installedLua.unknownInfo\":\"Game yang menampilkan 'Game Tidak Dikenal' diinstal dari sumber eksternal (bukan via LuaTools).\",\"settings.language.description\":\"Pilih bahasa yang digunakan oleh LuaTools.\",\"settings.language.label\":\"Bahasa\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Memuat pengaturan...\",\"settings.noChanges\":\"Tidak ada perubahan untuk disimpan.\",\"settings.refresh\":\"Muat ulang\",\"settings.refreshing\":\"Memuat ulang...\",\"settings.save\":\"Simpan pengaturan\",\"settings.saveError\":\"Gagal menyimpan pengaturan.\",\"settings.saveSuccess\":\"Pengaturan berhasil disimpan.\",\"settings.saving\":\"Menyimpan...\",\"settings.search.clear\":\"Hapus pencarian\",\"settings.search.noResults\":\"Tidak ada hasil ditemukan\",\"settings.search.placeholder\":\"Cari pengaturan, game, perbaikan...\",\"settings.theme.description\":\"Pilih tema warna untuk antarmuka LuaTools.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Pengaturan\",\"settings.unsaved\":\"Batalkan Perubahan\",\"settings.useSteamLanguage.description\":\"Gunakan bahasa klien Steam alih-alih pengaturan LuaTools.\",\"settings.useSteamLanguage.label\":\"Gunakan Bahasa Steam\",\"settings.useSteamLanguage.no\":\"Tidak\",\"settings.useSteamLanguage.yes\":\"Ya\",\"{fix} applied successfully!\":\"{fix} berhasil diterapkan!\",\"settings.morrenusApiKey.label\":\"Kunci API Morrenus\",\"settings.morrenusApiKey.description\":\"Kunci API diperlukan untuk menggunakan Sadie Source. Dapatkan dari {link}\",\"settings.morrenusApiKey.placeholder\":\"Masukkan Kunci API Anda\"}",
    "it": "{\"Add via LuaTools\":\"Aggiungi tramite LuaTools\",\"Advanced\":\"Avanzato\",\"All-In-One Fixes\":\"Correzioni All-In-One\",\"Apply\":\"Applica\",\"Applying {fix}\":\"Applicazione {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Sei sicuro di voler rimuovere la correzione? Questo rimuoverà i file di correzione e verificherà i file del gioco.\",\"Are you sure?\":\"Sei sicuro?\",\"Back\":\"Indietro\",\"Base Game\":\"Gioco Base\",\"Cancel\":\"Annulla\",\"Cancellation failed\":\"Annullamento fallito\",\"Cancelled\":\"Annullato\",\"Cancelled by user\":\"Annullato dall'utente\",\"Cancelled: {reason}\":\"Annullato: {reason}\",\"Cancelling...\":\"Annullamento...\",\"Check for updates\":\"Controlla aggiornamenti\",\"Checking availability…\":\"Controllo disponibilità…\",\"Checking content…\":\"Controllo del contenuto…\",\"Checking generic fix...\":\"Controllo correzione generica...\",\"Checking key...\":\"Verifica della chiave...\",\"Checking online-fix...\":\"Controllo online-fix...\",\"Checking…\":\"Controllo…\",\"Close\":\"Chiudi\",\"Confirm\":\"Conferma\",\"Content details =>\":\"Dettagli del contenuto =>\",\"DLC Detected\":\"DLC Rilevato\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"I DLC vengono aggiunti insieme al gioco base. Per aggiungere correzioni a questo DLC, vai alla pagina del gioco base: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Chiudi\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Download...\",\"Downloading: {percent}%\":\"Download: {percent}%\",\"Downloading…\":\"Download…\",\"Error applying fix\":\"Errore nell'applicazione della correzione\",\"Error checking for fixes\":\"Errore nel controllo delle correzioni\",\"Error starting Online Fix\":\"Errore nell'avvio di Online Fix\",\"Error starting un-fix\":\"Errore nell'avvio della rimozione correzione\",\"Error! Code: {code}\":\"Errore! Codice: {code}\",\"Error, Code: {code}\":\"Errore, Codice: {code}\",\"Error, Timed Out\":\"Errore, Timeout\",\"Error: {error}\":\"Errore: {error}\",\"Expires\":\"Scade\",\"Extracting to game folder...\":\"Estrazione nella cartella del gioco...\",\"Failed\":\"Fallito\",\"Failed to cancel fix download\":\"Impossibile annullare il download della correzione\",\"Failed to check for fixes.\":\"Impossibile controllare le correzioni.\",\"Failed to load free APIs.\":\"Impossibile caricare le API gratuite.\",\"Failed to start fix download\":\"Impossibile avviare il download della correzione\",\"Failed to start un-fix\":\"Impossibile avviare la rimozione correzione\",\"Failed to verify key\":\"Verifica della chiave fallita\",\"Failed: {error}\":\"Fallito: {error}\",\"Fetch Free API's\":\"Carica API Gratuite\",\"Fetching game name...\":\"Recupero nome del gioco...\",\"Finishing…\":\"Completamento…\",\"Fixes Menu\":\"Menu Correzioni\",\"Found\":\"Trovato\",\"Game Added!\":\"Gioco aggiunto!\",\"Game added!\":\"Gioco aggiunto!\",\"Game folder\":\"Cartella gioco\",\"Game install path not found\":\"Percorso di installazione del gioco non trovato\",\"Game not found on any available API.\":\"Gioco non trovato su nessuna API disponibile.\",\"Generic Fix\":\"Correzione Generica\",\"Generic fix found!\":\"Correzione generica trovata!\",\"Go to Base Game\":\"Vai al Gioco Base\",\"Hide\":\"Nascondi\",\"Included\":\"Incluso\",\"Initializing download...\":\"Inizializzazione del download...\",\"Installing…\":\"Installazione…\",\"Invalid Morrenus API Key format\":\"Formato chiave API Morrenus non valido\",\"Invalid key format\":\"Formato chiave non valido\",\"Invalid or rejected key\":\"Chiave non valida o rifiutata\",\"Join the Discord!\":\"Unisciti al nostro Discord!\",\"Left click to install, Right click for SteamDB\":\"Clic sinistro per installare, clic destro per SteamDB\",\"Loaded free APIs: {count}\":\"API gratuite caricate: {count}\",\"Loading APIs...\":\"Caricamento API...\",\"Loading fixes...\":\"Caricamento correzioni...\",\"Look for Fixes\":\"Cerca Correzioni\",\"LuaTools backend unavailable\":\"Backend LuaTools non disponibile\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menu Correzioni AIO\",\"LuaTools · Added Games\":\"LuaTools · Giochi Aggiunti\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu Correzioni\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Gestisci Gioco\",\"Missing\":\"Mancante\",\"No games found.\":\"Nessun gioco trovato.\",\"No generic fix\":\"Nessuna correzione generica\",\"No online-fix\":\"Nessun online-fix\",\"No updates available.\":\"Nessun aggiornamento disponibile.\",\"No workshop for the game\":\"Nessun workshop per il gioco\",\"Not found\":\"Non trovato\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix trovato!\",\"Only possible thanks to {name} 💜\":\"Possibile solo grazie a {name} 💜\",\"Proceed\":\"Procedi\",\"Processing package…\":\"Elaborazione pacchetto…\",\"Remove via LuaTools\":\"Rimuovi tramite LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Rimossi {count} file. Esecuzione verifica Steam...\",\"Removing fix files...\":\"Rimozione file di correzione...\",\"Restart Steam\":\"Riavvia Steam\",\"Restart Steam now?\":\"Riavviare Steam ora?\",\"Searching across sources...\":\"Ricerca in tutte le fonti...\",\"Select Download Source\":\"Seleziona sorgente di download\",\"Settings\":\"Impostazioni\",\"Skipped\":\"Saltato\",\"The game has been added successfully.\":\"Il gioco è stato aggiunto con successo.\",\"This game may not work, support for it wont be given in our discord\":\"Questo gioco potrebbe non funzionare, non verrà fornito supporto nel nostro discord\",\"Un-Fix (verify game)\":\"Rimuovi Correzione (verifica gioco)\",\"Un-Fixing game\":\"Rimozione correzione gioco\",\"Unknown Game\":\"Gioco Sconosciuto\",\"Unknown error\":\"Errore sconosciuto\",\"Usage\":\"Utilizzo\",\"Verifying API limits...\":\"Verifica dei limiti API...\",\"Waiting…\":\"In attesa…\",\"Working…\":\"Lavorando…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Hai superato il limite giornaliero di download. Attendi fino a domani o aggiorna il tuo piano sul sito Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"La tua chiave API Morrenus non è valida o è scaduta. Controlla la chiave nelle impostazioni o rigenerala sul sito Morrenus.\",\"bigpicture.mouseTip\":\"Per usare la modalità mouse in Steam: Pulsante Guide + Joystick destro, clicca con RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Tipo di opzione non supportato: {type}\",\"common.status.error\":\"Errore\",\"common.status.loading\":\"Caricamento...\",\"common.status.success\":\"Successo\",\"common.translationMissing\":\"traduzione mancante\",\"common.warning\":\"Avviso\",\"days left\":\"giorni rimanenti\",\"disclaimer.inputLabel\":\"scrivi \\\"Ho Capito\\\" nella casella qui sotto per continuare\",\"disclaimer.inputPlaceholder\":\"Ho Capito\",\"disclaimer.line1\":\"LuaTools non è affiliato in alcun modo con Millennium\",\"disclaimer.line2\":\"Millennium NON offrirà supporto per questo plugin sul loro server discord\",\"disclaimer.line3\":\"Sarai BANNATO da entrambi i server LuaTools e Millennium se vai sul loro discord a chiedere aiuto\",\"disclaimer.title\":\"Avviso Importante\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Correzione disponibile\",\"gameStatus.playable\":\"Giocabile\",\"gameStatus.unplayable\":\"Non giocabile\",\"menu.advancedLabel\":\"Avanzato\",\"menu.checkForUpdates\":\"Controlla Aggiornamenti\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Errore nel recupero del percorso del gioco\",\"menu.error.noAppId\":\"Impossibile determinare l'AppID del gioco\",\"menu.error.noInstall\":\"Impossibile trovare l'installazione del gioco\",\"menu.error.notInstalled\":\"Gioco non installato! Aggiungi e installalo prima :D\",\"menu.fetchFreeApis\":\"Carica API Gratuite\",\"menu.fixesMenu\":\"Menu Correzioni\",\"menu.joinDiscordLabel\":\"Unisciti al nostro Discord!\",\"menu.manageGameLabel\":\"Gestisci Gioco\",\"menu.remove.confirm\":\"Vuoi rimuovere LuaTools per questo gioco?\",\"menu.remove.failure\":\"Impossibile rimuovere LuaTools.\",\"menu.remove.success\":\"LuaTools ha rimosso questa app con successo.\",\"menu.removeLuaTools\":\"Rimuovi con LuaTools\",\"menu.settings\":\"Impostazioni\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Chiudi\",\"settings.donateKeys.description\":\"Consenti a LuaTools di donare chiavi Steam inutilizzate.\",\"settings.donateKeys.label\":\"Dona Chiavi\",\"settings.donateKeys.no\":\"No\",\"settings.donateKeys.yes\":\"Sì\",\"settings.empty\":\"Nessuna impostazione disponibile.\",\"settings.error\":\"Impossibile caricare le impostazioni.\",\"settings.fastDownload.description\":\"Scegli automaticamente la prima sorgente disponibile quando aggiungi un gioco.\",\"settings.fastDownload.label\":\"Download rapido\",\"settings.general\":\"Generale\",\"settings.generalDescription\":\"Preferenze globali di LuaTools.\",\"settings.installedFixes.date\":\"Installato:\",\"settings.installedFixes.delete\":\"Elimina\",\"settings.installedFixes.deleteConfirm\":\"Sei sicuro di voler rimuovere questo fix? Questo eliminerà i file del fix ed eseguirà la verifica di Steam.\",\"settings.installedFixes.deleteError\":\"Impossibile rimuovere il fix.\",\"settings.installedFixes.deleteSuccess\":\"Fix rimosso con successo!\",\"settings.installedFixes.deleting\":\"Rimozione fix...\",\"settings.installedFixes.empty\":\"Nessun fix installato ancora.\",\"settings.installedFixes.error\":\"Impossibile caricare i fix installati.\",\"settings.installedFixes.files\":\"{count} file\",\"settings.installedFixes.loading\":\"Scansione fix installati...\",\"settings.installedFixes.title\":\"Fix Installati\",\"settings.installedFixes.type\":\"Tipo:\",\"settings.installedLua.delete\":\"Rimuovi\",\"settings.installedLua.deleteConfirm\":\"Rimuovere via LuaTools per questo gioco?\",\"settings.installedLua.deleteError\":\"Impossibile rimuovere via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Rimosso via LuaTools con successo!\",\"settings.installedLua.deleting\":\"Rimozione via LuaTools...\",\"settings.installedLua.disabled\":\"Disabilitato\",\"settings.installedLua.empty\":\"Nessuno script Lua installato ancora.\",\"settings.installedLua.error\":\"Impossibile caricare gli script Lua installati.\",\"settings.installedLua.loading\":\"Scansione script Lua installati...\",\"settings.installedLua.modified\":\"Modificato:\",\"settings.installedLua.title\":\"Giochi via LuaTools\",\"settings.installedLua.unknownInfo\":\"I giochi che mostrano 'Gioco Sconosciuto' sono stati installati da fonti esterne (non via LuaTools).\",\"settings.language.description\":\"Scegli la lingua utilizzata da LuaTools.\",\"settings.language.label\":\"Lingua\",\"settings.language.option.en\":\"Inglese\",\"settings.language.option.pt-BR\":\"Portoghese Brasiliano\",\"settings.loading\":\"Caricamento impostazioni...\",\"settings.noChanges\":\"Nessuna modifica da salvare.\",\"settings.refresh\":\"Aggiorna\",\"settings.refreshing\":\"Aggiornamento...\",\"settings.save\":\"Salva le Impostazioni\",\"settings.saveError\":\"Impossibile salvare le impostazioni.\",\"settings.saveSuccess\":\"Impostazioni salvate con successo.\",\"settings.saving\":\"Salvando...\",\"settings.search.clear\":\"Cancella ricerca\",\"settings.search.noResults\":\"Nessun risultato trovato\",\"settings.search.placeholder\":\"Cerca impostazioni, giochi, correzioni...\",\"settings.theme.description\":\"Scegli il tema colore per l'interfaccia LuaTools.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Impostazioni\",\"settings.unsaved\":\"Modifiche non salvate\",\"settings.useSteamLanguage.description\":\"Usa la lingua del client Steam invece dell'impostazione di LuaTools.\",\"settings.useSteamLanguage.label\":\"Usa la lingua di Steam\",\"settings.useSteamLanguage.no\":\"No\",\"settings.useSteamLanguage.yes\":\"Sì\",\"{fix} applied successfully!\":\"{fix} applicato con successo!\",\"settings.morrenusApiKey.label\":\"Chiave API Morrenus\",\"settings.morrenusApiKey.description\":\"Chiave API richiesta per usare Sadie Source. Ottienila da {link}\",\"settings.morrenusApiKey.placeholder\":\"Inserisci la tua chiave API\"}",
    "ja": "{\"Add via LuaTools\":\"LuaTools経由で追加\",\"Advanced\":\"詳細設定\",\"All-In-One Fixes\":\"オールインワン修正\",\"Apply\":\"適用\",\"Applying {fix}\":\"{fix}を適用中\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"修正を解除しますか？これにより、修正ファイルが削除され、ゲームファイルが検証されます。\",\"Are you sure?\":\"よろしいですか？\",\"Back\":\"戻る\",\"Base Game\":\"ベースゲーム\",\"Cancel\":\"キャンセル\",\"Cancellation failed\":\"キャンセルに失敗しました\",\"Cancelled\":\"キャンセルされました\",\"Cancelled by user\":\"ユーザーによってキャンセルされました\",\"Cancelled: {reason}\":\"キャンセルされました: {reason}\",\"Cancelling...\":\"キャンセル中...\",\"Check for updates\":\"アップデートを確認\",\"Checking availability…\":\"利用可能性を確認中…\",\"Checking content…\":\"コンテンツを確認中…\",\"Checking generic fix...\":\"汎用修正を確認中...\",\"Checking key...\":\"キーを確認中...\",\"Checking online-fix...\":\"オンライン修正を確認中...\",\"Checking…\":\"確認中…\",\"Close\":\"閉じる\",\"Confirm\":\"確認\",\"Content details =>\":\"コンテンツ詳細 =>\",\"DLC Detected\":\"DLCを検出しました\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLCはベースゲームと一緒に追加されます。このDLCの修正を追加するには、ベースゲームのページに移動してください：<br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"閉じる\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"ダウンロード中...\",\"Downloading: {percent}%\":\"ダウンロード中: {percent}%\",\"Downloading…\":\"ダウンロード中…\",\"Error applying fix\":\"修正の適用エラー\",\"Error checking for fixes\":\"修正の確認エラー\",\"Error starting Online Fix\":\"オンライン修正の開始エラー\",\"Error starting un-fix\":\"修正解除の開始エラー\",\"Error! Code: {code}\":\"エラー！コード: {code}\",\"Error, Code: {code}\":\"エラー、コード: {code}\",\"Error, Timed Out\":\"エラー、タイムアウト\",\"Error: {error}\":\"エラー: {error}\",\"Expires\":\"有効期限\",\"Extracting to game folder...\":\"ゲームフォルダに展開中...\",\"Failed\":\"失敗\",\"Failed to cancel fix download\":\"修正ダウンロードのキャンセルに失敗しました\",\"Failed to check for fixes.\":\"修正の確認に失敗しました。\",\"Failed to load free APIs.\":\"無料APIの読み込みに失敗しました。\",\"Failed to start fix download\":\"修正ダウンロードの開始に失敗しました\",\"Failed to start un-fix\":\"修正解除の開始に失敗しました\",\"Failed to verify key\":\"キーの確認に失敗しました\",\"Failed: {error}\":\"失敗しました: {error}\",\"Fetch Free API's\":\"無料APIを取得\",\"Fetching game name...\":\"ゲーム名を取得中...\",\"Finishing…\":\"完了中…\",\"Fixes Menu\":\"修正メニュー\",\"Found\":\"見つかりました\",\"Game Added!\":\"ゲームが追加されました！\",\"Game added!\":\"ゲームが追加されました！\",\"Game folder\":\"ゲームフォルダ\",\"Game install path not found\":\"ゲームのインストールパスが見つかりません\",\"Game not found on any available API.\":\"利用可能なAPIにゲームが見つかりませんでした。\",\"Generic Fix\":\"汎用修正\",\"Generic fix found!\":\"汎用修正が見つかりました！\",\"Go to Base Game\":\"ベースゲームに移動\",\"Hide\":\"隠す\",\"Included\":\"含まれています\",\"Initializing download...\":\"ダウンロードを初期化中...\",\"Installing…\":\"インストール中…\",\"Invalid Morrenus API Key format\":\"Morrenus APIキーの形式が無効です\",\"Invalid key format\":\"キーの形式が無効です\",\"Invalid or rejected key\":\"無効または拒否されたキー\",\"Join the Discord!\":\"Discordに参加！\",\"Left click to install, Right click for SteamDB\":\"左クリックでインストール、右クリックでSteamDB\",\"Loaded free APIs: {count}\":\"無料APIを読み込みました: {count}\",\"Loading APIs...\":\"APIを読み込み中...\",\"Loading fixes...\":\"修正を読み込み中...\",\"Look for Fixes\":\"修正を探す\",\"LuaTools backend unavailable\":\"LuaToolsバックエンドが利用できません\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO修正メニュー\",\"LuaTools · Added Games\":\"LuaTools · 追加されたゲーム\",\"LuaTools · Fixes Menu\":\"LuaTools · 修正メニュー\",\"LuaTools · Menu\":\"LuaTools · メニュー\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"ゲームを管理\",\"Missing\":\"不足\",\"No games found.\":\"ゲームが見つかりません。\",\"No generic fix\":\"汎用修正はありません\",\"No online-fix\":\"オンライン修正はありません\",\"No updates available.\":\"利用可能なアップデートはありません。\",\"No workshop for the game\":\"このゲームにワークショップはありません\",\"Not found\":\"見つかりません\",\"Online Fix\":\"オンライン修正\",\"Online Fix (Unsteam)\":\"オンライン修正（Unsteam）\",\"Online-fix found!\":\"オンライン修正が見つかりました！\",\"Only possible thanks to {name} 💜\":\"{name} 💜のおかげで可能になりました\",\"Proceed\":\"続行\",\"Processing package…\":\"パッケージを処理中…\",\"Remove via LuaTools\":\"LuaTools経由で削除\",\"Removed {count} files. Running Steam verification...\":\"{count}個のファイルを削除しました。Steamの検証を実行中...\",\"Removing fix files...\":\"修正ファイルを削除中...\",\"Restart Steam\":\"Steamを再起動\",\"Restart Steam now?\":\"今すぐSteamを再起動しますか？\",\"Searching across sources...\":\"全てのソースを検索中...\",\"Select Download Source\":\"ダウンロードソースを選択\",\"Settings\":\"設定\",\"Skipped\":\"スキップ\",\"The game has been added successfully.\":\"ゲームが正常に追加されました。\",\"This game may not work, support for it wont be given in our discord\":\"このゲームは動作しない可能性があります、discordでのサポートは行われません\",\"Un-Fix (verify game)\":\"修正解除（ゲームを検証）\",\"Un-Fixing game\":\"ゲームの修正を解除中\",\"Unknown Game\":\"不明なゲーム\",\"Unknown error\":\"不明なエラー\",\"Usage\":\"使用量\",\"Verifying API limits...\":\"API制限を確認中...\",\"Waiting…\":\"待機中…\",\"Working…\":\"作業中…\",\"Workshop: \":\"ワークショップ: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"1日のダウンロード制限を超えました。明日まで待つか、Morrenusのウェブサイトでプランをアップグレードしてください。\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Morrenus APIキーが無効または期限切れです。設定でキーを確認するか、Morrenusのウェブサイトで再生成してください。\",\"bigpicture.mouseTip\":\"Steamでマウスモードを使用するには：Guideボタン + 右スティック、RBでクリック\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"サポートされていないオプションタイプ: {type}\",\"common.status.error\":\"エラー\",\"common.status.loading\":\"読み込み中...\",\"common.status.success\":\"成功\",\"common.translationMissing\":\"翻訳が見つかりません\",\"common.warning\":\"警告\",\"days left\":\"日残り\",\"disclaimer.inputLabel\":\"続けるには下のボックスに\\\"わかりました\\\"と入力してください\",\"disclaimer.inputPlaceholder\":\"わかりました\",\"disclaimer.line1\":\"LuaToolsはMillenniumとは一切関係ありません\",\"disclaimer.line2\":\"MillenniumはこのプラグインのサポートをDiscordサーバーで提供しません\",\"disclaimer.line3\":\"DiscordでLuaToolsまたはMillenniumに助けを求めると、両方のサーバーからBANされます\",\"disclaimer.title\":\"重要なお知らせ\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"修正が利用可能\",\"gameStatus.playable\":\"プレイ可能\",\"gameStatus.unplayable\":\"プレイ不可\",\"menu.advancedLabel\":\"詳細設定\",\"menu.checkForUpdates\":\"アップデートを確認\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"ゲームパスの取得エラー\",\"menu.error.noAppId\":\"ゲームのAppIDを特定できませんでした\",\"menu.error.noInstall\":\"ゲームのインストールが見つかりませんでした\",\"menu.error.notInstalled\":\"ゲームがインストールされていません！先に追加してインストールしてください :D\",\"menu.fetchFreeApis\":\"無料APIを取得\",\"menu.fixesMenu\":\"修正メニュー\",\"menu.joinDiscordLabel\":\"Discordに参加！\",\"menu.manageGameLabel\":\"ゲームを管理\",\"menu.remove.confirm\":\"このゲームのLuaToolsを削除しますか？\",\"menu.remove.failure\":\"LuaToolsの削除に失敗しました。\",\"menu.remove.success\":\"このアプリのLuaToolsが削除されました。\",\"menu.removeLuaTools\":\"LuaTools経由で削除\",\"menu.settings\":\"設定\",\"menu.title\":\"LuaTools · メニュー\",\"settings.close\":\"閉じる\",\"settings.donateKeys.description\":\"ゲームの復号化キーを寄付して、みんなを助けましょう！\",\"settings.donateKeys.label\":\"キーを寄付\",\"settings.donateKeys.no\":\"いいえ\",\"settings.donateKeys.yes\":\"はい\",\"settings.empty\":\"まだ設定はありません。\",\"settings.error\":\"設定の読み込みに失敗しました。\",\"settings.fastDownload.description\":\"ゲーム追加時に利用可能な最初のソースを自動的に選択します。\",\"settings.fastDownload.label\":\"高速ダウンロード\",\"settings.general\":\"一般\",\"settings.generalDescription\":\"LuaToolsのグローバル設定。\",\"settings.installedFixes.date\":\"インストール日：\",\"settings.installedFixes.delete\":\"削除\",\"settings.installedFixes.deleteConfirm\":\"この修正を削除してもよろしいですか？修正ファイルが削除され、Steamの検証が実行されます。\",\"settings.installedFixes.deleteError\":\"修正の削除に失敗しました。\",\"settings.installedFixes.deleteSuccess\":\"修正が正常に削除されました！\",\"settings.installedFixes.deleting\":\"修正を削除中...\",\"settings.installedFixes.empty\":\"まだ修正がインストールされていません。\",\"settings.installedFixes.error\":\"インストール済みの修正の読み込みに失敗しました。\",\"settings.installedFixes.files\":\"{count} ファイル\",\"settings.installedFixes.loading\":\"インストール済みの修正をスキャン中...\",\"settings.installedFixes.title\":\"インストール済みの修正\",\"settings.installedFixes.type\":\"タイプ：\",\"settings.installedLua.delete\":\"削除\",\"settings.installedLua.deleteConfirm\":\"このゲームをLuaTools経由で削除しますか？\",\"settings.installedLua.deleteError\":\"LuaTools経由での削除に失敗しました。\",\"settings.installedLua.deleteSuccess\":\"LuaTools経由で正常に削除されました！\",\"settings.installedLua.deleting\":\"LuaTools経由で削除中...\",\"settings.installedLua.disabled\":\"無効\",\"settings.installedLua.empty\":\"まだLuaスクリプトがインストールされていません。\",\"settings.installedLua.error\":\"インストール済みのLuaスクリプトの読み込みに失敗しました。\",\"settings.installedLua.loading\":\"インストール済みのLuaスクリプトをスキャン中...\",\"settings.installedLua.modified\":\"変更日：\",\"settings.installedLua.title\":\"LuaTools経由のゲーム\",\"settings.installedLua.unknownInfo\":\"'不明なゲーム'と表示されるゲームは、外部ソースからインストールされました（LuaTools経由ではありません）。\",\"settings.language.description\":\"LuaToolsで使用する言語を選択してください。\",\"settings.language.label\":\"言語\",\"settings.language.option.en\":\"英語\",\"settings.language.option.pt-BR\":\"ブラジルポルトガル語\",\"settings.loading\":\"設定を読み込み中...\",\"settings.noChanges\":\"保存する変更はありません。\",\"settings.refresh\":\"更新\",\"settings.refreshing\":\"更新中...\",\"settings.save\":\"設定を保存\",\"settings.saveError\":\"設定の保存に失敗しました。\",\"settings.saveSuccess\":\"設定が正常に保存されました。\",\"settings.saving\":\"保存中...\",\"settings.search.clear\":\"検索をクリア\",\"settings.search.noResults\":\"結果が見つかりません\",\"settings.search.placeholder\":\"設定、ゲーム、修正を検索...\",\"settings.theme.description\":\"LuaToolsインターフェースのカラーテーマを選択してください。\",\"settings.theme.label\":\"テーマ\",\"settings.title\":\"LuaTools · 設定\",\"settings.unsaved\":\"未保存の変更\",\"settings.useSteamLanguage.description\":\"LuaToolsの設定の代わりにSteamクライアントの言語を使用します。\",\"settings.useSteamLanguage.label\":\"Steam言語を使用\",\"settings.useSteamLanguage.no\":\"いいえ\",\"settings.useSteamLanguage.yes\":\"はい\",\"{fix} applied successfully!\":\"{fix}が正常に適用されました！\",\"settings.morrenusApiKey.label\":\"Morrenus APIキー\",\"settings.morrenusApiKey.description\":\"Sadie Sourceを使用するにはAPIキーが必要です。{link}から入手してください\",\"settings.morrenusApiKey.placeholder\":\"APIキーを入力してください\"}",
    "ko": "{\"Add via LuaTools\":\"LuaTools로 추가\",\"Advanced\":\"고급\",\"All-In-One Fixes\":\"올인원 수정\",\"Apply\":\"적용\",\"Applying {fix}\":\"{fix} 적용 중\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"수정을 되돌리시겠습니까? 수정 파일이 삭제되고 게임 파일이 검증됩니다.\",\"Are you sure?\":\"계속하시겠습니까?\",\"Back\":\"뒤로\",\"Base Game\":\"기본 게임\",\"Cancel\":\"취소\",\"Cancellation failed\":\"취소 실패\",\"Cancelled\":\"취소됨\",\"Cancelled by user\":\"사용자에 의해 취소됨\",\"Cancelled: {reason}\":\"취소됨: {reason}\",\"Cancelling...\":\"취소 중...\",\"Check for updates\":\"업데이트 확인\",\"Checking availability…\":\"가용성 확인 중…\",\"Checking content…\":\"콘텐츠 확인 중…\",\"Checking generic fix...\":\"일반 수정 확인 중...\",\"Checking key...\":\"키 확인 중...\",\"Checking online-fix...\":\"온라인 수정 확인 중...\",\"Checking…\":\"확인 중…\",\"Close\":\"닫기\",\"Confirm\":\"확인\",\"Content details =>\":\"콘텐츠 세부 정보 =>\",\"DLC Detected\":\"DLC 감지됨\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC는 기본 게임과 함께 추가됩니다. 이 DLC의 수정을 추가하려면 기본 게임 페이지로 이동하세요: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"무시\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"다운로드 중...\",\"Downloading: {percent}%\":\"다운로드 중: {percent}%\",\"Downloading…\":\"다운로드 중…\",\"Error applying fix\":\"수정 적용 중 오류\",\"Error checking for fixes\":\"수정 확인 중 오류\",\"Error starting Online Fix\":\"Online Fix 시작 중 오류\",\"Error starting un-fix\":\"수정 되돌리기 시작 중 오류\",\"Error! Code: {code}\":\"오류! 코드: {code}\",\"Error, Code: {code}\":\"오류, 코드: {code}\",\"Error, Timed Out\":\"오류, 시간 초과\",\"Error: {error}\":\"오류: {error}\",\"Expires\":\"만료\",\"Extracting to game folder...\":\"게임 폴더에 압축 해제 중...\",\"Failed\":\"실패\",\"Failed to cancel fix download\":\"수정 다운로드 취소 실패\",\"Failed to check for fixes.\":\"수정 확인에 실패했습니다.\",\"Failed to load free APIs.\":\"무료 API 로드에 실패했습니다.\",\"Failed to start fix download\":\"수정 다운로드 시작 실패\",\"Failed to start un-fix\":\"수정 되돌리기 시작 실패\",\"Failed to verify key\":\"키 확인 실패\",\"Failed: {error}\":\"실패: {error}\",\"Fetch Free API's\":\"무료 API 가져오기\",\"Fetching game name...\":\"게임 이름 가져오는 중...\",\"Finishing…\":\"마무리 중…\",\"Fixes Menu\":\"수정 메뉴\",\"Found\":\"발견됨\",\"Game Added!\":\"게임이 추가되었습니다!\",\"Game added!\":\"게임이 추가되었습니다!\",\"Game folder\":\"게임 폴더\",\"Game install path not found\":\"게임 설치 경로를 찾을 수 없음\",\"Game not found on any available API.\":\"사용 가능한 API에서 게임을 찾을 수 없습니다.\",\"Generic Fix\":\"일반 수정\",\"Generic fix found!\":\"일반 수정을 찾았습니다!\",\"Go to Base Game\":\"기본 게임으로 이동\",\"Hide\":\"숨기기\",\"Included\":\"포함됨\",\"Initializing download...\":\"다운로드 초기화 중...\",\"Installing…\":\"설치 중…\",\"Invalid Morrenus API Key format\":\"잘못된 Morrenus API 키 형식\",\"Invalid key format\":\"잘못된 키 형식\",\"Invalid or rejected key\":\"유효하지 않거나 거부된 키\",\"Join the Discord!\":\"Discord에 참여하세요!\",\"Left click to install, Right click for SteamDB\":\"좌클릭으로 설치, 우클릭으로 SteamDB 열기\",\"Loaded free APIs: {count}\":\"로드된 무료 API: {count}개\",\"Loading APIs...\":\"API 로드 중...\",\"Loading fixes...\":\"수정 로드 중...\",\"Look for Fixes\":\"수정 찾기\",\"LuaTools backend unavailable\":\"LuaTools 백엔드를 사용할 수 없음\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · 추가된 게임\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"게임 관리\",\"Missing\":\"누락\",\"No games found.\":\"게임을 찾을 수 없습니다.\",\"No generic fix\":\"일반 수정 없음\",\"No online-fix\":\"온라인 수정 없음\",\"No updates available.\":\"사용 가능한 업데이트가 없습니다.\",\"No workshop for the game\":\"이 게임에는 워크숍이 없습니다\",\"Not found\":\"찾을 수 없음\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"온라인 수정을 찾았습니다!\",\"Only possible thanks to {name} 💜\":\"{name} 덕분에 가능했습니다 💜\",\"Proceed\":\"계속\",\"Processing package…\":\"패키지 처리 중…\",\"Remove via LuaTools\":\"LuaTools로 제거\",\"Removed {count} files. Running Steam verification...\":\"{count}개 파일 제거됨. Steam 검증 실행 중...\",\"Removing fix files...\":\"수정 파일 제거 중...\",\"Restart Steam\":\"Steam 재시작\",\"Restart Steam now?\":\"지금 Steam을 재시작하시겠습니까?\",\"Searching across sources...\":\"소스 검색 중...\",\"Select Download Source\":\"다운로드 소스 선택\",\"Settings\":\"설정\",\"Skipped\":\"건너뜀\",\"The game has been added successfully.\":\"게임이 성공적으로 추가되었습니다.\",\"This game may not work, support for it wont be given in our discord\":\"이 게임은 작동하지 않을 수 있으며, 저희 디스코드에서 지원되지 않습니다\",\"Un-Fix (verify game)\":\"수정 되돌리기 (게임 검증)\",\"Un-Fixing game\":\"게임 수정 되돌리는 중\",\"Unknown Game\":\"알 수 없는 게임\",\"Unknown error\":\"알 수 없는 오류\",\"Usage\":\"사용량\",\"Verifying API limits...\":\"API 제한 확인 중...\",\"Waiting…\":\"대기 중…\",\"Working…\":\"작업 중…\",\"Workshop: \":\"워크숍: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"일일 다운로드 한도를 초과했습니다. 내일까지 기다리거나 Morrenus 웹사이트에서 플랜을 업그레이드하세요.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Morrenus API 키가 유효하지 않거나 만료되었습니다. 설정에서 키를 확인하거나 Morrenus 웹사이트에서 재생성하세요.\",\"bigpicture.mouseTip\":\"Steam에서 마우스 모드를 사용하려면: 가이드 버튼 + 오른쪽 조이스틱, RB로 클릭\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"지원되지 않는 옵션 유형: {type}\",\"common.status.error\":\"오류\",\"common.status.loading\":\"로드 중...\",\"common.status.success\":\"성공\",\"common.translationMissing\":\"번역 누락\",\"common.warning\":\"경고\",\"days left\":\"일 남음\",\"disclaimer.inputLabel\":\"계속하려면 아래 입력란에 \\\"이해합니다\\\"를 입력하세요\",\"disclaimer.inputPlaceholder\":\"이해합니다\",\"disclaimer.line1\":\"LuaTools는 Millennium과 어떠한 관련도 없습니다\",\"disclaimer.line2\":\"Millennium은 Discord 서버에서 이 플러그인에 대한 지원을 제공하지 않습니다\",\"disclaimer.line3\":\"Millennium Discord에서 도움을 요청하면 LuaTools와 Millennium 서버 모두에서 차단됩니다\",\"disclaimer.title\":\"중요 공지\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"수정 가능\",\"gameStatus.playable\":\"플레이 가능\",\"gameStatus.unplayable\":\"플레이 불가\",\"menu.advancedLabel\":\"고급\",\"menu.checkForUpdates\":\"업데이트 확인\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"게임 경로를 가져오는 중 오류\",\"menu.error.noAppId\":\"게임 AppID를 확인할 수 없습니다\",\"menu.error.noInstall\":\"게임 설치를 찾을 수 없습니다\",\"menu.error.notInstalled\":\"게임이 설치되지 않았습니다! 먼저 추가하고 설치하세요 :D\",\"menu.fetchFreeApis\":\"무료 API 가져오기\",\"menu.fixesMenu\":\"수정 메뉴\",\"menu.joinDiscordLabel\":\"Discord에 참여하세요!\",\"menu.manageGameLabel\":\"게임 관리\",\"menu.remove.confirm\":\"이 게임에서 LuaTools를 제거하시겠습니까?\",\"menu.remove.failure\":\"LuaTools 제거에 실패했습니다.\",\"menu.remove.success\":\"이 앱에서 LuaTools가 제거되었습니다.\",\"menu.removeLuaTools\":\"LuaTools로 제거\",\"menu.settings\":\"설정\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"닫기\",\"settings.donateKeys.description\":\"게임 복호화 키를 기부하여 모두를 도와주세요!\",\"settings.donateKeys.label\":\"키 기부\",\"settings.donateKeys.no\":\"아니오\",\"settings.donateKeys.yes\":\"예\",\"settings.empty\":\"아직 사용 가능한 설정이 없습니다.\",\"settings.error\":\"설정을 로드하지 못했습니다.\",\"settings.fastDownload.description\":\"게임 추가 시 사용 가능한 첫 번째 소스를 자동으로 선택합니다.\",\"settings.fastDownload.label\":\"빠른 다운로드\",\"settings.general\":\"일반\",\"settings.generalDescription\":\"전역 LuaTools 환경 설정.\",\"settings.installedFixes.date\":\"설치일:\",\"settings.installedFixes.delete\":\"삭제\",\"settings.installedFixes.deleteConfirm\":\"이 수정을 제거하시겠습니까? 수정 파일이 삭제되고 Steam 검증이 실행됩니다.\",\"settings.installedFixes.deleteError\":\"수정 제거에 실패했습니다.\",\"settings.installedFixes.deleteSuccess\":\"수정이 성공적으로 제거되었습니다!\",\"settings.installedFixes.deleting\":\"수정 제거 중...\",\"settings.installedFixes.empty\":\"아직 설치된 수정이 없습니다.\",\"settings.installedFixes.error\":\"설치된 수정을 로드하지 못했습니다.\",\"settings.installedFixes.files\":\"{count}개 파일\",\"settings.installedFixes.loading\":\"설치된 수정 검색 중...\",\"settings.installedFixes.title\":\"설치된 수정\",\"settings.installedFixes.type\":\"유형:\",\"settings.installedLua.delete\":\"제거\",\"settings.installedLua.deleteConfirm\":\"이 게임에서 LuaTools를 제거하시겠습니까?\",\"settings.installedLua.deleteError\":\"LuaTools로 제거하지 못했습니다.\",\"settings.installedLua.deleteSuccess\":\"LuaTools로 성공적으로 제거되었습니다!\",\"settings.installedLua.deleting\":\"LuaTools로 제거 중...\",\"settings.installedLua.disabled\":\"비활성화됨\",\"settings.installedLua.empty\":\"아직 설치된 Lua 스크립트가 없습니다.\",\"settings.installedLua.error\":\"설치된 Lua 스크립트를 로드하지 못했습니다.\",\"settings.installedLua.loading\":\"설치된 Lua 스크립트 검색 중...\",\"settings.installedLua.modified\":\"수정일:\",\"settings.installedLua.title\":\"LuaTools로 추가된 게임\",\"settings.installedLua.unknownInfo\":\"'알 수 없는 게임'으로 표시된 게임은 외부에서 설치되었습니다 (LuaTools 외부).\",\"settings.language.description\":\"LuaTools에서 사용할 언어를 선택하세요.\",\"settings.language.label\":\"언어\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"설정 로드 중...\",\"settings.noChanges\":\"저장할 변경 사항이 없습니다.\",\"settings.refresh\":\"새로고침\",\"settings.refreshing\":\"새로고침 중...\",\"settings.save\":\"설정 저장\",\"settings.saveError\":\"설정 저장에 실패했습니다.\",\"settings.saveSuccess\":\"설정이 성공적으로 저장되었습니다.\",\"settings.saving\":\"저장 중...\",\"settings.search.clear\":\"검색 지우기\",\"settings.search.noResults\":\"일치하는 결과 없음\",\"settings.search.placeholder\":\"설정, 게임, 수정 검색...\",\"settings.theme.description\":\"LuaTools 인터페이스의 색상 테마를 선택하세요.\",\"settings.theme.label\":\"테마\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"저장되지 않은 변경 사항\",\"settings.useSteamLanguage.description\":\"LuaTools 설정 대신 Steam 클라이언트의 언어를 사용합니다.\",\"settings.useSteamLanguage.label\":\"Steam 언어 사용\",\"settings.useSteamLanguage.no\":\"아니오\",\"settings.useSteamLanguage.yes\":\"예\",\"{fix} applied successfully!\":\"{fix}이(가) 성공적으로 적용되었습니다!\",\"settings.morrenusApiKey.label\":\"Morrenus API 키\",\"settings.morrenusApiKey.description\":\"Sadie Source를 사용하려면 API 키가 필요합니다. {link}에서 받으세요\",\"settings.morrenusApiKey.placeholder\":\"API 키를 입력하세요\"}",
    "nl": "{\"Add via LuaTools\":\"Toevoegen via LuaTools\",\"Advanced\":\"Geavanceerd\",\"All-In-One Fixes\":\"Alles-in-één fixes\",\"Apply\":\"Toepassen\",\"Applying {fix}\":\"{fix} toepassen\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Weet je zeker dat je de fix wilt verwijderen? Dit verwijdert de fixbestanden en verifieert de spelbestanden.\",\"Are you sure?\":\"Weet je het zeker?\",\"Back\":\"Terug\",\"Base Game\":\"Basisspel\",\"Cancel\":\"Annuleren\",\"Cancellation failed\":\"Annulering mislukt\",\"Cancelled\":\"Geannuleerd\",\"Cancelled by user\":\"Geannuleerd door gebruiker\",\"Cancelled: {reason}\":\"Geannuleerd: {reason}\",\"Cancelling...\":\"Annuleren...\",\"Check for updates\":\"Controleren op updates\",\"Checking availability…\":\"Beschikbaarheid controleren…\",\"Checking content…\":\"Inhoud controleren…\",\"Checking generic fix...\":\"Generieke fix controleren...\",\"Checking key...\":\"Sleutel controleren...\",\"Checking online-fix...\":\"Online-fix controleren...\",\"Checking…\":\"Controleren…\",\"Close\":\"Sluiten\",\"Confirm\":\"Bevestigen\",\"Content details =>\":\"Inhoudsdetails =>\",\"DLC Detected\":\"DLC gedetecteerd\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC's worden samen met het basisspel toegevoegd. Om fixes voor deze DLC toe te voegen, ga naar de pagina van het basisspel: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Negeren\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Downloaden...\",\"Downloading: {percent}%\":\"Downloaden: {percent}%\",\"Downloading…\":\"Downloaden…\",\"Error applying fix\":\"Fout bij toepassen van fix\",\"Error checking for fixes\":\"Fout bij controleren op fixes\",\"Error starting Online Fix\":\"Fout bij starten van online-fix\",\"Error starting un-fix\":\"Fout bij starten van fix-verwijdering\",\"Error! Code: {code}\":\"Fout! Code: {code}\",\"Error, Code: {code}\":\"Fout, Code: {code}\",\"Error, Timed Out\":\"Fout, time-out\",\"Error: {error}\":\"Fout: {error}\",\"Expires\":\"Verloopt\",\"Extracting to game folder...\":\"Uitpakken naar spelmap...\",\"Failed\":\"Mislukt\",\"Failed to cancel fix download\":\"Annuleren van fix-download mislukt\",\"Failed to check for fixes.\":\"Controleren op fixes mislukt.\",\"Failed to load free APIs.\":\"Laden van gratis API's mislukt.\",\"Failed to start fix download\":\"Starten van fix-download mislukt\",\"Failed to start un-fix\":\"Starten van fix-verwijdering mislukt\",\"Failed to verify key\":\"Sleutel verificatie mislukt\",\"Failed: {error}\":\"Mislukt: {error}\",\"Fetch Free API's\":\"Gratis API's ophalen\",\"Fetching game name...\":\"Spelnaam ophalen...\",\"Finishing…\":\"Afronden…\",\"Fixes Menu\":\"Fixesmenu\",\"Found\":\"Gevonden\",\"Game Added!\":\"Spel toegevoegd!\",\"Game added!\":\"Spel toegevoegd!\",\"Game folder\":\"Spelmap\",\"Game install path not found\":\"Installatiepad van spel niet gevonden\",\"Game not found on any available API.\":\"Spel niet gevonden op beschikbare API's.\",\"Generic Fix\":\"Generieke fix\",\"Generic fix found!\":\"Generieke fix gevonden!\",\"Go to Base Game\":\"Ga naar basisspel\",\"Hide\":\"Verbergen\",\"Included\":\"Inbegrepen\",\"Initializing download...\":\"Download initialiseren...\",\"Installing…\":\"Installeren…\",\"Invalid Morrenus API Key format\":\"Ongeldig Morrenus API-sleutelformaat\",\"Invalid key format\":\"Ongeldig sleutelformaat\",\"Invalid or rejected key\":\"Ongeldige of geweigerde sleutel\",\"Join the Discord!\":\"Neem deel aan de Discord!\",\"Left click to install, Right click for SteamDB\":\"Linksklik om te installeren, rechtsklik voor SteamDB\",\"Loaded free APIs: {count}\":\"Gratis API's geladen: {count}\",\"Loading APIs...\":\"API's laden...\",\"Loading fixes...\":\"Fixes laden...\",\"Look for Fixes\":\"Zoek naar fixes\",\"LuaTools backend unavailable\":\"LuaTools-backend niet beschikbaar\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Toegevoegde spellen\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Spel beheren\",\"Missing\":\"Ontbreekt\",\"No games found.\":\"Geen spellen gevonden.\",\"No generic fix\":\"Geen generieke fix\",\"No online-fix\":\"Geen online-fix\",\"No updates available.\":\"Geen updates beschikbaar.\",\"No workshop for the game\":\"Geen workshop voor het spel\",\"Not found\":\"Niet gevonden\",\"Online Fix\":\"Online-fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix gevonden!\",\"Only possible thanks to {name} 💜\":\"Alleen mogelijk dankzij {name} 💜\",\"Proceed\":\"Doorgaan\",\"Processing package…\":\"Pakket verwerken…\",\"Remove via LuaTools\":\"Verwijderen via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} bestanden verwijderd. Steam-verificatie wordt uitgevoerd...\",\"Removing fix files...\":\"Fixbestanden verwijderen...\",\"Restart Steam\":\"Steam herstarten\",\"Restart Steam now?\":\"Steam nu herstarten?\",\"Searching across sources...\":\"Zoeken in alle bronnen...\",\"Select Download Source\":\"Downloadbron selecteren\",\"Settings\":\"Instellingen\",\"Skipped\":\"Overgeslagen\",\"The game has been added successfully.\":\"Het spel is succesvol toegevoegd.\",\"This game may not work, support for it wont be given in our discord\":\"Dit spel werkt mogelijk niet, ondersteuning wordt niet gegeven in onze discord\",\"Un-Fix (verify game)\":\"Fix verwijderen (spel verifiëren)\",\"Un-Fixing game\":\"Fix van spel verwijderen\",\"Unknown Game\":\"Onbekend spel\",\"Unknown error\":\"Onbekende fout\",\"Usage\":\"Gebruik\",\"Verifying API limits...\":\"API-limieten verifiëren...\",\"Waiting…\":\"Wachten…\",\"Working…\":\"Bezig…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Je hebt je dagelijkse downloadlimiet overschreden. Wacht tot morgen of upgrade je plan op de Morrenus-website.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Je Morrenus API-sleutel is ongeldig of verlopen. Controleer je sleutel in de instellingen of genereer een nieuwe op de Morrenus-website.\",\"bigpicture.mouseTip\":\"Linksklik om te installeren, rechtsklik voor SteamDB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Niet-ondersteunde optie\",\"common.status.error\":\"Fout\",\"common.status.loading\":\"Laden\",\"common.status.success\":\"Geslaagd\",\"common.translationMissing\":\"vertaling ontbreekt\",\"common.warning\":\"Waarschuwing\",\"days left\":\"dagen over\",\"disclaimer.inputLabel\":\"Typ \\\"Ik begrijp het\\\" in het veld hieronder om door te gaan\",\"disclaimer.inputPlaceholder\":\"Ik begrijp het\",\"disclaimer.line1\":\"Dit hulpmiddel wordt aangeboden zonder enige garantie.\",\"disclaimer.line2\":\"Gebruik het op eigen risico. Wij zijn niet verantwoordelijk voor eventuele schade.\",\"disclaimer.line3\":\"Door verder te gaan accepteer je deze voorwaarden.\",\"disclaimer.title\":\"Disclaimer\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Heeft fixes nodig\",\"gameStatus.playable\":\"Speelbaar\",\"gameStatus.unplayable\":\"Niet speelbaar\",\"menu.advancedLabel\":\"Geavanceerd\",\"menu.checkForUpdates\":\"Controleren op updates\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Kan spelpad niet ophalen\",\"menu.error.noAppId\":\"Geen App ID gevonden\",\"menu.error.noInstall\":\"Installatiepad niet gevonden\",\"menu.error.notInstalled\":\"Spel is niet geïnstalleerd\",\"menu.fetchFreeApis\":\"Gratis API's ophalen\",\"menu.fixesMenu\":\"Fixesmenu\",\"menu.joinDiscordLabel\":\"Neem deel aan Discord\",\"menu.manageGameLabel\":\"Spel beheren\",\"menu.remove.confirm\":\"Weet je zeker dat je dit spel uit LuaTools wilt verwijderen?\",\"menu.remove.failure\":\"Verwijderen van spel mislukt\",\"menu.remove.success\":\"Spel succesvol verwijderd\",\"menu.removeLuaTools\":\"Verwijderen via LuaTools\",\"menu.settings\":\"Instellingen\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Sluiten\",\"settings.donateKeys.description\":\"Deel ongebruikte spelsleutels om de community te helpen\",\"settings.donateKeys.label\":\"Sleutels doneren\",\"settings.donateKeys.no\":\"Nee\",\"settings.donateKeys.yes\":\"Ja\",\"settings.empty\":\"Geen instellingen beschikbaar\",\"settings.error\":\"Fout bij laden van instellingen\",\"settings.fastDownload.description\":\"Automatisch de eerste beschikbare bron kiezen bij het toevoegen van een spel.\",\"settings.fastDownload.label\":\"Snel downloaden\",\"settings.general\":\"Algemeen\",\"settings.generalDescription\":\"Algemene LuaTools-instellingen\",\"settings.installedFixes.date\":\"Datum\",\"settings.installedFixes.delete\":\"Verwijderen\",\"settings.installedFixes.deleteConfirm\":\"Weet je zeker dat je deze fix wilt verwijderen?\",\"settings.installedFixes.deleteError\":\"Fout bij verwijderen van fix\",\"settings.installedFixes.deleteSuccess\":\"Fix succesvol verwijderd\",\"settings.installedFixes.deleting\":\"Verwijderen…\",\"settings.installedFixes.empty\":\"Geen geïnstalleerde fixes\",\"settings.installedFixes.error\":\"Fout bij laden van geïnstalleerde fixes\",\"settings.installedFixes.files\":\"Bestanden\",\"settings.installedFixes.loading\":\"Geïnstalleerde fixes laden…\",\"settings.installedFixes.title\":\"Geïnstalleerde fixes\",\"settings.installedFixes.type\":\"Type\",\"settings.installedLua.delete\":\"Verwijderen\",\"settings.installedLua.deleteConfirm\":\"Weet je zeker dat je dit Lua-script wilt verwijderen?\",\"settings.installedLua.deleteError\":\"Fout bij verwijderen van Lua-script\",\"settings.installedLua.deleteSuccess\":\"Lua-script succesvol verwijderd\",\"settings.installedLua.deleting\":\"Verwijderen…\",\"settings.installedLua.disabled\":\"Uitgeschakeld\",\"settings.installedLua.empty\":\"Geen geïnstalleerde Lua-scripts\",\"settings.installedLua.error\":\"Fout bij laden van Lua-scripts\",\"settings.installedLua.loading\":\"Lua-scripts laden…\",\"settings.installedLua.modified\":\"Gewijzigd\",\"settings.installedLua.title\":\"Geïnstalleerde Lua-scripts\",\"settings.installedLua.unknownInfo\":\"Geen informatie beschikbaar\",\"settings.language.description\":\"Kies de taal voor de LuaTools-interface\",\"settings.language.label\":\"Taal\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Laden…\",\"settings.noChanges\":\"Geen wijzigingen om op te slaan\",\"settings.refresh\":\"Vernieuwen\",\"settings.refreshing\":\"Vernieuwen…\",\"settings.save\":\"Opslaan\",\"settings.saveError\":\"Fout bij opslaan van instellingen\",\"settings.saveSuccess\":\"Instellingen succesvol opgeslagen\",\"settings.saving\":\"Opslaan…\",\"settings.search.clear\":\"Wissen\",\"settings.search.noResults\":\"Geen resultaten gevonden\",\"settings.search.placeholder\":\"Zoeken in instellingen…\",\"settings.theme.description\":\"Kies het thema voor de LuaTools-interface\",\"settings.theme.label\":\"Thema\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Je hebt niet-opgeslagen wijzigingen\",\"settings.useSteamLanguage.description\":\"Automatisch de in Steam ingestelde taal gebruiken\",\"settings.useSteamLanguage.label\":\"Steam-taal gebruiken\",\"settings.useSteamLanguage.no\":\"Nee\",\"settings.useSteamLanguage.yes\":\"Ja\",\"{fix} applied successfully!\":\"{fix} succesvol toegepast!\",\"settings.morrenusApiKey.label\":\"Morrenus API-sleutel\",\"settings.morrenusApiKey.description\":\"API-sleutel vereist voor Sadie Source. Verkrijg via {link}\",\"settings.morrenusApiKey.placeholder\":\"Voer uw API-sleutel in\"}",
    "no": "{\"Add via LuaTools\":\"Legg til via LuaTools\",\"Advanced\":\"Avansert\",\"All-In-One Fixes\":\"Alt-i-ett fikser\",\"Apply\":\"Bruk\",\"Applying {fix}\":\"Bruker {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Er du sikker på at du vil fjerne fiksen? Dette vil slette fiks-filer og verifisere spillfilene.\",\"Are you sure?\":\"Er du sikker?\",\"Back\":\"Tilbake\",\"Base Game\":\"Hovedspill\",\"Cancel\":\"Avbryt\",\"Cancellation failed\":\"Avbrytelse mislyktes\",\"Cancelled\":\"Avbrutt\",\"Cancelled by user\":\"Avbrutt av bruker\",\"Cancelled: {reason}\":\"Avbrutt: {reason}\",\"Cancelling...\":\"Avbryter...\",\"Check for updates\":\"Se etter oppdateringer\",\"Checking availability…\":\"Sjekker tilgjengelighet…\",\"Checking content…\":\"Sjekker innhold…\",\"Checking generic fix...\":\"Sjekker generell fiks...\",\"Checking key...\":\"Kontrollerer nøkkel...\",\"Checking online-fix...\":\"Sjekker online-fix...\",\"Checking…\":\"Sjekker…\",\"Close\":\"Lukk\",\"Confirm\":\"Bekreft\",\"Content details =>\":\"Innholdsdetaljer =>\",\"DLC Detected\":\"DLC oppdaget\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC-er legges til sammen med hovedspillet. For å legge til fikser for denne DLC-en, gå til hovedspillets side: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Avvis\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Laster ned...\",\"Downloading: {percent}%\":\"Laster ned: {percent}%\",\"Downloading…\":\"Laster ned…\",\"Error applying fix\":\"Feil ved bruk av fiks\",\"Error checking for fixes\":\"Feil ved søk etter fikser\",\"Error starting Online Fix\":\"Feil ved start av Online Fix\",\"Error starting un-fix\":\"Feil ved fjerning av fiks\",\"Error! Code: {code}\":\"Feil! Kode: {code}\",\"Error, Code: {code}\":\"Feil, Kode: {code}\",\"Error, Timed Out\":\"Feil, tidsavbrudd\",\"Error: {error}\":\"Feil: {error}\",\"Expires\":\"Utløper\",\"Extracting to game folder...\":\"Pakker ut til spillmappe...\",\"Failed\":\"Mislyktes\",\"Failed to cancel fix download\":\"Kunne ikke avbryte nedlasting av fiks\",\"Failed to check for fixes.\":\"Kunne ikke søke etter fikser.\",\"Failed to load free APIs.\":\"Kunne ikke laste inn gratis API-er.\",\"Failed to start fix download\":\"Kunne ikke starte nedlasting av fiks\",\"Failed to start un-fix\":\"Kunne ikke starte fjerning av fiks\",\"Failed to verify key\":\"Kunne ikke verifisere nøkkel\",\"Failed: {error}\":\"Mislyktes: {error}\",\"Fetch Free API's\":\"Hent gratis API-er\",\"Fetching game name...\":\"Henter spillnavn...\",\"Finishing…\":\"Fullfører…\",\"Fixes Menu\":\"Fiks-meny\",\"Found\":\"Funnet\",\"Game Added!\":\"Spill lagt til!\",\"Game added!\":\"Spill lagt til!\",\"Game folder\":\"Spillmappe\",\"Game install path not found\":\"Spillets installasjonsbane ble ikke funnet\",\"Game not found on any available API.\":\"Spillet ble ikke funnet på noen tilgjengelig API.\",\"Generic Fix\":\"Generell fiks\",\"Generic fix found!\":\"Generell fiks funnet!\",\"Go to Base Game\":\"Gå til hovedspill\",\"Hide\":\"Skjul\",\"Included\":\"Inkludert\",\"Initializing download...\":\"Initialiserer nedlasting...\",\"Installing…\":\"Installerer…\",\"Invalid Morrenus API Key format\":\"Ugyldig Morrenus API-nøkkelformat\",\"Invalid key format\":\"Ugyldig nøkkelformat\",\"Invalid or rejected key\":\"Ugyldig eller avvist nøkkel\",\"Join the Discord!\":\"Bli med på Discord!\",\"Left click to install, Right click for SteamDB\":\"Venstreklikk for å installere, høyreklikk for SteamDB\",\"Loaded free APIs: {count}\":\"Lastet inn gratis API-er: {count}\",\"Loading APIs...\":\"Laster API-er...\",\"Loading fixes...\":\"Laster fikser...\",\"Look for Fixes\":\"Søk etter fikser\",\"LuaTools backend unavailable\":\"LuaTools-backend utilgjengelig\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Lagt til spill\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Administrer spill\",\"Missing\":\"Mangler\",\"No games found.\":\"Ingen spill funnet.\",\"No generic fix\":\"Ingen generell fiks\",\"No online-fix\":\"Ingen online-fix\",\"No updates available.\":\"Ingen oppdateringer tilgjengelig.\",\"No workshop for the game\":\"Ingen workshop for spillet\",\"Not found\":\"Ikke funnet\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix funnet!\",\"Only possible thanks to {name} 💜\":\"Kun mulig takket være {name} 💜\",\"Proceed\":\"Fortsett\",\"Processing package…\":\"Behandler pakke…\",\"Remove via LuaTools\":\"Fjern via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} filer fjernet. Kjører Steam-verifisering...\",\"Removing fix files...\":\"Fjerner fiks-filer...\",\"Restart Steam\":\"Start Steam på nytt\",\"Restart Steam now?\":\"Starte Steam på nytt nå?\",\"Searching across sources...\":\"Søker på tvers av kilder...\",\"Select Download Source\":\"Velg nedlastingskilde\",\"Settings\":\"Innstillinger\",\"Skipped\":\"Hoppet over\",\"The game has been added successfully.\":\"Spillet har blitt lagt til.\",\"This game may not work, support for it wont be given in our discord\":\"Dette spillet fungerer kanskje ikke, støtte gis ikke i vår discord\",\"Un-Fix (verify game)\":\"Fjern fiks (verifiser spill)\",\"Un-Fixing game\":\"Fjerner fiks fra spill\",\"Unknown Game\":\"Ukjent spill\",\"Unknown error\":\"Ukjent feil\",\"Usage\":\"Bruk\",\"Verifying API limits...\":\"Verifiserer API-grenser...\",\"Waiting…\":\"Venter…\",\"Working…\":\"Arbeider…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Du har overskredet den daglige nedlastingsgrensen. Vent til i morgen eller oppgrader planen din på Morrenus-nettstedet.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Morrenus API-nøkkelen din er ugyldig eller utløpt. Sjekk nøkkelen i innstillingene eller generer en ny på Morrenus-nettstedet.\",\"bigpicture.mouseTip\":\"For å bruke musemodus i Steam: Guide-knapp + Høyre styrespak, klikk med RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Ustøttet alternativtype: {type}\",\"common.status.error\":\"Feil\",\"common.status.loading\":\"Laster...\",\"common.status.success\":\"Vellykket\",\"common.translationMissing\":\"oversettelse mangler\",\"common.warning\":\"Advarsel\",\"days left\":\"dager igjen\",\"disclaimer.inputLabel\":\"Skriv \\\"Jeg forstår\\\" i feltet nedenfor for å fortsette\",\"disclaimer.inputPlaceholder\":\"Jeg forstår\",\"disclaimer.line1\":\"LuaTools er ikke tilknyttet Millennium på noen måte\",\"disclaimer.line2\":\"Millennium vil IKKE gi deg støtte for denne utvidelsen på deres Discord-server\",\"disclaimer.line3\":\"Du vil bli UTESTENGT fra både LuaTools og Millennium sine servere hvis du spør om hjelp på deres Discord\",\"disclaimer.title\":\"Viktig melding\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Fiks tilgjengelig\",\"gameStatus.playable\":\"Spillbar\",\"gameStatus.unplayable\":\"Ikke spillbar\",\"menu.advancedLabel\":\"Avansert\",\"menu.checkForUpdates\":\"Se etter oppdateringer\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Feil ved henting av spillbane\",\"menu.error.noAppId\":\"Kunne ikke finne spillets AppID\",\"menu.error.noInstall\":\"Kunne ikke finne spillinstallasjonen\",\"menu.error.notInstalled\":\"Spillet er ikke installert! Legg det til og installer det først :D\",\"menu.fetchFreeApis\":\"Hent gratis API-er\",\"menu.fixesMenu\":\"Fiks-meny\",\"menu.joinDiscordLabel\":\"Bli med på Discord!\",\"menu.manageGameLabel\":\"Administrer spill\",\"menu.remove.confirm\":\"Fjerne via LuaTools for dette spillet?\",\"menu.remove.failure\":\"Kunne ikke fjerne LuaTools.\",\"menu.remove.success\":\"LuaTools fjernet for denne appen.\",\"menu.removeLuaTools\":\"Fjern via LuaTools\",\"menu.settings\":\"Innstillinger\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Lukk\",\"settings.donateKeys.description\":\"Doner dekrypteringsnøkler for spill, det hjelper alle!\",\"settings.donateKeys.label\":\"Doner nøkler\",\"settings.donateKeys.no\":\"Nei\",\"settings.donateKeys.yes\":\"Ja\",\"settings.empty\":\"Ingen innstillinger tilgjengelig ennå.\",\"settings.error\":\"Kunne ikke laste inn innstillinger.\",\"settings.fastDownload.description\":\"Velg automatisk den første tilgjengelige kilden når du legger til et spill.\",\"settings.fastDownload.label\":\"Hurtignedlasting\",\"settings.general\":\"Generelt\",\"settings.generalDescription\":\"Globale LuaTools-innstillinger.\",\"settings.installedFixes.date\":\"Installert:\",\"settings.installedFixes.delete\":\"Slett\",\"settings.installedFixes.deleteConfirm\":\"Er du sikker på at du vil fjerne denne fiksen? Dette vil slette fiks-filer og kjøre Steam-verifisering.\",\"settings.installedFixes.deleteError\":\"Kunne ikke fjerne fiksen.\",\"settings.installedFixes.deleteSuccess\":\"Fiks fjernet!\",\"settings.installedFixes.deleting\":\"Fjerner fiks...\",\"settings.installedFixes.empty\":\"Ingen fikser installert ennå.\",\"settings.installedFixes.error\":\"Kunne ikke laste inn installerte fikser.\",\"settings.installedFixes.files\":\"{count} filer\",\"settings.installedFixes.loading\":\"Søker etter installerte fikser...\",\"settings.installedFixes.title\":\"Installerte fikser\",\"settings.installedFixes.type\":\"Type:\",\"settings.installedLua.delete\":\"Fjern\",\"settings.installedLua.deleteConfirm\":\"Fjerne via LuaTools for dette spillet?\",\"settings.installedLua.deleteError\":\"Kunne ikke fjerne via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Fjernet via LuaTools!\",\"settings.installedLua.deleting\":\"Fjerner via LuaTools...\",\"settings.installedLua.disabled\":\"Deaktivert\",\"settings.installedLua.empty\":\"Ingen Lua-skript installert ennå.\",\"settings.installedLua.error\":\"Kunne ikke laste inn installerte Lua-skript.\",\"settings.installedLua.loading\":\"Søker etter installerte Lua-skript...\",\"settings.installedLua.modified\":\"Endret:\",\"settings.installedLua.title\":\"Spill via LuaTools\",\"settings.installedLua.unknownInfo\":\"Spill som viser 'Ukjent spill' ble installert fra eksterne kilder (ikke via LuaTools).\",\"settings.language.description\":\"Velg språket som brukes av LuaTools.\",\"settings.language.label\":\"Språk\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Laster innstillinger...\",\"settings.noChanges\":\"Ingen endringer å lagre.\",\"settings.refresh\":\"Oppdater\",\"settings.refreshing\":\"Oppdaterer...\",\"settings.save\":\"Lagre innstillinger\",\"settings.saveError\":\"Kunne ikke lagre innstillinger.\",\"settings.saveSuccess\":\"Innstillinger lagret.\",\"settings.saving\":\"Lagrer...\",\"settings.search.clear\":\"Tøm søk\",\"settings.search.noResults\":\"Ingen treff\",\"settings.search.placeholder\":\"Søk i innstillinger, spill, fikser...\",\"settings.theme.description\":\"Velg fargetema for LuaTools-grensesnittet.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Ulagrede endringer\",\"settings.useSteamLanguage.description\":\"Bruk Steam-klientens språk i stedet for LuaTools-innstillingen.\",\"settings.useSteamLanguage.label\":\"Bruk Steam-språk\",\"settings.useSteamLanguage.no\":\"Nei\",\"settings.useSteamLanguage.yes\":\"Ja\",\"{fix} applied successfully!\":\"{fix} ble brukt!\",\"settings.morrenusApiKey.label\":\"Morrenus API-nøkkel\",\"settings.morrenusApiKey.description\":\"API-nøkkel kreves for å bruke Sadie Source. Hent fra {link}\",\"settings.morrenusApiKey.placeholder\":\"Skriv inn API-nøkkelen din\"}",
    "peakstupid": "{\"Add via LuaTools\":\"Addeded Gaem Wit LooaToolz Ting\",\"Advanced\":\"Hard Stuffz (4 smat ppl not 4 me me 2 dum brain herts)\",\"All-In-One Fixes\":\"All Da Fixs In Won Singel Plase\",\"Apply\":\"Do It Rite Now Pls\",\"Applying {fix}\":\"doinged da {fix} ting rite now holded on wait pls...\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"u sur u wana un-fixded??? itll deletdeded da fix filez n chekded da gaem filez r u sur??? rlly rlly rlly sur??? tripel chek???\",\"Are you sure?\":\"u sur??? rlly sur??? super duper sur??? uPromIs 4 Reelz??? pinky swer???\",\"Back\":\"Goed Bak 2 Befor\",\"Base Game\":\"Da Base Gaem (da mane won)\",\"Cancel\":\"Cancl Buton\",\"Cancellation failed\":\"couldnt canclded it whoopsie poopsie me failded\",\"Cancelled\":\"canclededed it i stopeded doin da ting k\",\"Cancelled by user\":\"u clikdeded cancl so i stopeded doin da ting k\",\"Cancelled: {reason}\":\"i stopeded it cuz dis reesun: {reason}\",\"Cancelling...\":\"tryinged 2 cancl it wait 1 sec pls holded on...\",\"Check for updates\":\"chekded if deres nu vershun 2 downlod\",\"Checking availability…\":\"chekinged if its avalbal 4 u wait holded on...\",\"Checking content…\":\"chekinged da stuffz insideded wait pls...\",\"Checking generic fix...\":\"chekinged if deres a regulr fix ting...\",\"Checking key...\":\"chekinged da key ting wait pls holded on...\",\"Checking online-fix...\":\"chekinged if deres a onlin fix ting on internets...\",\"Checking…\":\"chekinged stuffz rite now wait pls...\",\"Close\":\"Clos (da lil x buton in cornr)\",\"Confirm\":\"Yeh Im Sur Do It Now Pls\",\"Content details =>\":\"Da Stuffz Detailz Ting =>\",\"DLC Detected\":\"DLC Spotteded Oh No!!!\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"da DLCz r addded 2geder wit da base gaem. 2 addded fixz 4 dis DLC pls goed 2 da base gaem paje: <br><br><b>{gameName}</b>\",\"Discord\":\"Dicsord App\",\"Dismiss\":\"Mak It Goed Awy 4Ever Rite Now\",\"Dlc: \":\"Dee El See Ting: \",\"Downloading...\":\"getinged da filez wait 1 sec or mayb 2 secs...\",\"Downloading: {percent}%\":\"Downlodinged: {percent}% (wait pls dont clik nuthing or it brek)\",\"Downloading…\":\"downlodinged da stuffz holded on pls wait...\",\"Error applying fix\":\"trideded 2 do da fix but it didnt werkded my bad sory\",\"Error checking for fixes\":\"sumting wenteded rong wen i trideded 2 luk 4 fixs\",\"Error starting Online Fix\":\"da onlin fix ting wont strtded uh oh dis bad\",\"Error starting un-fix\":\"couldnt strtded da un-fix ting it no werk\",\"Error! Code: {code}\":\"UH OH BIG OOPSIE!!! Eror Numbr Ting: {code} (wat dis numbr meen??? me cant reed numbrs gud)\",\"Error, Code: {code}\":\"UH OH BIG OOPSIE!!! Eror Numbr Ting: {code} (wat dis numbr meen??? me cant reed numbrs gud)\",\"Error, Timed Out\":\"UH OH BIG OOPSIE!!! IT TOOKEDEDED TOO LONGEDEDED N IT STOPTEDEDED ME CONFUS WHY IT NO WERK\",\"Error: {error}\":\"oh nooo sumting went rong: {error}\",\"Expires\":\"it gon go poof on\",\"Extracting to game folder...\":\"putinged da filez in da gaem foldr ting now wait...\",\"Failed\":\"IT DIDNT WERKDED OOPSIE DAISIES ME FAILDED\",\"Failed to cancel fix download\":\"trideded 2 stop da downlodinged but it didnt werkded whoopsie doodle\",\"Failed to check for fixes.\":\"couldnt chekded 4 fixs it brokededed me tride tho\",\"Failed to load free APIs.\":\"couldnt loddeded da fre API stuffz it brokededed real bad oops\",\"Failed to start fix download\":\"couldnt strtded downlodinged da fix idk y dis hapend\",\"Failed to start un-fix\":\"da un-fix wont werkded sory bout dat idk wat do\",\"Failed to verify key\":\"couldnt chekded da key it brokededed\",\"Failed: {error}\":\"it brokededed bad: {error}\",\"Fetch Free API's\":\"gitded fre API tingz (still dont no wat API is after all dis time lololol)\",\"Fetching game name...\":\"tryinged 2 figur out wat gaem dis is holded on...\",\"Finishing…\":\"almos duneded wait lil tiny bit mor...\",\"Fixes Menu\":\"Fixs Manu\",\"Found\":\"foundededed it yaaaaaay me did it!!!\",\"Game Added!\":\"GAEM ADDEDED YAYYY!!!\",\"Game added!\":\"GAEM GOTTEDED ADEDD YAAAAAAAY ME DID IT IM SO SMAT GUD JERB ME!!!\",\"Game folder\":\"da foldr plase were da gaem livs at on ur compooter\",\"Game install path not found\":\"i cant finde were da gaem is instaldeded at halp me pls im lost\",\"Game not found on any available API.\":\"computer say no. no findy.\",\"Generic Fix\":\"Regulr Fixded (da norml won not da fancy won)\",\"Generic fix found!\":\"foundededed a regulr fix YAAAAAAAY ME SO GUD AT FINDIN!!!\",\"Go to Base Game\":\"Goed 2 Da Base Gaem Rite Now\",\"Hide\":\"Hied Buton (mak it invisbal like magic)\",\"Included\":\"ITS IN DERE YAY\",\"Initializing download...\":\"getting ready for big fetch...\",\"Installing…\":\"putinged it on ur compooter masheen rite now wait...\",\"Invalid Morrenus API Key format\":\"da morrenus key ting lookeded rong formatteded\",\"Invalid key format\":\"da key lookeded rong formatteded\",\"Invalid or rejected key\":\"da key is no gud or it got rejecteded\",\"Join the Discord!\":\"COM JION DA DICSORD SERVER PLS!!! WERE SUPER NISE PPL I PROMIS!!!\",\"Left click to install, Right click for SteamDB\":\"clikded left buton 2 instal da ting or clikded rite buton 4 SteamDB ting (idk wat dat is just clikded stuffz til sumting hapens lol)\",\"Loaded free APIs: {count}\":\"i lodeded {count} fre API tingz (still dont no wat API meens tho lol)\",\"Loading APIs...\":\"waitin for robot friends...\",\"Loading fixes...\":\"lukinged 4 fixs stuffz wait 1 sec pls...\",\"Look for Fixes\":\"Finded Fixs (luk around evrywere)\",\"LuaTools backend unavailable\":\"da LooaToolz bakend ting isnt werkinged rite now idk y it brok mayb???\",\"LuaTools · AIO Fixes Menu\":\"LooaToolz · All In Won Fixs Manu Ting\",\"LuaTools · Added Games\":\"LooaToolz · Gaemz U Adedded Befor\",\"LuaTools · Fixes Menu\":\"LooaToolz · Fixs Manu Ting\",\"LuaTools · Menu\":\"LooaToolz · Da Manu\",\"LuaTools · {api}\":\"LooaToolz · {api} Ting\",\"Manage Game\":\"Do Gaem Manageded Stuffz\",\"Missing\":\"IT GONED OH NO\",\"No games found.\":\"deres no gaemz hear yet at all com bak latr mayb deres sum then???\",\"No generic fix\":\"no regulr fix existd sory bout dat mayb latr???\",\"No online-fix\":\"no onlin fix existdeded 4 dis gaem it ded\",\"No updates available.\":\"no nu updatz existd sory ur stuk wit dis old vershun 4ever n ever\",\"No workshop for the game\":\"deres no werkshop 4 dis gaem dats ok tho\",\"Not found\":\"couldnt findeded it anywere at all sory me tride\",\"Online Fix\":\"Onlin Fixded (da internets won ting)\",\"Online Fix (Unsteam)\":\"Onlin Fixded (da Unsteam vershun ting idk wat dat meens tho)\",\"Online-fix found!\":\"foundededed a onlin fix YAAAAAAAY ME SMAT COOKEE 4 ME!!!\",\"Only possible thanks to {name} 💜\":\"dis only werkdeded cuz of {name} 💜 (tank u so so so much ur da best)\",\"Proceed\":\"okie dokie lets gooo\",\"Processing package…\":\"doinged stuffz 2 da pakage ting idk wat tho looks fancy...\",\"Remove via LuaTools\":\"Deletdeded Wit LooaToolz\",\"Removed {count} files. Running Steam verification...\":\"i deletdeded {count} filez now im makinged steam chekded stuffz k wait...\",\"Removing fix files...\":\"deletinged da fix filez bye bye 4ever...\",\"Restart Steam\":\"turndeded Steam ofed n on agen (fix evrything)\",\"Restart Steam now?\":\"u wana restrtded Steam rite now??? do u??? rlly???\",\"Searching across sources...\":\"lookin evrywhere for the thingy...\",\"Select Download Source\":\"clik button for get\",\"Settings\":\"Setinz\",\"Skipped\":\"skippededed it cuz we didented need it\",\"The game has been added successfully.\":\"da gaem got addeded it workeded yayyyy!!!\",\"This game may not work, support for it wont be given in our discord\":\"broke game probably, dont cry in discord\",\"Un-Fix (verify game)\":\"Un-Fixded (chekded if gaem is ok n gud)\",\"Un-Fixing game\":\"takinged da fix ofed da gaem rite now wait...\",\"Unknown Game\":\"idk idk idk wat gaem dis is lololol sory bout dat\",\"Unknown error\":\"sumting wenteded super duper rong but idk wat hapend lololol me confus\",\"Usage\":\"howw much u useded\",\"Verifying API limits...\":\"chekinged if u can stil downlod stuffz...\",\"Waiting…\":\"waitinged pls holded on rite now...\",\"Working…\":\"doin stuffz rite now wait pls holded on...\",\"Workshop: \":\"Werkshop Ting: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"u downlodeded 2 much 2day!!! wait til 2morrow 4 moar or get bettr plan on da morrenus websiteded!!!\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"ur morrenus key ting is no gud or it expireded!!! go 2 da settings n chekded it or get a nu won from da morrenus websiteded!!!\",\"bigpicture.mouseTip\":\"2 use mous moded in steam: guid buton + rite joystik, clikded wit RB\",\"common.alert.ok\":\"OK Buton (i git it now mayb)\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"dis option ting isnt werkinged cuz: {type} (idk wat dat meens tho lol)\",\"common.status.error\":\"UH OH SUMTING BROKEDEDED BAD\",\"common.status.loading\":\"Lodinged Da Ting Pls Wait 4 It...\",\"common.status.success\":\"YAAAAAAAY IT WERKDEDED!!! ME DID IT!!! IM SMAT!!!\",\"common.translationMissing\":\"oopsie whoopsie i forgordeded 2 translat dis won my bad lololol\",\"common.warning\":\"WARNIN!!! SUMTING BAD MITE HAPEN!!! B CARFUL!!!\",\"days left\":\"dayz leftded\",\"disclaimer.inputLabel\":\"tipe \\\"i undrstood it\\\" in da lil box belo 2 continu pls\",\"disclaimer.inputPlaceholder\":\"i undrstood it\",\"disclaimer.line1\":\"LooaToolz iz NOT da saem as Millennium dey r 2 diffrnt tingz ok sory if confuz\",\"disclaimer.line2\":\"Millennium wil NOT halp u wit dis plugin ting on der dicsord server nope\",\"disclaimer.line3\":\"u will getded SUPER BANED from bof LooaToolz n Millennium if u go der askinged 4 halp so dont do dat ok???\",\"disclaimer.title\":\"IMPORTNT NOTIC!!! REED DIS PLS!!!\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Fix Available\",\"gameStatus.playable\":\"Playable\",\"gameStatus.unplayable\":\"Unplayable\",\"menu.advancedLabel\":\"Advansed Stuffz (2 hard 4 me brain herts)\",\"menu.checkForUpdates\":\"C If Deres Nu Stuffz 2 Downlod\",\"menu.discord\":\"Dicsord App (da chat ting were ppl tok)\",\"menu.error.getPath\":\"i gotteded super confusd tryin 2 finde da gaem foldr sory me dum\",\"menu.error.noAppId\":\"idk idk idk wat gaem dis is lolololol me confus\",\"menu.error.noInstall\":\"were da gaem at??? i luked evrywere i cant finde it anywere halp me pls\",\"menu.error.notInstalled\":\"da gaem isnt instaldeded yet!!! u gotta addededed it n instaldeded it first b4 u can do stuffz wit it k :D\",\"menu.fetchFreeApis\":\"Git Fre API Tingz (wat r dose??? souns fancy)\",\"menu.fixesMenu\":\"Fixs Manu Ting\",\"menu.joinDiscordLabel\":\"Jion da Dicsord Server Pls!!! (com hang out wit us)\",\"menu.manageGameLabel\":\"Do Stuffz Wit Ur Gaem\",\"menu.remove.confirm\":\"u sur u wana delet LooaToolz 4 dis gaem??? rlly rlly sur??? pinky promis???\",\"menu.remove.failure\":\"oopsies daisies couldnt deletdeded it sory my bad i tride tho\",\"menu.remove.success\":\"ok i deletdeded LooaToolz 4 dis gaem it goned now gud bye 4ever\",\"menu.removeLuaTools\":\"Delet LooaToolz 4Ever (bye bye)\",\"menu.settings\":\"Setinz Ting\",\"menu.title\":\"LooaToolz · Da Manu Ting\",\"settings.close\":\"Clos Buton (maek it goed away 4ever pls)\",\"settings.donateKeys.description\":\"giv ur decript keyz 2 halp othr ppl i gess dats nise rite??? mayb dey giv u cookee???\",\"settings.donateKeys.label\":\"Giv Awy Keyz 2 Ppl 4 Fre\",\"settings.donateKeys.no\":\"Naw Bro\",\"settings.donateKeys.yes\":\"Ye Pls\",\"settings.empty\":\"der no setinz hear yet dummy wait 4 it mayb???\",\"settings.error\":\"uh oh da setinz brok i thinked??? mayb??? idk lol\",\"settings.fastDownload.description\":\"just pick the first one i dont care.\",\"settings.fastDownload.label\":\"Zoom Zoom\",\"settings.general\":\"Genrel Stuffz N Tingz\",\"settings.generalDescription\":\"da mane LooaToolz setinz n stuffz n tingz i gess??? idk wat dis do lol\",\"settings.installedFixes.date\":\"Instaldeded At:\",\"settings.installedFixes.delete\":\"Deletdeded It 4Ever (bye bye)\",\"settings.installedFixes.deleteConfirm\":\"u sur u wana deleteded dis fix??? itll deleteded da fix filez n chekdeded steam stuffz r u sur??? rlly rlly sur???\",\"settings.installedFixes.deleteError\":\"oopsie daisies couldnt deleteded it sory my bad i tride tho\",\"settings.installedFixes.deleteSuccess\":\"YAAAAAAAY FIX DELETDEDED!!! ME DID GUD JERB!!!\",\"settings.installedFixes.deleting\":\"deletingeded da fix rite now wait pls holded on...\",\"settings.installedFixes.empty\":\"deres no fixs instaldeded yet dummy wait 4 it mayb???\",\"settings.installedFixes.error\":\"oopsie whoopsie couldnt loddeded da fixs sory my bad\",\"settings.installedFixes.files\":\"{count} filez (dat alot mayb???)\",\"settings.installedFixes.loading\":\"lukinged 4 fixs dat r alredy on ur compooter wait pls...\",\"settings.installedFixes.title\":\"Fixs Dat R Instaldeded (da wonz u puted on ur gaem)\",\"settings.installedFixes.type\":\"Wat Kind:\",\"settings.installedLua.delete\":\"Delet LooaToolz 4Ever (bye bye)\",\"settings.installedLua.deleteConfirm\":\"u sur u wana deleteded LooaToolz 4 dis gaem??? rlly rlly sur??? pinky promis???\",\"settings.installedLua.deleteError\":\"oopsie daisies couldnt deleteded it wit LooaToolz sory my bad i tride tho\",\"settings.installedLua.deleteSuccess\":\"YAAAAAAAY DELETDEDED WIT LOOATOOLZ!!! ME DID GUD JERB!!!\",\"settings.installedLua.deleting\":\"deletingeded wit LooaToolz rite now wait pls holded on...\",\"settings.installedLua.disabled\":\"Turneded Ofed (it no werk)\",\"settings.installedLua.empty\":\"deres no lua scriptz instaldeded yet dummy wait 4 it mayb???\",\"settings.installedLua.error\":\"oopsie whoopsie couldnt loddeded da lua scriptz sory my bad\",\"settings.installedLua.loading\":\"lukinged 4 lua scriptz dat r alredy on ur compooter wait pls...\",\"settings.installedLua.modified\":\"Changededed At:\",\"settings.installedLua.title\":\"Gaemz Dat R On Ur Compooter Wit LooaToolz\",\"settings.installedLua.unknownInfo\":\"gaemz dat say 'idk wat gaem dis is lololol' were puteded on ur compooter from sumwere else not wit LooaToolz (idk y tho mayb dey dum???)\",\"settings.language.description\":\"pik wut werd LooaToolz uz duh its eesy peesy lemon squeesy\",\"settings.language.label\":\"Languge Ting (how u tok 2 compootr)\",\"settings.language.option.en\":\"Inglsh (borring)\",\"settings.language.option.pt-BR\":\"Braziliyan Portgees Languged (were dat countrys at??? idk geogrofee)\",\"settings.loading\":\"loding da setinz thingy wait pls i slow...\",\"settings.noChanges\":\"bruh u didnt even changeded NUTHING at all stoopid hed\",\"settings.refresh\":\"Refrsh Buton (da clicky clicky)\",\"settings.refreshing\":\"refreshinged da ting wait holded on...\",\"settings.save\":\"Savde All Da Setinz Rite Now Pls\",\"settings.saveError\":\"oopsie whoopsie doopsie couldnt savde ur stuffz sory\",\"settings.saveSuccess\":\"YAAAAAAAY SETINZ SAVDEDED!!! ME DID GUD JERB!!! 🎉\",\"settings.saving\":\"savdinged ur stuffz holded on 1 sec pls wait...\",\"settings.search.clear\":\"Clr Serch Buton\",\"settings.search.noResults\":\"no matchz foundeded sory bout dat me tride\",\"settings.search.placeholder\":\"serch setinz gaemz fixz stuffz...\",\"settings.theme.description\":\"chos da colr themed 4 da LooaToolz interfase thingy\",\"settings.theme.label\":\"Themed\",\"settings.title\":\"LooaToolz · Setinz (how spel??? halp)\",\"settings.unsaved\":\"u didnt clickeded savde yet dum dum hed\",\"settings.useSteamLanguage.description\":\"Use Steam client's language instead of LuaTools setting ngl fr.\",\"settings.useSteamLanguage.label\":\"Use Steam Language ong\",\"settings.useSteamLanguage.no\":\"CAP\",\"settings.useSteamLanguage.yes\":\"YESSIR\",\"{fix} applied successfully!\":\"{fix} werkdeded!!! YAAAAAAAY GUD JERB ME SO SMAT!!!\",\"settings.morrenusApiKey.label\":\"Mornus Key\",\"settings.morrenusApiKey.description\":\"Key make Sadie go brrr. Get key at {link}\",\"settings.morrenusApiKey.placeholder\":\"Smash key here\"}",
    "pirate": "{\"Add via LuaTools\":\"Plunder via LuaTools\",\"Advanced\":\"Fer Seasoned Sailors\",\"All-In-One Fixes\":\"All-In-One Patchwork\",\"Apply\":\"Make it so!\",\"Applying {fix}\":\"Applyin' {fix} to the hull...\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Ye sure ye wanna undo the patchwork? This'll rip out the fix planks n' inspect the hull!\",\"Are you sure?\":\"Ye sure about that, matey?\",\"Back\":\"Retreat!\",\"Base Game\":\"The Main Vessel\",\"Cancel\":\"Abandon Ship!\",\"Cancellation failed\":\"Couldn't abandon ship in time!\",\"Cancelled\":\"Voyage abandoned!\",\"Cancelled by user\":\"The captain called it off!\",\"Cancelled: {reason}\":\"Voyage abandoned: {reason}\",\"Cancelling...\":\"Abandonin' ship...\",\"Check for updates\":\"Scout fer new charts\",\"Checking availability…\":\"Sendin' out the scouts…\",\"Checking content…\":\"Inspectin' the cargo…\",\"Checking generic fix...\":\"Lookin' fer a standard patch...\",\"Checking key...\":\"Inspectin' yer papers...\",\"Checking online-fix...\":\"Searchin' the seas fer an online patch...\",\"Checking…\":\"Keepin' a weather eye out…\",\"Close\":\"Batten down!\",\"Confirm\":\"Aye aye!\",\"Content details =>\":\"Cargo manifest =>\",\"DLC Detected\":\"Extra Treasure Detected\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"Extra treasure be bundled with the main vessel. To patch this booty, sail to the main vessel's page: <br><br><b>{gameName}</b>\",\"Discord\":\"Tavern\",\"Dismiss\":\"Walk away\",\"Dlc: \":\"Extra Booty: \",\"Downloading...\":\"Haulin' cargo...\",\"Downloading: {percent}%\":\"Haulin': {percent}%\",\"Downloading…\":\"Haulin' the loot aboard…\",\"Error applying fix\":\"Blimey! Couldn't nail the patch to the hull!\",\"Error checking for fixes\":\"Blimey! Couldn't scout fer patches!\",\"Error starting Online Fix\":\"Blimey! Couldn't start the online patchwork!\",\"Error starting un-fix\":\"Blimey! Couldn't undo the patchwork!\",\"Error! Code: {code}\":\"Shiver me timbers! Code: {code}\",\"Error, Code: {code}\":\"Blimey, Code: {code}\",\"Error, Timed Out\":\"Timed out! The wind died on us!\",\"Error: {error}\":\"Blimey! {error}\",\"Expires\":\"Expires (then it's Davy Jones' locker)\",\"Extracting to game folder...\":\"Unloadin' the cargo to port...\",\"Failed\":\"Shipwrecked!\",\"Failed to cancel fix download\":\"Couldn't stop the cargo mid-haul!\",\"Failed to check for fixes.\":\"Couldn't scout the waters fer patches.\",\"Failed to load free APIs.\":\"Couldn't rally the free crew!\",\"Failed to start fix download\":\"Couldn't start haulin' the patch!\",\"Failed to start un-fix\":\"Couldn't start undoin' the patchwork!\",\"Failed to verify key\":\"Couldn't verify yer papers, matey\",\"Failed: {error}\":\"Shipwrecked: {error}\",\"Fetch Free API's\":\"Rally the Free Crew\",\"Fetching game name...\":\"Lookin' up the treasure name...\",\"Finishing…\":\"Droppin' anchor…\",\"Fixes Menu\":\"Patchwork Menu\",\"Found\":\"Treasure ho!\",\"Game Added!\":\"Treasure Secured!\",\"Game added!\":\"Treasure secured!\",\"Game folder\":\"Treasure chest\",\"Game install path not found\":\"Can't find where the treasure be buried!\",\"Game not found on any available API.\":\"Arrr, no treasure found in any cove!\",\"Generic Fix\":\"Standard Patchwork\",\"Generic fix found!\":\"Standard patchwork found, cap'n!\",\"Go to Base Game\":\"Sail to the Main Vessel\",\"Hide\":\"Stow away\",\"Included\":\"In the hold! 🎉\",\"Initializing download...\":\"Hoisting the colors...\",\"Installing…\":\"Nailin' it to the hull…\",\"Invalid Morrenus API Key format\":\"That Morrenus key don't look right, ye scallywag\",\"Invalid key format\":\"That key be malformed, ye bilge rat\",\"Invalid or rejected key\":\"Yer key be counterfeit or walked the plank\",\"Join the Discord!\":\"Join the Tavern!\",\"Left click to install, Right click for SteamDB\":\"Left click to plunder, Right click fer the charts\",\"Loaded free APIs: {count}\":\"Rallied {count} free crewmates!\",\"Loading APIs...\":\"Gathering the crew...\",\"Loading fixes...\":\"Rummaging fer patchwork...\",\"Look for Fixes\":\"Scout fer Patches\",\"LuaTools backend unavailable\":\"The engine room be flooded!\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · All Patchwork Aboard\",\"LuaTools · Added Games\":\"LuaTools · Plundered Treasure\",\"LuaTools · Fixes Menu\":\"LuaTools · Patchwork Menu\",\"LuaTools · Menu\":\"LuaTools · Captain's Log\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Manage the Loot\",\"Missing\":\"Lost at sea ❌\",\"No games found.\":\"No treasure in sight, cap'n.\",\"No generic fix\":\"No standard patchwork\",\"No online-fix\":\"No online patchwork\",\"No updates available.\":\"No new charts available.\",\"No workshop for the game\":\"No workshop fer this vessel ✅\",\"Not found\":\"Not in these waters\",\"Online Fix\":\"Online Patchwork\",\"Online Fix (Unsteam)\":\"Online Patchwork (Unsteam)\",\"Online-fix found!\":\"Online patchwork found, matey!\",\"Only possible thanks to {name} 💜\":\"Wouldn't be possible without {name}, a true pirate legend 💜\",\"Proceed\":\"Full speed ahead!\",\"Processing package…\":\"Sortin' through the loot…\",\"Remove via LuaTools\":\"Throw overboard via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Tossed {count} items overboard. Inspectin' the hull...\",\"Removing fix files...\":\"Rippin' out the patches...\",\"Restart Steam\":\"Relaunch the Ship\",\"Restart Steam now?\":\"Relaunch the ship now, cap'n?\",\"Searching across sources...\":\"Scouring the seven seas for loot...\",\"Select Download Source\":\"Choose yer vessel fer the haul\",\"Settings\":\"Captain's Quarters\",\"Skipped\":\"Sailed past\",\"The game has been added successfully.\":\"The booty's been stashed in yer hold, cap'n!\",\"This game may not work, support for it wont be given in our discord\":\"This bounty might be cursed, no harbor in our tavern fer it\",\"Un-Fix (verify game)\":\"Undo Patchwork (inspect hull)\",\"Un-Fixing game\":\"Undoin' the patchwork\",\"Unknown Game\":\"Mystery Treasure\",\"Unknown error\":\"Unknown curse upon us\",\"Usage\":\"Plunder tally\",\"Verifying API limits...\":\"Checkin' how much loot ye can still plunder...\",\"Waiting…\":\"Waitin' fer the wind…\",\"Working…\":\"Swabbin' the deck…\",\"Workshop: \":\"Shipyard: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Ye've plundered too much booty today! Wait 'til the next sunrise fer more, or upgrade yer ship at the Morrenus port.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Yer Morrenus key be invalid or expired, ye scurvy dog! Check yer key in the captain's quarters or forge a new one at the Morrenus port.\",\"bigpicture.mouseTip\":\"To use yer mouse in Steam: Guide Button + Right Joystick, fire with RB\",\"common.alert.ok\":\"Aye!\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"This contraption be unknown: {type}\",\"common.status.error\":\"Blimey!\",\"common.status.loading\":\"Hoistin' the sails...\",\"common.status.success\":\"Victory!\",\"common.translationMissing\":\"translation missing\",\"common.warning\":\"Beware!\",\"days left\":\"days til ye walk the plank\",\"disclaimer.inputLabel\":\"type \\\"I Understand\\\" in the box below to set sail\",\"disclaimer.inputPlaceholder\":\"I Understand\",\"disclaimer.line1\":\"LuaTools be not affiliated with Millennium in any way, savvy?\",\"disclaimer.line2\":\"Millennium will NOT offer ye support fer this plugin on their discord ship\",\"disclaimer.line3\":\"Ye will be MAROONED from both LuaTools and Millennium waters if ye go askin' fer help on their discord\",\"disclaimer.title\":\"Heed This Warning!\",\"gameStatus.denuvo\":\"Cursed\",\"gameStatus.needsFixes\":\"Needs Patchwork\",\"gameStatus.playable\":\"Seaworthy\",\"gameStatus.unplayable\":\"Sunk\",\"menu.advancedLabel\":\"Fer Seasoned Sailors\",\"menu.checkForUpdates\":\"Scout Fer New Charts\",\"menu.discord\":\"Tavern\",\"menu.error.getPath\":\"Can't chart the course to the treasure!\",\"menu.error.noAppId\":\"Can't identify this here treasure!\",\"menu.error.noInstall\":\"Can't find where this treasure be buried!\",\"menu.error.notInstalled\":\"This treasure ain't aboard yet! Plunder n' stash it first :D\",\"menu.fetchFreeApis\":\"Rally the Free Crew\",\"menu.fixesMenu\":\"Patchwork Menu\",\"menu.joinDiscordLabel\":\"Join the Tavern!\",\"menu.manageGameLabel\":\"Manage the Loot\",\"menu.remove.confirm\":\"Toss this treasure overboard?\",\"menu.remove.failure\":\"Couldn't throw it overboard!\",\"menu.remove.success\":\"Treasure thrown overboard!\",\"menu.removeLuaTools\":\"Throw Overboard\",\"menu.settings\":\"Captain's Quarters\",\"menu.title\":\"LuaTools · Captain's Log\",\"settings.close\":\"Batten down!\",\"settings.donateKeys.description\":\"Share yer decryption keys with the fleet, helps all pirates!\",\"settings.donateKeys.label\":\"Share Yer Keys\",\"settings.donateKeys.no\":\"Nay\",\"settings.donateKeys.yes\":\"Aye\",\"settings.empty\":\"No provisions available yet.\",\"settings.error\":\"Couldn't load the captain's orders!\",\"settings.fastDownload.description\":\"Grab the first booty ye find without askin'!\",\"settings.fastDownload.label\":\"Swift Sailings\",\"settings.general\":\"General Orders\",\"settings.generalDescription\":\"Ship-wide LuaTools preferences.\",\"settings.installedFixes.date\":\"Patched on:\",\"settings.installedFixes.delete\":\"Scuttle\",\"settings.installedFixes.deleteConfirm\":\"Ye sure ye wanna rip this patch off? This'll remove the fix n' inspect the hull!\",\"settings.installedFixes.deleteError\":\"Couldn't scuttle the patch!\",\"settings.installedFixes.deleteSuccess\":\"Patch scuttled successfully!\",\"settings.installedFixes.deleting\":\"Scuttlin' the patch...\",\"settings.installedFixes.empty\":\"No patches nailed to the hull yet.\",\"settings.installedFixes.error\":\"Couldn't check the patchwork!\",\"settings.installedFixes.files\":\"{count} planks\",\"settings.installedFixes.loading\":\"Inspectin' the hull fer patches...\",\"settings.installedFixes.title\":\"Installed Patchwork\",\"settings.installedFixes.type\":\"Type:\",\"settings.installedLua.delete\":\"Throw Overboard\",\"settings.installedLua.deleteConfirm\":\"Toss this treasure overboard?\",\"settings.installedLua.deleteError\":\"Couldn't toss it overboard!\",\"settings.installedLua.deleteSuccess\":\"Treasure tossed overboard!\",\"settings.installedLua.deleting\":\"Tossin' overboard...\",\"settings.installedLua.disabled\":\"Marooned\",\"settings.installedLua.empty\":\"No treasure scripts aboard yet.\",\"settings.installedLua.error\":\"Couldn't check the treasure hold!\",\"settings.installedLua.loading\":\"Searchin' the hold fer treasure scripts...\",\"settings.installedLua.modified\":\"Last plundered:\",\"settings.installedLua.title\":\"Plundered Games\",\"settings.installedLua.unknownInfo\":\"Treasure marked 'Mystery' was stashed from foreign ports (not via LuaTools).\",\"settings.language.description\":\"Choose what tongue LuaTools speaks.\",\"settings.language.label\":\"Tongue\",\"settings.language.option.en\":\"The King's English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Loadin' the captain's orders...\",\"settings.noChanges\":\"Nothin' to change, cap'n.\",\"settings.refresh\":\"Swab the deck\",\"settings.refreshing\":\"Swabbin'...\",\"settings.save\":\"Log the Orders\",\"settings.saveError\":\"Couldn't log the orders!\",\"settings.saveSuccess\":\"Orders logged, cap'n!\",\"settings.saving\":\"Loggin'...\",\"settings.search.clear\":\"Clear the spyglass\",\"settings.search.noResults\":\"Nothin' spotted through the spyglass\",\"settings.search.placeholder\":\"Search the seven seas...\",\"settings.theme.description\":\"Choose the colors fer yer ship's flag.\",\"settings.theme.label\":\"Ship's Colors\",\"settings.title\":\"LuaTools · Captain's Quarters\",\"settings.unsaved\":\"Unlogged changes\",\"settings.useSteamLanguage.description\":\"Use Steam's tongue instead of LuaTools setting.\",\"settings.useSteamLanguage.label\":\"Use Steam's Tongue\",\"settings.useSteamLanguage.no\":\"Nay\",\"settings.useSteamLanguage.yes\":\"Aye\",\"{fix} applied successfully!\":\"{fix} nailed to the hull! Yarr!\",\"settings.morrenusApiKey.label\":\"Morrenus Secret Scroll\",\"settings.morrenusApiKey.description\":\"Ye be needin' this mark to scupper Sadie's Loot. Plunder it from {link}\",\"settings.morrenusApiKey.placeholder\":\"Scribble yer secret code here\"}",
    "pl": "{\"Add via LuaTools\":\"Dodaj przez LuaTools\",\"Advanced\":\"Zaawansowane\",\"All-In-One Fixes\":\"Wszystkie poprawki w jednym\",\"Apply\":\"Zastosuj\",\"Applying {fix}\":\"Stosowanie {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Czy na pewno chcesz cofnąć poprawki? Spowoduje to usunięcie plików naprawczych i weryfikację plików gry.\",\"Are you sure?\":\"Jesteś pewien?\",\"Back\":\"Wstecz\",\"Base Game\":\"Gra Podstawowa\",\"Cancel\":\"Anuluj\",\"Cancellation failed\":\"Anulowanie nie powiodło się\",\"Cancelled\":\"Anulowano\",\"Cancelled by user\":\"Anulowane przez użytkownika\",\"Cancelled: {reason}\":\"Anulowano: {reason}\",\"Cancelling...\":\"Anulowanie...\",\"Check for updates\":\"Sprawdź aktualizacje\",\"Checking availability…\":\"Sprawdzanie dostępności…\",\"Checking content…\":\"Sprawdzanie zawartości…\",\"Checking generic fix...\":\"Sprawdzanie ogólnej poprawki...\",\"Checking key...\":\"Sprawdzanie klucza...\",\"Checking online-fix...\":\"Sprawdzanie online-fix...\",\"Checking…\":\"Sprawdzanie…\",\"Close\":\"Zamknij\",\"Confirm\":\"Potwierdź\",\"Content details =>\":\"Szczegóły zawartości =>\",\"DLC Detected\":\"Wykryto DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC są dodawane razem z grą podstawową. Aby dodać poprawki dla tego DLC, przejdź do strony gry podstawowej: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Odrzuć\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Pobieranie...\",\"Downloading: {percent}%\":\"Pobieranie: {percent}%\",\"Downloading…\":\"Pobieranie…\",\"Error applying fix\":\"Błąd podczas stosowania poprawki\",\"Error checking for fixes\":\"Błąd podczas sprawdzania poprawek\",\"Error starting Online Fix\":\"Błąd podczas uruchamiania online-fix\",\"Error starting un-fix\":\"Błąd podczas rozpoczynania cofania poprawek\",\"Error! Code: {code}\":\"Błąd! Kod: {code}\",\"Error, Code: {code}\":\"Błąd, Kod: {code}\",\"Error, Timed Out\":\"Błąd, Przekroczono limit czasu\",\"Error: {error}\":\"Błąd: {error}\",\"Expires\":\"Wygasa\",\"Extracting to game folder...\":\"Wypakowywanie do folderu gry...\",\"Failed\":\"Niepowodzenie\",\"Failed to cancel fix download\":\"Nie udało się anulować pobierania poprawki\",\"Failed to check for fixes.\":\"Nie udało się sprawdzić poprawek.\",\"Failed to load free APIs.\":\"Nie udało się załadować darmowych API.\",\"Failed to start fix download\":\"Nie udało się rozpocząć pobierania poprawki\",\"Failed to start un-fix\":\"Nie udało się rozpocząć cofania poprawek\",\"Failed to verify key\":\"Nie udało się zweryfikować klucza\",\"Failed: {error}\":\"Niepowodzenie: {error}\",\"Fetch Free API's\":\"Pobierz darmowe API\",\"Fetching game name...\":\"Pobieranie nazwy gry...\",\"Finishing…\":\"Kończenie…\",\"Fixes Menu\":\"Menu poprawek\",\"Found\":\"Znaleziono\",\"Game Added!\":\"Gra dodana!\",\"Game added!\":\"Gra dodana!\",\"Game folder\":\"Folder gry\",\"Game install path not found\":\"Nie znaleziono ścieżki instalacyjnej gry\",\"Game not found on any available API.\":\"Nie znaleziono gry w żadnym dostępnym API.\",\"Generic Fix\":\"Ogólna poprawka\",\"Generic fix found!\":\"Znaleziono ogólną poprawkę!\",\"Go to Base Game\":\"Przejdź do gry podstawowej\",\"Hide\":\"Ukryj\",\"Included\":\"Uwzględnione\",\"Initializing download...\":\"Inicjowanie pobierania...\",\"Installing…\":\"Instalowanie…\",\"Invalid Morrenus API Key format\":\"Nieprawidłowy format klucza API Morrenus\",\"Invalid key format\":\"Nieprawidłowy format klucza\",\"Invalid or rejected key\":\"Nieprawidłowy lub odrzucony klucz\",\"Join the Discord!\":\"Dołącz do Discorda!\",\"Left click to install, Right click for SteamDB\":\"Lewy przycisk myszy, aby zainstalować, Prawy przycisk myszy, aby otworzyć SteamDB\",\"Loaded free APIs: {count}\":\"Załadowano darmowe API: {count}\",\"Loading APIs...\":\"Ładowanie API...\",\"Loading fixes...\":\"Ładowanie poprawek...\",\"Look for Fixes\":\"Szukaj poprawek\",\"LuaTools backend unavailable\":\"LuaTools backend niedostępny\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menu wszystkich poprawek\",\"LuaTools · Added Games\":\"LuaTools · Dodane gry\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu poprawek\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Zarządzaj grą\",\"Missing\":\"Brak\",\"No games found.\":\"Nie znaleziono gier.\",\"No generic fix\":\"Brak ogólnej poprawki\",\"No online-fix\":\"Brak online-fix\",\"No updates available.\":\"Brak dostępnych aktualizacji.\",\"No workshop for the game\":\"Brak warsztatu dla tej gry\",\"Not found\":\"Nie znaleziono\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Znaleziono Online-fix!\",\"Only possible thanks to {name} 💜\":\"Możliwe tylko dzięki {name} 💜\",\"Proceed\":\"Kontynuuj\",\"Processing package…\":\"Przetwarzanie pakietu…\",\"Remove via LuaTools\":\"Usuń przez LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Usunięto {count} plików. Werykowanie plików przez Steam...\",\"Removing fix files...\":\"Usuwanie plików poprawek...\",\"Restart Steam\":\"Uruchom ponownie Steam\",\"Restart Steam now?\":\"Uruchomić ponownie Steam teraz?\",\"Searching across sources...\":\"Szukanie we wszystkich źródłach...\",\"Select Download Source\":\"Wybierz źródło pobierania\",\"Settings\":\"Ustawienia\",\"Skipped\":\"Pominięto\",\"The game has been added successfully.\":\"Gra została pomyślnie dodana.\",\"This game may not work, support for it wont be given in our discord\":\"Ta gra może nie działać, wsparcie dla niej nie będzie udzielane na naszym Discordzie\",\"Un-Fix (verify game)\":\"Cofnij poprawki (weryfikuj grę)\",\"Un-Fixing game\":\"Cofanie poprawek gry\",\"Unknown Game\":\"Nieznana gra\",\"Unknown error\":\"Nieznany błąd\",\"Usage\":\"Użycie\",\"Verifying API limits...\":\"Weryfikacja limitów API...\",\"Waiting…\":\"Oczekiwanie…\",\"Working…\":\"Pracuję…\",\"Workshop: \":\"Warsztat: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Przekroczyłeś dzienny limit pobierania. Poczekaj do jutra lub ulepsz swój plan na stronie Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Twój klucz API Morrenus jest nieprawidłowy lub wygasł. Sprawdź klucz w ustawieniach lub wygeneruj nowy na stronie Morrenus.\",\"bigpicture.mouseTip\":\"Aby użyć trybu myszy w Steam: Przycisk Guide + Prawy joystick, kliknij RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Nieobsługiwany typ opcji: {type}\",\"common.status.error\":\"Błąd\",\"common.status.loading\":\"Ładowanie...\",\"common.status.success\":\"Sukces\",\"common.translationMissing\":\"brak tłumaczenia\",\"common.warning\":\"Ostrzeżenie\",\"days left\":\"dni pozostało\",\"disclaimer.inputLabel\":\"wpisz \\\"Rozumiem\\\" w pole poniżej, aby kontynuować\",\"disclaimer.inputPlaceholder\":\"Rozumiem\",\"disclaimer.line1\":\"LuaTools nie jest w żaden sposób powiązany z Millennium\",\"disclaimer.line2\":\"Millennium NIE zaoferuje ci wsparcia dla tego pluginu na ich serwerze discord\",\"disclaimer.line3\":\"Zostaniesz ZBANOWANY z serwerów LuaTools i Millennium, jeśli pójdziesz na ich discord prosić o pomoc\",\"disclaimer.title\":\"Ważna Informacja\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Dostępna poprawka\",\"gameStatus.playable\":\"Grywalny\",\"gameStatus.unplayable\":\"Niegrywalny\",\"menu.advancedLabel\":\"Zaawansowane\",\"menu.checkForUpdates\":\"Sprawdź aktualizacje\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Błąd podczas pobierania ścieżki gry\",\"menu.error.noAppId\":\"Nie można określić AppID gry\",\"menu.error.noInstall\":\"Nie można znaleźć instalacji gry\",\"menu.error.notInstalled\":\"Gra nie jest zainstalowana! Najpierw dodaj i zainstaluj grę :D\",\"menu.fetchFreeApis\":\"Pobierz darmowe API\",\"menu.fixesMenu\":\"Menu poprawek\",\"menu.joinDiscordLabel\":\"Dołącz do Discorda!\",\"menu.manageGameLabel\":\"Zarządzaj grą\",\"menu.remove.confirm\":\"Usunąć LuaTools dla tej gry?\",\"menu.remove.failure\":\"Nie udało się usunąć LuaTools.\",\"menu.remove.success\":\"LuaTools zostało usunięte dla tej aplikacji.\",\"menu.removeLuaTools\":\"Usuń przez LuaTools\",\"menu.settings\":\"Ustawienia\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Zamknij\",\"settings.donateKeys.description\":\"Przekaż klucze deszyfrujące do gier, pomożesz wszystkim!\",\"settings.donateKeys.label\":\"Przekaż klucze\",\"settings.donateKeys.no\":\"Nie\",\"settings.donateKeys.yes\":\"Tak\",\"settings.empty\":\"Brak dostępnych ustawień.\",\"settings.error\":\"Nie udało się załadować ustawień.\",\"settings.fastDownload.description\":\"Automatycznie wybieraj pierwsze dostępne źródło podczas dodawania gry.\",\"settings.fastDownload.label\":\"Szybkie pobieranie\",\"settings.general\":\"Ogólne\",\"settings.generalDescription\":\"Globalne preferencje LuaTools.\",\"settings.installedFixes.date\":\"Zainstalowano:\",\"settings.installedFixes.delete\":\"Usuń\",\"settings.installedFixes.deleteConfirm\":\"Czy na pewno chcesz usunąć tę poprawkę? Spowoduje to usunięcie plików poprawki i uruchomienie weryfikacji Steam.\",\"settings.installedFixes.deleteError\":\"Nie udało się usunąć poprawki.\",\"settings.installedFixes.deleteSuccess\":\"Poprawka została pomyślnie usunięta!\",\"settings.installedFixes.deleting\":\"Usuwanie poprawki...\",\"settings.installedFixes.empty\":\"Brak zainstalowanych poprawek.\",\"settings.installedFixes.error\":\"Nie udało się załadować zainstalowanych poprawek.\",\"settings.installedFixes.files\":\"{count} plików\",\"settings.installedFixes.loading\":\"Skanowanie zainstalowanych poprawek...\",\"settings.installedFixes.title\":\"Zainstalowane Poprawki\",\"settings.installedFixes.type\":\"Typ:\",\"settings.installedLua.delete\":\"Usuń\",\"settings.installedLua.deleteConfirm\":\"Usunąć przez LuaTools dla tej gry?\",\"settings.installedLua.deleteError\":\"Nie udało się usunąć przez LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Pomyślnie usunięto przez LuaTools!\",\"settings.installedLua.deleting\":\"Usuwanie przez LuaTools...\",\"settings.installedLua.disabled\":\"Wyłączone\",\"settings.installedLua.empty\":\"Brak zainstalowanych skryptów Lua.\",\"settings.installedLua.error\":\"Nie udało się załadować zainstalowanych skryptów Lua.\",\"settings.installedLua.loading\":\"Skanowanie zainstalowanych skryptów Lua...\",\"settings.installedLua.modified\":\"Zmodyfikowano:\",\"settings.installedLua.title\":\"Gry przez LuaTools\",\"settings.installedLua.unknownInfo\":\"Gry wyświetlające 'Nieznana gra' zostały zainstalowane ze źródeł zewnętrznych (nie przez LuaTools).\",\"settings.language.description\":\"Wybierz język używany przez LuaTools.\",\"settings.language.label\":\"Język\",\"settings.language.option.en\":\"Angielski\",\"settings.language.option.pt-BR\":\"Brazylijski portugalski\",\"settings.loading\":\"Ładowanie ustawień...\",\"settings.noChanges\":\"Brak zmian do zapisania.\",\"settings.refresh\":\"Odśwież\",\"settings.refreshing\":\"Odświeżanie...\",\"settings.save\":\"Zapisz ustawienia\",\"settings.saveError\":\"Nie udało się zapisać ustawień.\",\"settings.saveSuccess\":\"Ustawienia zostały zapisane pomyślnie.\",\"settings.saving\":\"Zapisywanie...\",\"settings.search.clear\":\"Wyczyść wyszukiwanie\",\"settings.search.noResults\":\"Nie znaleziono wyników\",\"settings.search.placeholder\":\"Szukaj ustawień, gier, poprawek...\",\"settings.theme.description\":\"Wybierz motyw kolorystyczny interfejsu LuaTools.\",\"settings.theme.label\":\"Motyw\",\"settings.title\":\"LuaTools · Ustawienia\",\"settings.unsaved\":\"Niezapisane zmiany\",\"settings.useSteamLanguage.description\":\"Użyj języka klienta Steam zamiast ustawień LuaTools.\",\"settings.useSteamLanguage.label\":\"Użyj języka Steam\",\"settings.useSteamLanguage.no\":\"Nie\",\"settings.useSteamLanguage.yes\":\"Tak\",\"{fix} applied successfully!\":\"{fix} zostało pomyślnie zastosowane!\",\"settings.morrenusApiKey.label\":\"Klucz API Morrenus\",\"settings.morrenusApiKey.description\":\"Klucz API wymagany do korzystania z Sadie Source. Pobierz z {link}\",\"settings.morrenusApiKey.placeholder\":\"Wprowadź swój klucz API\"}",
    "pt-BR": "{\"Add via LuaTools\":\"Adicionar via LuaTools\",\"Advanced\":\"Avançado\",\"All-In-One Fixes\":\"Correções all-in-one\",\"Apply\":\"Aplicar\",\"Applying {fix}\":\"Aplicando {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Tem certeza de que deseja remover a correção? Isso removerá os arquivos da correção e verificará os arquivos do jogo.\",\"Are you sure?\":\"Tem certeza?\",\"Back\":\"Voltar\",\"Base Game\":\"Jogo Base\",\"Cancel\":\"Cancelar\",\"Cancellation failed\":\"Falha ao cancelar\",\"Cancelled\":\"Cancelado\",\"Cancelled by user\":\"Cancelado pelo usuário\",\"Cancelled: {reason}\":\"Cancelado: {reason}\",\"Cancelling...\":\"Cancelando...\",\"Check for updates\":\"Buscar atualizações\",\"Checking availability…\":\"Verificando disponibilidade…\",\"Checking content…\":\"Verificando conteúdo…\",\"Checking generic fix...\":\"Verificando correção genérica...\",\"Checking key...\":\"Verificando chave...\",\"Checking online-fix...\":\"Verificando correção do online-fix...\",\"Checking…\":\"Verificando…\",\"Close\":\"Fechar\",\"Confirm\":\"Confirmar\",\"Content details =>\":\"Detalhes do conteúdo =>\",\"DLC Detected\":\"DLC Detectada\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLCs são adicionadas junto com o jogo base. Para adicionar esta DLC, por favor vá para a página do jogo base: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Fechar\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Baixando...\",\"Downloading: {percent}%\":\"Baixando: {percent}%\",\"Downloading…\":\"Baixando…\",\"Error applying fix\":\"Erro ao aplicar a correção\",\"Error checking for fixes\":\"Erro ao verificar as correções\",\"Error starting Online Fix\":\"Erro ao iniciar o Online Fix\",\"Error starting un-fix\":\"Erro ao iniciar o removedor de correções\",\"Error! Code: {code}\":\"Erro! Código: {code}\",\"Error, Code: {code}\":\"Erro, Código: {code}\",\"Error, Timed Out\":\"Erro, Tempo esgotado\",\"Error: {error}\":\"Erro: {error}\",\"Expires\":\"Expira\",\"Extracting to game folder...\":\"Extraindo para a pasta do jogo...\",\"Failed\":\"Falhou\",\"Failed to cancel fix download\":\"Falha ao cancelar o download da correção\",\"Failed to check for fixes.\":\"Falha ao verificar as correções.\",\"Failed to load free APIs.\":\"Falha ao carregar as APIs gratuitas.\",\"Failed to start fix download\":\"Falha ao iniciar o download da correção\",\"Failed to start un-fix\":\"Falha ao iniciar o removedor de correções\",\"Failed to verify key\":\"Falha ao verificar chave\",\"Failed: {error}\":\"Falhou: {error}\",\"Fetch Free API's\":\"Buscar APIs gratuitas\",\"Fetching game name...\":\"Buscando nome do jogo...\",\"Finishing…\":\"Finalizando…\",\"Fixes Menu\":\"Menu de correções\",\"Found\":\"Encontrado\",\"Game Added!\":\"Jogo adicionado!\",\"Game added!\":\"Jogo adicionado!\",\"Game folder\":\"Pasta do jogo\",\"Game install path not found\":\"Caminho de instalação do jogo não encontrado\",\"Game not found on any available API.\":\"Jogo não encontrado em nenhuma API disponível.\",\"Generic Fix\":\"Correção Genérica\",\"Generic fix found!\":\"Correção genérica encontrada!\",\"Go to Base Game\":\"Ir para o Jogo Base\",\"Hide\":\"Ocultar\",\"Included\":\"Incluído 🎉\",\"Initializing download...\":\"Iniciando download...\",\"Installing…\":\"Instalando…\",\"Invalid Morrenus API Key format\":\"Formato de chave API Morrenus inválido\",\"Invalid key format\":\"Formato de chave inválido\",\"Invalid or rejected key\":\"Chave inválida ou rejeitada\",\"Join the Discord!\":\"Entrar no Discord!\",\"Left click to install, Right click for SteamDB\":\"Clique com o botão esquerdo do mouse para instalar o jogo, direito para abrir o site do SteamDB\",\"Loaded free APIs: {count}\":\"APIs gratuitas carregadas: {count}\",\"Loading APIs...\":\"Carregando APIs...\",\"Loading fixes...\":\"Carregando correções...\",\"Look for Fixes\":\"Procurar correções\",\"LuaTools backend unavailable\":\"Backend do LuaTools indisponível\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menu AIO de Correções\",\"LuaTools · Added Games\":\"LuaTools · Jogos adicionados\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu de Correções\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Gerenciar jogo\",\"Missing\":\"Faltando ❌\",\"No games found.\":\"Nenhum jogo encontrado.\",\"No generic fix\":\"Nenhuma correção genérica encontrada.\",\"No online-fix\":\"Nenhuma correção online-fix encontrada.\",\"No updates available.\":\"Nenhuma atualização disponível.\",\"No workshop for the game\":\"Nenhum workshop para o jogo ✅\",\"Not found\":\"Não encontrado\",\"Online Fix\":\"Correção online\",\"Online Fix (Unsteam)\":\"Correção online (Unsteam)\",\"Online-fix found!\":\"Online-fix encontrado!\",\"Only possible thanks to {name} 💜\":\"Só é possível graças a {name} 💜\",\"Proceed\":\"Continuar\",\"Processing package…\":\"Processando pacote…\",\"Remove via LuaTools\":\"Remover via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} arquivos removidos. Executando a verificação da Steam...\",\"Removing fix files...\":\"Removendo arquivos da correção...\",\"Restart Steam\":\"Reiniciar Steam\",\"Restart Steam now?\":\"Reiniciar o Steam agora?\",\"Searching across sources...\":\"Buscando em todas as fontes...\",\"Select Download Source\":\"Selecionar fonte de download\",\"Settings\":\"Configurações\",\"Skipped\":\"Ignorado\",\"The game has been added successfully.\":\"O jogo foi adicionado com sucesso.\",\"This game may not work, support for it wont be given in our discord\":\"Este jogo pode não funcionar, suporte não será dado em nosso discord\",\"Un-Fix (verify game)\":\"Desfazer correção (verificar jogo)\",\"Un-Fixing game\":\"Desfazendo correção do jogo\",\"Unknown Game\":\"Jogo desconhecido\",\"Unknown error\":\"Erro desconhecido\",\"Usage\":\"Uso\",\"Verifying API limits...\":\"Verificando limites da API...\",\"Waiting…\":\"Aguardando…\",\"Working…\":\"Trabalhando…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Você excedeu seu limite diário de downloads. Aguarde até amanhã ou atualize seu plano no site do Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Sua chave API Morrenus é inválida ou expirou. Verifique sua chave nas configurações ou gere uma nova no site do Morrenus.\",\"bigpicture.mouseTip\":\"Para usar o modo mouse no Steam: Botão Guia + Joystick direito, clique com RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Tipo de opção não suportado: {type}\",\"common.status.error\":\"Erro\",\"common.status.loading\":\"Carregando...\",\"common.status.success\":\"Sucesso\",\"common.translationMissing\":\"tradução ausente\",\"common.warning\":\"Aviso\",\"days left\":\"dias restantes\",\"disclaimer.inputLabel\":\"digite \\\"Eu Entendo\\\" na caixa abaixo para continuar\",\"disclaimer.inputPlaceholder\":\"Eu Entendo\",\"disclaimer.line1\":\"O LuaTools não é afiliado de forma alguma ao Millennium\",\"disclaimer.line2\":\"O Millennium NÃO oferecerá suporte para este plugin no servidor do Discord deles\",\"disclaimer.line3\":\"Você será BANIDO dos dois servidores se buscar ajuda no Discord do Millennium\",\"disclaimer.title\":\"Aviso Importante\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Correção disponível\",\"gameStatus.playable\":\"Jogável\",\"gameStatus.unplayable\":\"Não jogável\",\"menu.advancedLabel\":\"Avançado\",\"menu.checkForUpdates\":\"Verificar atualizações\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Erro ao encontrar o caminho do jogo\",\"menu.error.noAppId\":\"Não foi possível determinar o AppID do jogo\",\"menu.error.noInstall\":\"Não foi possível encontrar a instalação do jogo\",\"menu.error.notInstalled\":\"Jogo não instalado! Adicione e instale primeiro :D\",\"menu.fetchFreeApis\":\"Buscar APIs gratuitas\",\"menu.fixesMenu\":\"Menu de Correções\",\"menu.joinDiscordLabel\":\"Entre no Discord!\",\"menu.manageGameLabel\":\"Gerenciar jogo\",\"menu.remove.confirm\":\"Remover LuaTools para este jogo?\",\"menu.remove.failure\":\"Falha ao remover o LuaTools.\",\"menu.remove.success\":\"LuaTools removido para este jogo.\",\"menu.removeLuaTools\":\"Remover jogo via LuaTools\",\"menu.settings\":\"Configurações\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Fechar\",\"settings.donateKeys.description\":\"Permitir que o LuaTools doe chaves Steam sobrando.\",\"settings.donateKeys.label\":\"Doar chaves\",\"settings.donateKeys.no\":\"Não\",\"settings.donateKeys.yes\":\"Sim\",\"settings.empty\":\"Nenhuma configuração disponível.\",\"settings.error\":\"Falha ao carregar as configurações.\",\"settings.fastDownload.description\":\"Escolhe automaticamente a primeira fonte disponível ao adicionar um jogo.\",\"settings.fastDownload.label\":\"Download Rápido\",\"settings.general\":\"Geral\",\"settings.generalDescription\":\"Preferências globais do LuaTools.\",\"settings.installedFixes.date\":\"Instalado:\",\"settings.installedFixes.delete\":\"Excluir\",\"settings.installedFixes.deleteConfirm\":\"Tem certeza de que deseja remover esta correção? Isso excluirá os arquivos da correção e executará a verificação da Steam.\",\"settings.installedFixes.deleteError\":\"Falha ao remover correção.\",\"settings.installedFixes.deleteSuccess\":\"Correção removida com sucesso!\",\"settings.installedFixes.deleting\":\"Removendo correção...\",\"settings.installedFixes.empty\":\"Nenhuma correção instalada ainda.\",\"settings.installedFixes.error\":\"Falha ao carregar correções instaladas.\",\"settings.installedFixes.files\":\"{count} arquivos\",\"settings.installedFixes.loading\":\"Procurando correções instaladas...\",\"settings.installedFixes.title\":\"Correções Instaladas\",\"settings.installedFixes.type\":\"Tipo:\",\"settings.installedLua.delete\":\"Remover\",\"settings.installedLua.deleteConfirm\":\"Remover via LuaTools para este jogo?\",\"settings.installedLua.deleteError\":\"Falha ao remover via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Removido via LuaTools com sucesso!\",\"settings.installedLua.deleting\":\"Removendo via LuaTools...\",\"settings.installedLua.disabled\":\"Desabilitado\",\"settings.installedLua.empty\":\"Nenhum script Lua instalado ainda.\",\"settings.installedLua.error\":\"Falha ao carregar scripts Lua instalados.\",\"settings.installedLua.loading\":\"Procurando scripts Lua instalados...\",\"settings.installedLua.modified\":\"Modificado:\",\"settings.installedLua.title\":\"Jogos via LuaTools\",\"settings.installedLua.unknownInfo\":\"Jogos mostrando 'Jogo Desconhecido' foram instalados de fontes externas (não via LuaTools).\",\"settings.language.description\":\"Escolha o idioma utilizado pelo LuaTools.\",\"settings.language.label\":\"Idioma\",\"settings.language.option.en\":\"Inglês\",\"settings.language.option.pt-BR\":\"Português (Brasil)\",\"settings.loading\":\"Carregando configurações...\",\"settings.noChanges\":\"Nenhuma alteração para salvar.\",\"settings.refresh\":\"Atualizar\",\"settings.refreshing\":\"Atualizando...\",\"settings.save\":\"Salvar Configurações\",\"settings.saveError\":\"Falha ao salvar as configurações.\",\"settings.saveSuccess\":\"Configurações salvas com sucesso.\",\"settings.saving\":\"Salvando...\",\"settings.search.clear\":\"Limpar busca\",\"settings.search.noResults\":\"Nenhum resultado encontrado\",\"settings.search.placeholder\":\"Buscar configurações, jogos, correções...\",\"settings.theme.description\":\"Escolha o tema de cores para a interface do LuaTools.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Configurações\",\"settings.unsaved\":\"Alterações não salvas\",\"settings.useSteamLanguage.description\":\"Utilizar o idioma do cliente Steam ao invés da configuração do LuaTools.\",\"settings.useSteamLanguage.label\":\"Usar Idioma do Steam\",\"settings.useSteamLanguage.no\":\"Não\",\"settings.useSteamLanguage.yes\":\"Sim\",\"{fix} applied successfully!\":\"{fix} aplicado com sucesso!\",\"settings.morrenusApiKey.label\":\"Chave API do Morrenus\",\"settings.morrenusApiKey.description\":\"Chave API necessária pra usar a API Sadie. Pegue pelo {link}\",\"settings.morrenusApiKey.placeholder\":\"Insira aqui sua chave\"}",
    "pt-decria": "{\"Add via LuaTools\":\"botar no LuaTools\",\"Advanced\":\"só pra qm manja\",\"All-In-One Fixes\":\"bagulho pra arruma all-in-one\",\"Apply\":\"mandar\",\"Applying {fix}\":\"mandando ver no bgl\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"c ta ligado que se tu tirar o fix vai apagar a porra toda do fix e verificar os bgl do jogo né?\",\"Are you sure?\":\"certeza parça?\",\"Back\":\"pular fora\",\"Base Game\":\"jogo base\",\"Cancel\":\"largar mão\",\"Cancellation failed\":\"deu ruim pra cancelar\",\"Cancelled\":\"cancelado\",\"Cancelled by user\":\"o maluco largou mão\",\"Cancelled: {reason}\":\"cancelado pq {reason}\",\"Cancelling...\":\"parando a treta...\",\"Check for updates\":\"caçando atualização\",\"Checking availability…\":\"vendo se o bagulho ta de pé…\",\"Checking content…\":\"vendo o que tem dentro…\",\"Checking generic fix...\":\"olhando se tem fix de cria...\",\"Checking key...\":\"A ver a chave...\",\"Checking online-fix...\":\"olhando se tem fix pra joga com os mano...\",\"Checking…\":\"vendo se tem...\",\"Close\":\"fechar\",\"Confirm\":\"confirmar memo\",\"Content details =>\":\"os detalhes do bagulho =>\",\"DLC Detected\":\"DLC caiu aí\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"os DLC entram junto com o jogo base parceiro. pra adicionar esse DLC aí, vai lá na página do jogo base: <br><br><b>{gameName}</b>\",\"Discord\":\"zap azul\",\"Dismiss\":\"deixa quieto\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"baixando as parada..\",\"Downloading: {percent}%\":\"ja baixou {percent}% da bagaça\",\"Downloading…\":\"baixando o treco…\",\"Error applying fix\":\"deu ruim com o fix\",\"Error checking for fixes\":\"deu treta caçando fix\",\"Error starting Online Fix\":\"n deu pra abrir o online fix\",\"Error starting un-fix\":\"vai dar pra tirar teu fix não\",\"Error! Code: {code}\":\"deu merda numero {code}\",\"Error, Code: {code}\":\"deu merda numero {code}\",\"Error, Timed Out\":\"deu time out na parada\",\"Error: {error}\":\"Erro: {error}\",\"Expires\":\"Expira\",\"Extracting to game folder...\":\"botando as parada dentro do jogo...\",\"Failed\":\"fudeu\",\"Failed to cancel fix download\":\"vai baixar essa caralha sim\",\"Failed to check for fixes.\":\"n deu pra achar fix\",\"Failed to load free APIs.\":\"rolou bosta com as API gratis.\",\"Failed to start fix download\":\"deu ruim pra baixar o fix\",\"Failed to start un-fix\":\"n deu pra tirar o fix nao fi\",\"Failed to verify key\":\"Não deu pra verificar a chave\",\"Failed: {error}\":\"deu bosta: {error}\",\"Fetch Free API's\":\"caçar as API gratis\",\"Fetching game name...\":\"olhando o nome do jogo...\",\"Finishing…\":\"fechando os treco…\",\"Fixes Menu\":\"menu fos fix\",\"Found\":\"achamo memo\",\"Game Added!\":\"Jogo adicionado!\",\"Game added!\":\"jogo botado namoralzinha\",\"Game folder\":\"aquela pasta la do teu jogo\",\"Game install path not found\":\"viado, teu jogo sumiu\",\"Game not found on any available API.\":\"deu pra achar nada na api fi.\",\"Generic Fix\":\"fix normal padrãozão ai\",\"Generic fix found!\":\"cabei de achar um fix generico!\",\"Go to Base Game\":\"ir pro jogo base\",\"Hide\":\"esconder o bgl\",\"Included\":\"tá junto\",\"Initializing download...\":\"baixando o bgl...\",\"Installing…\":\"instalando…\",\"Invalid Morrenus API Key format\":\"Formato da chave API Morrenus inválido\",\"Invalid key format\":\"Formato da chave inválido\",\"Invalid or rejected key\":\"Chave inválida ou rejeitada\",\"Join the Discord!\":\"ir pro grupão do zap azul!\",\"Left click to install, Right click for SteamDB\":\"esquerdo no mouse pra instalar teu jogo, direito pra te botar no SteamDB\",\"Loaded free APIs: {count}\":\"APIs gratis no esquema: {count}\",\"Loading APIs...\":\"pegando as api...\",\"Loading fixes...\":\"maquinando os fix...\",\"Look for Fixes\":\"olhar se tem fix\",\"LuaTools backend unavailable\":\"capotaram o corsa do luatools\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · parada com os fix genericão memo\",\"LuaTools · Added Games\":\"LuaTools · jogos q c ja botou\",\"LuaTools · Fixes Menu\":\"LuaTools · menu com os fix tudo\",\"LuaTools · Menu\":\"LuaTools · geralzão\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"cuidar dos jogo\",\"Missing\":\"sumiu\",\"No games found.\":\"achei jogo nenhum não fi.\",\"No generic fix\":\"n achei nenhum fix normal não.\",\"No online-fix\":\"n deu p achar nenhum online fix.\",\"No updates available.\":\"n tem atualização não po\",\"No workshop for the game\":\"n tem workshop pro jogo não\",\"Not found\":\"n deu pra achar\",\"Online Fix\":\"online fix\",\"Online Fix (Unsteam)\":\"online fix (unsteam)\",\"Online-fix found!\":\"achamo o online fix!\",\"Only possible thanks to {name} 💜\":\"isso aq só ta aqui pq {name} fez a boa 💜\",\"Proceed\":\"Continuar\",\"Processing package…\":\"agilizando pacote…\",\"Remove via LuaTools\":\"tirar do LuaTools\",\"Removed {count} files. Running Steam verification...\":\"dei no pé com {count} bagulhos, agr vo faze a steam dar o corre...\",\"Removing fix files...\":\"vazando com os bgl do fix...\",\"Restart Steam\":\"fechar e abrir Steam\",\"Restart Steam now?\":\"vai fechar e abrir a steam agr?\",\"Searching across sources...\":\"caçando nas fonte...\",\"Select Download Source\":\"escolhe a parada aí mlk\",\"Settings\":\"os esquema\",\"Skipped\":\"pulei memo\",\"The game has been added successfully.\":\"O jogo foi adicionado com sucesso.\",\"This game may not work, support for it wont be given in our discord\":\"mlk esse jogo ai vai da problema, se pedir ajuda vai tomar\",\"Un-Fix (verify game)\":\"tirar os fix tudo (dar um confere no jogo)\",\"Un-Fixing game\":\"tirando os fix to deu jogo\",\"Unknown Game\":\"jogo q nunca vi\",\"Unknown error\":\"deu merda e n sei oq foi\",\"Usage\":\"Uso\",\"Verifying API limits...\":\"A verificar limites da API...\",\"Waiting…\":\"esperando ai…\",\"Working…\":\"no corre…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Excedeste o limite diário de downloads. Espera até amanhã ou melhora o teu plano no site do Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"A tua chave API Morrenus é inválida ou expirou. Verifica a chave nas definições ou gera uma nova no site do Morrenus.\",\"bigpicture.mouseTip\":\"pra usar o mouse no steam: botão do guide + analógico direito, clica com RB\",\"common.alert.ok\":\"ok\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"esse {type} aí n da bom nao\",\"common.status.error\":\"b.o\",\"common.status.loading\":\"segura ai fi...\",\"common.status.success\":\"favela venceu viado\",\"common.translationMissing\":\"tradução sumiu tlgd\",\"common.warning\":\"avisando ai memo\",\"days left\":\"dias restantes\",\"disclaimer.inputLabel\":\"mete \\\"blz\\\" na caixinha aí pra continuá\",\"disclaimer.inputPlaceholder\":\"blz\",\"disclaimer.line1\":\"LuaTools não tem nada a ver com Millennium, são coisas diferentes\",\"disclaimer.line2\":\"Millennium não vai te dar suporte pra esse plugin no discord deles não\",\"disclaimer.line3\":\"vai tomar ban dos dois servidor se for lá no discord deles pedindo ajuda fi\",\"disclaimer.title\":\"aviso importante\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Tem Fix\",\"gameStatus.playable\":\"Dá pra jogar\",\"gameStatus.unplayable\":\"Não dá pra jogar\",\"menu.advancedLabel\":\"só pros pica\",\"menu.checkForUpdates\":\"dar um confere se tem atualização\",\"menu.discord\":\"zap azul\",\"menu.error.getPath\":\"n deu pra achar a pasta do jogo\",\"menu.error.noAppId\":\"n deu p achar o appid do teu jogo não\",\"menu.error.noInstall\":\"n deu pra ver se teu jogo ta instalado\",\"menu.error.notInstalled\":\"instala o jogo primeiro po, ta tirano?\",\"menu.fetchFreeApis\":\"caçar APIs gratis\",\"menu.fixesMenu\":\"menu dos fix\",\"menu.joinDiscordLabel\":\"entra aí no grupão do zap azul!\",\"menu.manageGameLabel\":\"dar o corre pro jogo\",\"menu.remove.confirm\":\"tirar o LuaTools desse jogo aí?\",\"menu.remove.failure\":\"n deu pra tirar o LuaTools não.\",\"menu.remove.success\":\"blz chefe, cabo pra esse LuaTools.\",\"menu.removeLuaTools\":\"dar cabo nesse joguin bosta aí\",\"menu.settings\":\"fitas\",\"menu.title\":\"LuaTools · rolê\",\"settings.close\":\"dar no pé\",\"settings.donateKeys.description\":\"o LuaTools pode pegar umas chave de jogo q c nao ta usando?.\",\"settings.donateKeys.label\":\"Doar chaves\",\"settings.donateKeys.no\":\"viaja não zé vai pega nada não\",\"settings.donateKeys.yes\":\"pode vim cara pega tudo\",\"settings.empty\":\"tem config não po.\",\"settings.error\":\"deu b.o com as config pai.\",\"settings.fastDownload.description\":\"Escolher automaticamente a primeira fonte disponível ao adicionar um jogo.\",\"settings.fastDownload.label\":\"Download Rápido\",\"settings.general\":\"geralzão\",\"settings.generalDescription\":\"rolê geral do LuaTools\",\"settings.installedFixes.date\":\"instalado:\",\"settings.installedFixes.delete\":\"deletar\",\"settings.installedFixes.deleteConfirm\":\"certeza que quer deletar esse fix? vai deletar os arquivo do fix e rodar a verificação do steam\",\"settings.installedFixes.deleteError\":\"deu b.o pra deletar o fix\",\"settings.installedFixes.deleteSuccess\":\"deu nois, deletou o fix\",\"settings.installedFixes.deleting\":\"deletando o fix...\",\"settings.installedFixes.empty\":\"não tem fix instalado ainda não\",\"settings.installedFixes.error\":\"deu b.o pra carrega os fix instalado\",\"settings.installedFixes.files\":\"{count} arquivo\",\"settings.installedFixes.loading\":\"procurando os fix instalado...\",\"settings.installedFixes.title\":\"os fix que tão instalado\",\"settings.installedFixes.type\":\"tipo:\",\"settings.installedLua.delete\":\"deletar\",\"settings.installedLua.deleteConfirm\":\"deletar via LuaTools esse jogo?\",\"settings.installedLua.deleteError\":\"deu b.o pra deletar via LuaTools\",\"settings.installedLua.deleteSuccess\":\"deu nois, deletou via LuaTools\",\"settings.installedLua.deleting\":\"deletando via LuaTools...\",\"settings.installedLua.disabled\":\"desabilitado\",\"settings.installedLua.empty\":\"não tem script lua instalado ainda não\",\"settings.installedLua.error\":\"deu b.o pra carrega os script lua instalado\",\"settings.installedLua.loading\":\"procurando os script lua instalado...\",\"settings.installedLua.modified\":\"modificado:\",\"settings.installedLua.title\":\"os jogo via LuaTools\",\"settings.installedLua.unknownInfo\":\"os jogo que mostra 'jogo desconhecido' foram instalado de lugar externo (não via LuaTools)\",\"settings.language.description\":\"escolhe aí a lingua q o LuaTools vai fala contigo zé\",\"settings.language.label\":\"lingua\",\"settings.language.option.en\":\"lingua dos gringo\",\"settings.language.option.pt-BR\":\"português brasil eh nois\",\"settings.loading\":\"puxando as config...\",\"settings.noChanges\":\"tem nada diferente pra salvar não\",\"settings.refresh\":\"atualizar\",\"settings.refreshing\":\"metendo aquela né pai...\",\"settings.save\":\"salvar as config tudo\",\"settings.saveError\":\"deu b.o pra salva as config\",\"settings.saveSuccess\":\"deu nois pra salva\",\"settings.saving\":\"salvando...\",\"settings.search.clear\":\"limpar busca\",\"settings.search.noResults\":\"n achei nada memo\",\"settings.search.placeholder\":\"procurar esquema, jogos, fix...\",\"settings.theme.description\":\"escolhe o tema de cor da parada do LuaTools\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · as fita\",\"settings.unsaved\":\"teus bgl nao salvou não\",\"settings.useSteamLanguage.description\":\"Pega o idioma que a Steam já tá usando e ignora a config daqui.\",\"settings.useSteamLanguage.label\":\"Puxar Idioma da Steam\",\"settings.useSteamLanguage.no\":\"Deixa quieto\",\"settings.useSteamLanguage.yes\":\"Pode pá\",\"{fix} applied successfully!\":\"{fix} no esquema meu bom\",\"settings.morrenusApiKey.label\":\"chave API do Morrenus mlk\",\"settings.morrenusApiKey.description\":\"chave API q ce precisa pra usar a Sadie. Pega lá no {link}\",\"settings.morrenusApiKey.placeholder\":\"bota a chave aqui menó\"}",
    "pt": "{\"Add via LuaTools\":\"Adicionar via LuaTools\",\"Advanced\":\"Avançado\",\"All-In-One Fixes\":\"Correções Tudo-em-Um\",\"Apply\":\"Aplicar\",\"Applying {fix}\":\"A aplicar {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Tens a certeza de que queres reverter a correção? Isto irá remover os ficheiros de correção e verificar os ficheiros do jogo.\",\"Are you sure?\":\"Tens a certeza?\",\"Back\":\"Voltar\",\"Base Game\":\"Jogo Base\",\"Cancel\":\"Cancelar\",\"Cancellation failed\":\"Falha ao cancelar\",\"Cancelled\":\"Cancelado\",\"Cancelled by user\":\"Cancelado pelo utilizador\",\"Cancelled: {reason}\":\"Cancelado: {reason}\",\"Cancelling...\":\"A cancelar...\",\"Check for updates\":\"Verificar atualizações\",\"Checking availability…\":\"A verificar disponibilidade…\",\"Checking content…\":\"A verificar conteúdo…\",\"Checking generic fix...\":\"A verificar correção genérica...\",\"Checking key...\":\"A verificar chave...\",\"Checking online-fix...\":\"A verificar online-fix...\",\"Checking…\":\"A verificar…\",\"Close\":\"Fechar\",\"Confirm\":\"Confirmar\",\"Content details =>\":\"Detalhes do conteúdo =>\",\"DLC Detected\":\"DLC Detetado\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"Os DLCs são adicionados juntamente com o jogo base. Para adicionar correções para este DLC, vai à página do jogo base: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Dispensar\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"A transferir...\",\"Downloading: {percent}%\":\"A transferir: {percent}%\",\"Downloading…\":\"A transferir…\",\"Error applying fix\":\"Erro ao aplicar correção\",\"Error checking for fixes\":\"Erro ao verificar correções\",\"Error starting Online Fix\":\"Erro ao iniciar Online Fix\",\"Error starting un-fix\":\"Erro ao iniciar a reversão da correção\",\"Error! Code: {code}\":\"Erro! Código: {code}\",\"Error, Code: {code}\":\"Erro, Código: {code}\",\"Error, Timed Out\":\"Erro, tempo esgotado\",\"Error: {error}\":\"Erro: {error}\",\"Expires\":\"Expira\",\"Extracting to game folder...\":\"A extrair para a pasta do jogo...\",\"Failed\":\"Falhou\",\"Failed to cancel fix download\":\"Falha ao cancelar a transferência da correção\",\"Failed to check for fixes.\":\"Falha ao verificar correções.\",\"Failed to load free APIs.\":\"Falha ao carregar APIs gratuitas.\",\"Failed to start fix download\":\"Falha ao iniciar a transferência da correção\",\"Failed to start un-fix\":\"Falha ao iniciar a reversão da correção\",\"Failed to verify key\":\"Falha ao verificar chave\",\"Failed: {error}\":\"Falhou: {error}\",\"Fetch Free API's\":\"Obter APIs gratuitas\",\"Fetching game name...\":\"A obter nome do jogo...\",\"Finishing…\":\"A finalizar…\",\"Fixes Menu\":\"Menu de Correções\",\"Found\":\"Encontrado\",\"Game Added!\":\"Jogo adicionado!\",\"Game added!\":\"Jogo adicionado!\",\"Game folder\":\"Pasta do jogo\",\"Game install path not found\":\"Caminho de instalação do jogo não encontrado\",\"Game not found on any available API.\":\"Jogo não encontrado em nenhuma API disponível.\",\"Generic Fix\":\"Correção Genérica\",\"Generic fix found!\":\"Correção genérica encontrada!\",\"Go to Base Game\":\"Ir para o Jogo Base\",\"Hide\":\"Ocultar\",\"Included\":\"Incluído\",\"Initializing download...\":\"A inicializar download...\",\"Installing…\":\"A instalar…\",\"Invalid Morrenus API Key format\":\"Formato de chave API Morrenus inválido\",\"Invalid key format\":\"Formato de chave inválido\",\"Invalid or rejected key\":\"Chave inválida ou rejeitada\",\"Join the Discord!\":\"Junta-te ao Discord!\",\"Left click to install, Right click for SteamDB\":\"Clique esquerdo para instalar, clique direito para SteamDB\",\"Loaded free APIs: {count}\":\"APIs gratuitas carregadas: {count}\",\"Loading APIs...\":\"A carregar APIs...\",\"Loading fixes...\":\"A carregar correções...\",\"Look for Fixes\":\"Procurar Correções\",\"LuaTools backend unavailable\":\"Backend do LuaTools indisponível\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Jogos Adicionados\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Gerir Jogo\",\"Missing\":\"Em falta\",\"No games found.\":\"Nenhum jogo encontrado.\",\"No generic fix\":\"Sem correção genérica\",\"No online-fix\":\"Sem online-fix\",\"No updates available.\":\"Sem atualizações disponíveis.\",\"No workshop for the game\":\"Sem workshop para o jogo\",\"Not found\":\"Não encontrado\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix encontrado!\",\"Only possible thanks to {name} 💜\":\"Só foi possível graças a {name} 💜\",\"Proceed\":\"Continuar\",\"Processing package…\":\"A processar pacote…\",\"Remove via LuaTools\":\"Remover via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} ficheiros removidos. A executar verificação Steam...\",\"Removing fix files...\":\"A remover ficheiros de correção...\",\"Restart Steam\":\"Reiniciar Steam\",\"Restart Steam now?\":\"Reiniciar o Steam agora?\",\"Searching across sources...\":\"A procurar em todas as fontes...\",\"Select Download Source\":\"Selecionar fonte de download\",\"Settings\":\"Definições\",\"Skipped\":\"Ignorado\",\"The game has been added successfully.\":\"O jogo foi adicionado com sucesso.\",\"This game may not work, support for it wont be given in our discord\":\"Este jogo pode não funcionar, suporte não será dado no nosso discord\",\"Un-Fix (verify game)\":\"Reverter correção (verificar jogo)\",\"Un-Fixing game\":\"A reverter correção do jogo\",\"Unknown Game\":\"Jogo Desconhecido\",\"Unknown error\":\"Erro desconhecido\",\"Usage\":\"Utilização\",\"Verifying API limits...\":\"A verificar limites da API...\",\"Waiting…\":\"A aguardar…\",\"Working…\":\"A trabalhar…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Excedeu o seu limite diário de transferências. Aguarde até amanhã ou atualize o seu plano no site do Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"A sua chave API Morrenus é inválida ou expirou. Verifique a sua chave nas definições ou gere uma nova no site do Morrenus.\",\"bigpicture.mouseTip\":\"Para usar o modo de rato no Steam: Botão Guide + Joystick Direito, clica com RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Tipo de opção não suportado: {type}\",\"common.status.error\":\"Erro\",\"common.status.loading\":\"A carregar...\",\"common.status.success\":\"Sucesso\",\"common.translationMissing\":\"tradução em falta\",\"common.warning\":\"Aviso\",\"days left\":\"dias restantes\",\"disclaimer.inputLabel\":\"Escreve \\\"Eu Compreendo\\\" na caixa abaixo para continuar\",\"disclaimer.inputPlaceholder\":\"Eu Compreendo\",\"disclaimer.line1\":\"O LuaTools não é afiliado de forma alguma ao Millennium\",\"disclaimer.line2\":\"O Millennium NÃO te dará suporte para este plugin no servidor Discord deles\",\"disclaimer.line3\":\"Serás BANIDO tanto do servidor do LuaTools como do Millennium se fores ao Discord deles pedir ajuda\",\"disclaimer.title\":\"Aviso Importante\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Correção Disponível\",\"gameStatus.playable\":\"Jogável\",\"gameStatus.unplayable\":\"Não Jogável\",\"menu.advancedLabel\":\"Avançado\",\"menu.checkForUpdates\":\"Verificar Atualizações\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Erro ao obter caminho do jogo\",\"menu.error.noAppId\":\"Não foi possível determinar o AppID do jogo\",\"menu.error.noInstall\":\"Não foi possível encontrar a instalação do jogo\",\"menu.error.notInstalled\":\"Jogo não instalado! Adiciona e instala primeiro :D\",\"menu.fetchFreeApis\":\"Obter APIs Gratuitas\",\"menu.fixesMenu\":\"Menu de Correções\",\"menu.joinDiscordLabel\":\"Junta-te ao Discord!\",\"menu.manageGameLabel\":\"Gerir Jogo\",\"menu.remove.confirm\":\"Remover via LuaTools para este jogo?\",\"menu.remove.failure\":\"Falha ao remover o LuaTools.\",\"menu.remove.success\":\"LuaTools removido para esta aplicação.\",\"menu.removeLuaTools\":\"Remover via LuaTools\",\"menu.settings\":\"Definições\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Fechar\",\"settings.donateKeys.description\":\"Doa chaves de desencriptação de jogos, ajuda toda a gente!\",\"settings.donateKeys.label\":\"Doar Chaves\",\"settings.donateKeys.no\":\"Não\",\"settings.donateKeys.yes\":\"Sim\",\"settings.empty\":\"Ainda não há definições disponíveis.\",\"settings.error\":\"Falha ao carregar definições.\",\"settings.fastDownload.description\":\"Escolher automaticamente a primeira fonte disponível ao adicionar um jogo.\",\"settings.fastDownload.label\":\"Download Rápido\",\"settings.general\":\"Geral\",\"settings.generalDescription\":\"Preferências globais do LuaTools.\",\"settings.installedFixes.date\":\"Instalado:\",\"settings.installedFixes.delete\":\"Eliminar\",\"settings.installedFixes.deleteConfirm\":\"Tens a certeza de que queres remover esta correção? Isto irá eliminar os ficheiros de correção e executar a verificação Steam.\",\"settings.installedFixes.deleteError\":\"Falha ao remover a correção.\",\"settings.installedFixes.deleteSuccess\":\"Correção removida com sucesso!\",\"settings.installedFixes.deleting\":\"A remover correção...\",\"settings.installedFixes.empty\":\"Ainda não há correções instaladas.\",\"settings.installedFixes.error\":\"Falha ao carregar correções instaladas.\",\"settings.installedFixes.files\":\"{count} ficheiros\",\"settings.installedFixes.loading\":\"A procurar correções instaladas...\",\"settings.installedFixes.title\":\"Correções Instaladas\",\"settings.installedFixes.type\":\"Tipo:\",\"settings.installedLua.delete\":\"Remover\",\"settings.installedLua.deleteConfirm\":\"Remover via LuaTools para este jogo?\",\"settings.installedLua.deleteError\":\"Falha ao remover via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Removido via LuaTools com sucesso!\",\"settings.installedLua.deleting\":\"A remover via LuaTools...\",\"settings.installedLua.disabled\":\"Desativado\",\"settings.installedLua.empty\":\"Ainda não há scripts Lua instalados.\",\"settings.installedLua.error\":\"Falha ao carregar scripts Lua instalados.\",\"settings.installedLua.loading\":\"A procurar scripts Lua instalados...\",\"settings.installedLua.modified\":\"Modificado:\",\"settings.installedLua.title\":\"Jogos via LuaTools\",\"settings.installedLua.unknownInfo\":\"Jogos que mostram 'Jogo Desconhecido' foram instalados de fontes externas (não via LuaTools).\",\"settings.language.description\":\"Escolhe o idioma utilizado pelo LuaTools.\",\"settings.language.label\":\"Idioma\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"A carregar definições...\",\"settings.noChanges\":\"Sem alterações para guardar.\",\"settings.refresh\":\"Atualizar\",\"settings.refreshing\":\"A atualizar...\",\"settings.save\":\"Guardar Definições\",\"settings.saveError\":\"Falha ao guardar definições.\",\"settings.saveSuccess\":\"Definições guardadas com sucesso.\",\"settings.saving\":\"A guardar...\",\"settings.search.clear\":\"Limpar pesquisa\",\"settings.search.noResults\":\"Sem resultados\",\"settings.search.placeholder\":\"Pesquisar definições, jogos, correções...\",\"settings.theme.description\":\"Escolhe o tema de cores para a interface do LuaTools.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Alterações por guardar\",\"settings.useSteamLanguage.description\":\"Usar o idioma do cliente Steam em vez da definição do LuaTools.\",\"settings.useSteamLanguage.label\":\"Usar Idioma do Steam\",\"settings.useSteamLanguage.no\":\"Não\",\"settings.useSteamLanguage.yes\":\"Sim\",\"{fix} applied successfully!\":\"{fix} aplicado com sucesso!\",\"settings.morrenusApiKey.label\":\"Chave API Morrenus\",\"settings.morrenusApiKey.description\":\"Chave API necessária para utilizar a Sadie Source. Obtenha em {link}\",\"settings.morrenusApiKey.placeholder\":\"Introduza a sua chave API\"}",
    "ro": "{\"Add via LuaTools\":\"Adaugă prin LuaTools\",\"Advanced\":\"Avansat\",\"All-In-One Fixes\":\"Fix All-In-One\",\"Apply\":\"Aplică\",\"Applying {fix}\":\"Se aplică {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Ești sigur că vrei să elimini fix? Aceasta va șterge fișierele de fix și va verifica fișierele jocului.\",\"Are you sure?\":\"Ești sigur?\",\"Back\":\"Înapoi\",\"Base Game\":\"Joc de Bază\",\"Cancel\":\"Anulează\",\"Cancellation failed\":\"Anularea a eșuat\",\"Cancelled\":\"Anulat\",\"Cancelled by user\":\"Anulat de utilizator\",\"Cancelled: {reason}\":\"Anulat: {reason}\",\"Cancelling...\":\"Se anulează...\",\"Check for updates\":\"Verifică actualizări\",\"Checking availability…\":\"Se verifică disponibilitatea…\",\"Checking content…\":\"Se verifică conținutul…\",\"Checking generic fix...\":\"Se verifică fix generic...\",\"Checking key...\":\"Se verifică cheia...\",\"Checking online-fix...\":\"Se verifică online-fix...\",\"Checking…\":\"Se verifică…\",\"Close\":\"Închide\",\"Confirm\":\"Confirmă\",\"Content details =>\":\"Detalii conținut =>\",\"DLC Detected\":\"DLC Detectat\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC-urile sunt adăugate împreună cu jocul de bază. Pentru a adăuga fix-uri pentru acest DLC, mergi la pagina jocului de bază: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Închide\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Se descarcă...\",\"Downloading: {percent}%\":\"Se descarcă: {percent}%\",\"Downloading…\":\"Se descarcă…\",\"Error applying fix\":\"Eroare la aplicarea fix\",\"Error checking for fixes\":\"Eroare la verificarea fix\",\"Error starting Online Fix\":\"Eroare la pornirea Online Fix\",\"Error starting un-fix\":\"Eroare la pornirea eliminării fix\",\"Error! Code: {code}\":\"Eroare! Cod: {code}\",\"Error, Code: {code}\":\"Eroare, Cod: {code}\",\"Error, Timed Out\":\"Eroare, Expirare timp\",\"Error: {error}\":\"Eroare: {error}\",\"Expires\":\"Expiră\",\"Extracting to game folder...\":\"Se extrage în folderul jocului...\",\"Failed\":\"Eșuat\",\"Failed to cancel fix download\":\"Nu s-a putut anula descărcarea fix.\",\"Failed to check for fixes.\":\"Nu s-au putut verifica fix.\",\"Failed to load free APIs.\":\"Nu s-au putut încărca API-urile gratuite.\",\"Failed to start fix download\":\"Nu s-a putut porni descărcarea fix\",\"Failed to start un-fix\":\"Nu s-a putut porni eliminarea fix\",\"Failed to verify key\":\"Verificarea cheii a eșuat\",\"Failed: {error}\":\"Eșuat: {error}\",\"Fetch Free API's\":\"Preia API-uri Gratuite\",\"Fetching game name...\":\"Se preia numele jocului...\",\"Finishing…\":\"Se finalizează…\",\"Fixes Menu\":\"Meniu Fix\",\"Found\":\"Găsit\",\"Game Added!\":\"Joc adăugat!\",\"Game added!\":\"Joc adăugat!\",\"Game folder\":\"Folder joc\",\"Game install path not found\":\"Fisierul de instalare a jocului nu a fost găsită\",\"Game not found on any available API.\":\"Jocul nu a fost găsit pe niciun API disponibil.\",\"Generic Fix\":\"Corecție Generică\",\"Generic fix found!\":\"Fix generic găsit!\",\"Go to Base Game\":\"Mergi la Jocul de Bază\",\"Hide\":\"Ascunde\",\"Included\":\"Inclus\",\"Initializing download...\":\"Inițializare descărcare...\",\"Installing…\":\"Se instalează…\",\"Invalid Morrenus API Key format\":\"Format cheie API Morrenus invalid\",\"Invalid key format\":\"Format cheie invalid\",\"Invalid or rejected key\":\"Cheie invalidă sau respinsă\",\"Join the Discord!\":\"Alătură-te pe Discord!\",\"Left click to install, Right click for SteamDB\":\"Clic stânga pentru a instala, clic dreapta pentru SteamDB\",\"Loaded free APIs: {count}\":\"API-uri gratuite încărcate: {count}\",\"Loading APIs...\":\"Se încarcă API-urile...\",\"Loading fixes...\":\"Se încarcă fix...\",\"Look for Fixes\":\"Caută Fix\",\"LuaTools backend unavailable\":\"Backend LuaTools indisponibil\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Meniu Fix AIO\",\"LuaTools · Added Games\":\"LuaTools · Jocuri Adăugate\",\"LuaTools · Fixes Menu\":\"LuaTools · Meniu Fix\",\"LuaTools · Menu\":\"LuaTools · Meniu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Gestionează Jocul\",\"Missing\":\"Lipsește\",\"No games found.\":\"Nu s-au găsit jocuri.\",\"No generic fix\":\"Fără fix generic\",\"No online-fix\":\"Fără online-fix\",\"No updates available.\":\"Nu sunt disponibile actualizări.\",\"No workshop for the game\":\"Fără workshop pentru joc\",\"Not found\":\"Nu a fost găsit\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix găsit!\",\"Only possible thanks to {name} 💜\":\"Posibil doar datorită lui {name} 💜\",\"Proceed\":\"Continuă\",\"Processing package…\":\"Se procesează pachetul…\",\"Remove via LuaTools\":\"Elimină prin LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Eliminate {count} fișiere. Se rulează verificarea Steam...\",\"Removing fix files...\":\"Se elimină fișierele de fix...\",\"Restart Steam\":\"Repornește Steam\",\"Restart Steam now?\":\"Repornește Steam acum?\",\"Searching across sources...\":\"Căutare în toate sursele...\",\"Select Download Source\":\"Selectați sursa de descărcare\",\"Settings\":\"Setări\",\"Skipped\":\"Omis\",\"The game has been added successfully.\":\"Jocul a fost adăugat cu succes.\",\"This game may not work, support for it wont be given in our discord\":\"Acest joc s-ar putea să nu funcționeze, nu se va oferi suport pe discordul nostru\",\"Un-Fix (verify game)\":\"Elimină Fix (verifică joc)\",\"Un-Fixing game\":\"Eliminare fix joc\",\"Unknown Game\":\"Joc Necunoscut\",\"Unknown error\":\"Eroare necunoscută\",\"Usage\":\"Utilizare\",\"Verifying API limits...\":\"Se verifică limitele API...\",\"Waiting…\":\"Se așteaptă…\",\"Working…\":\"Se lucrează…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Ai depășit limita zilnică de descărcări. Așteaptă până mâine sau îmbunătățește planul pe site-ul Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Cheia API Morrenus este invalidă sau expirată. Verifică cheia în setări sau generează una nouă pe site-ul Morrenus.\",\"bigpicture.mouseTip\":\"Pentru modul mouse în Steam: Buton Guide + Joystick dreapta, clic cu RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Tip de opțiune neacceptat: {type}\",\"common.status.error\":\"Eroare\",\"common.status.loading\":\"Se încarcă...\",\"common.status.success\":\"Succes\",\"common.translationMissing\":\"traducere lipsă\",\"common.warning\":\"Avertisment\",\"days left\":\"zile rămase\",\"disclaimer.inputLabel\":\"scrie \\\"Am Înțeles\\\" în căsuța de mai jos pentru a continua\",\"disclaimer.inputPlaceholder\":\"Am Înțeles\",\"disclaimer.line1\":\"LuaTools nu este afiliat în niciun fel cu Millennium\",\"disclaimer.line2\":\"Millennium NU îți va oferi suport pentru acest plugin pe serverul lor de discord\",\"disclaimer.line3\":\"Vei fi BANAT de pe ambele servere LuaTools și Millennium dacă mergi pe discord-ul lor să ceri ajutor\",\"disclaimer.title\":\"Notificare Importantă\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Fix disponibil\",\"gameStatus.playable\":\"Jucabil\",\"gameStatus.unplayable\":\"Nejucabil\",\"menu.advancedLabel\":\"Avansat\",\"menu.checkForUpdates\":\"Verifică Actualizări\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Eroare la obținerea fisierului jocului\",\"menu.error.noAppId\":\"Nu s-a putut determina AppID-ul jocului\",\"menu.error.noInstall\":\"Nu s-a putut găsi instalarea jocului\",\"menu.error.notInstalled\":\"Jocul nu este instalat! Adaugă și instalează-l mai întâi :D\",\"menu.fetchFreeApis\":\"Preia API-uri Gratuite\",\"menu.fixesMenu\":\"Meniu fix\",\"menu.joinDiscordLabel\":\"Alătură-te pe Discord!\",\"menu.manageGameLabel\":\"Gestionează Jocul\",\"menu.remove.confirm\":\"Elimină LuaTools pentru acest joc?\",\"menu.remove.failure\":\"Nu s-a putut elimina LuaTools.\",\"menu.remove.success\":\"LuaTools a fost eliminat pentru această aplicație.\",\"menu.removeLuaTools\":\"Elimină prin LuaTools\",\"menu.settings\":\"Setări\",\"menu.title\":\"LuaTools · Meniu\",\"settings.close\":\"Închide\",\"settings.donateKeys.description\":\"Permite LuaTools să doneze chei Steam nefolosite.\",\"settings.donateKeys.label\":\"Donează Chei\",\"settings.donateKeys.no\":\"Nu\",\"settings.donateKeys.yes\":\"Da\",\"settings.empty\":\"Nu există setări disponibile încă.\",\"settings.error\":\"Nu s-au putut încărca setările.\",\"settings.fastDownload.description\":\"Alegeți automat prima sursă disponibilă la adăugarea unui joc.\",\"settings.fastDownload.label\":\"Descărcare rapidă\",\"settings.general\":\"General\",\"settings.generalDescription\":\"Preferințe globale LuaTools.\",\"settings.installedFixes.date\":\"Instalat:\",\"settings.installedFixes.delete\":\"Șterge\",\"settings.installedFixes.deleteConfirm\":\"Ești sigur că vrei să elimini această corecție? Aceasta va șterge fișierele corecției și va rula verificarea Steam.\",\"settings.installedFixes.deleteError\":\"Nu s-a putut elimina corecția.\",\"settings.installedFixes.deleteSuccess\":\"Corecția a fost eliminată cu succes!\",\"settings.installedFixes.deleting\":\"Se elimină corecția...\",\"settings.installedFixes.empty\":\"Nicio corecție instalată încă.\",\"settings.installedFixes.error\":\"Nu s-au putut încărca corecțiile instalate.\",\"settings.installedFixes.files\":\"{count} fișiere\",\"settings.installedFixes.loading\":\"Se scanează corecțiile instalate...\",\"settings.installedFixes.title\":\"Corecții Instalate\",\"settings.installedFixes.type\":\"Tip:\",\"settings.installedLua.delete\":\"Elimină\",\"settings.installedLua.deleteConfirm\":\"Elimină via LuaTools pentru acest joc?\",\"settings.installedLua.deleteError\":\"Nu s-a putut elimina via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Eliminat via LuaTools cu succes!\",\"settings.installedLua.deleting\":\"Se elimină via LuaTools...\",\"settings.installedLua.disabled\":\"Dezactivat\",\"settings.installedLua.empty\":\"Niciun script Lua instalat încă.\",\"settings.installedLua.error\":\"Nu s-au putut încărca scripturile Lua instalate.\",\"settings.installedLua.loading\":\"Se scanează scripturile Lua instalate...\",\"settings.installedLua.modified\":\"Modificat:\",\"settings.installedLua.title\":\"Jocuri via LuaTools\",\"settings.installedLua.unknownInfo\":\"Jocurile care afișează 'Joc Necunoscut' au fost instalate din surse externe (nu via LuaTools).\",\"settings.language.description\":\"Alege limba folosită de LuaTools.\",\"settings.language.label\":\"Limbă\",\"settings.language.option.en\":\"Engleză\",\"settings.language.option.pt-BR\":\"Portugheză Braziliană\",\"settings.loading\":\"Se încarcă setările...\",\"settings.noChanges\":\"Nu există modificări de salvat.\",\"settings.refresh\":\"Actualizează\",\"settings.refreshing\":\"Se actualizează...\",\"settings.save\":\"Salvează Setările\",\"settings.saveError\":\"Nu s-au putut salva setările.\",\"settings.saveSuccess\":\"Setările au fost salvate cu succes.\",\"settings.saving\":\"Se salvează...\",\"settings.search.clear\":\"Șterge căutarea\",\"settings.search.noResults\":\"Niciun rezultat găsit\",\"settings.search.placeholder\":\"Caută setări, jocuri, corecții...\",\"settings.theme.description\":\"Alege tema de culoare pentru interfața LuaTools.\",\"settings.theme.label\":\"Temă\",\"settings.title\":\"LuaTools · Setări\",\"settings.unsaved\":\"Modificări nesalvate\",\"settings.useSteamLanguage.description\":\"Utilizați limba clientului Steam în loc de setarea LuaTools.\",\"settings.useSteamLanguage.label\":\"Utilizați limba Steam\",\"settings.useSteamLanguage.no\":\"Nu\",\"settings.useSteamLanguage.yes\":\"Da\",\"{fix} applied successfully!\":\"{fix} aplicat cu succes!\",\"settings.morrenusApiKey.label\":\"Cheie API Morrenus\",\"settings.morrenusApiKey.description\":\"Cheia API este necesară pentru a utiliza Sadie Source. Obțineți de la {link}\",\"settings.morrenusApiKey.placeholder\":\"Introduceți cheia API\"}",
    "ru": "{\"Add via LuaTools\":\"Добавить через LuaTools\",\"Advanced\":\"Обновления\",\"All-In-One Fixes\":\"Комплексные исправления\",\"Apply\":\"Применить\",\"Applying {fix}\":\"Применение {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Вы уверены, что хотите удалить исправление? Это удалит файлы исправления и проверит файлы игры!\",\"Are you sure?\":\"Вы уверены?\",\"Back\":\"Назад\",\"Base Game\":\"Базовая игра\",\"Cancel\":\"Отмена\",\"Cancellation failed\":\"Отмена не удалась\",\"Cancelled\":\"Отменено\",\"Cancelled by user\":\"Отменено вами\",\"Cancelled: {reason}\":\"Отменено из-за: {reason}\",\"Cancelling...\":\"Отмена...\",\"Check for updates\":\"Проверить обновления\",\"Checking availability…\":\"Проверка доступности…\",\"Checking content…\":\"Проверка содержимого…\",\"Checking generic fix...\":\"Проверка исправления...\",\"Checking key...\":\"Проверка ключа...\",\"Checking online-fix...\":\"Проверка онлайн-исправления...\",\"Checking…\":\"Проверка…\",\"Close\":\"Закрыть\",\"Confirm\":\"Подтвердить\",\"Content details =>\":\"Подробности контента =>\",\"DLC Detected\":\"Обнаружен DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC добавляются вместе с основной игрой. Для добавления исправлений к данному DLC перейдите на страницу основной игры: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Закрыть\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Загрузка...\",\"Downloading: {percent}%\":\"Установка: {percent}%\",\"Downloading…\":\"Загрузка…\",\"Error applying fix\":\"Ошибка применения исправления\",\"Error checking for fixes\":\"Ошибка при проверке исправлений\",\"Error starting Online Fix\":\"Ошибка запуска онлайн-исправления\",\"Error starting un-fix\":\"Ошибка удаления исправления\",\"Error! Code: {code}\":\"Ошибка! Код: {code}\",\"Error, Code: {code}\":\"Ошибка, Код: {code}\",\"Error, Timed Out\":\"Ошибка, Превышено время ожидания\",\"Error: {error}\":\"Ошибка: {error}\",\"Expires\":\"Истекает\",\"Extracting to game folder...\":\"Извлечение в папку игры...\",\"Failed\":\"Ошибка\",\"Failed to cancel fix download\":\"Не удалось отменить установку исправления\",\"Failed to check for fixes.\":\"Не удалось проверить исправления!\",\"Failed to load free APIs.\":\"Не удалось обновить данные!\",\"Failed to start fix download\":\"Не удалось начать загрузку исправления\",\"Failed to start un-fix\":\"Не удалось начать удаление исправления\",\"Failed to verify key\":\"Не удалось проверить ключ\",\"Failed: {error}\":\"Ошибка: {error}\",\"Fetch Free API's\":\"Обновить данные\",\"Fetching game name...\":\"Получение названия игры...\",\"Finishing…\":\"Завершение…\",\"Fixes Menu\":\"Меню исправлений\",\"Found\":\"Найдено\",\"Game Added!\":\"Игра добавлена!\",\"Game added!\":\"Игра добавлена!\",\"Game folder\":\"Папка игры\",\"Game install path not found\":\"Путь установки игры не найден\",\"Game not found on any available API.\":\"Игра не найдена ни в одном доступном API.\",\"Generic Fix\":\"Универсальное исправление\",\"Generic fix found!\":\"Исправление найдено!\",\"Go to Base Game\":\"Перейти к основной игре\",\"Hide\":\"Скрыть\",\"Included\":\"Включено\",\"Initializing download...\":\"Инициализация загрузки...\",\"Installing…\":\"Установка…\",\"Invalid Morrenus API Key format\":\"Неверный формат ключа API Morrenus\",\"Invalid key format\":\"Неверный формат ключа\",\"Invalid or rejected key\":\"Недействительный или отклонённый ключ\",\"Join the Discord!\":\"Присоединяйтесь к серверу инструмента!\",\"Left click to install, Right click for SteamDB\":\"Левый клик для установки, правый клик для SteamDB\",\"Loaded free APIs: {count}\":\"Данные обновлены: {count}\",\"Loading APIs...\":\"Загрузка API...\",\"Loading fixes...\":\"Загрузка исправлений...\",\"Look for Fixes\":\"Поиск исправлений\",\"LuaTools backend unavailable\":\"Вы уверены, что правильно установили инструмент?\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Меню исправлений AIO\",\"LuaTools · Added Games\":\"LuaTools · Добавленные игры\",\"LuaTools · Fixes Menu\":\"LuaTools · Меню исправлений\",\"LuaTools · Menu\":\"LuaTools · Меню\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Управление игрой\",\"Missing\":\"Отсутствует\",\"No games found.\":\"Игры не найдены!\",\"No generic fix\":\"Исправление не найдено!\",\"No online-fix\":\"Онлайн-исправление не найдено!\",\"No updates available.\":\"Обновления не доступны!\",\"No workshop for the game\":\"Нет мастерской для игры\",\"Not found\":\"Не найдено\",\"Online Fix\":\"Онлайн-исправление\",\"Online Fix (Unsteam)\":\"Онлайн-исправление (вне Steam)\",\"Online-fix found!\":\"Онлайн-исправление найдено!\",\"Only possible thanks to {name} 💜\":\"Благодаря {name} 💜\",\"Proceed\":\"Продолжить\",\"Processing package…\":\"Обработка пакета…\",\"Remove via LuaTools\":\"Удалить из библиотеки\",\"Removed {count} files. Running Steam verification...\":\"Удалено файлов: {count}. Запуск проверки Steam...\",\"Removing fix files...\":\"Удаление файлов исправления...\",\"Restart Steam\":\"Перезапустить Steam\",\"Restart Steam now?\":\"Перезапустить Steam сейчас?\",\"Searching across sources...\":\"Поиск по всем источникам...\",\"Select Download Source\":\"Выберите источник загрузки\",\"Settings\":\"Настройки\",\"Skipped\":\"Пропущено\",\"The game has been added successfully.\":\"Игра успешно добавлена.\",\"This game may not work, support for it wont be given in our discord\":\"Эта игра может не работать, поддержка по ней в нашем Discord предоставляться не будет\",\"Un-Fix (verify game)\":\"Удалить исправление и проверить игру\",\"Un-Fixing game\":\"Удаление исправления игры\",\"Unknown Game\":\"Неизвестная игра\",\"Unknown error\":\"Неизвестная ошибка, свяжитесь с нами\",\"Usage\":\"Использование\",\"Verifying API limits...\":\"Проверка лимитов API...\",\"Waiting…\":\"Ожидание…\",\"Working…\":\"Работаю…\",\"Workshop: \":\"Мастерская: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Вы превысили дневной лимит загрузок. Подождите до завтра или обновите план на сайте Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Ваш ключ API Morrenus недействителен или истёк. Проверьте ключ в настройках или сгенерируйте новый на сайте Morrenus.\",\"bigpicture.mouseTip\":\"Для режима мыши в Steam: Кнопка Guide + Правый джойстик, клик RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Неподдерживаемый тип опции: {type}\",\"common.status.error\":\"Ошибка\",\"common.status.loading\":\"Загрузка...\",\"common.status.success\":\"Успешно\",\"common.translationMissing\":\"Перевод отсутствует, свяжитесь с переводчиком\",\"common.warning\":\"Предупреждение\",\"days left\":\"дней осталось\",\"disclaimer.inputLabel\":\"введите \\\"Я понимаю\\\" в поле ниже для продолжения\",\"disclaimer.inputPlaceholder\":\"Я понимаю\",\"disclaimer.line1\":\"LuaTools никак не связан с Millennium\",\"disclaimer.line2\":\"Millennium НЕ предоставит вам поддержку этого плагина на своём сервере discord\",\"disclaimer.line3\":\"Вы будете ЗАБАНЕНЫ на серверах LuaTools и Millennium, если попросите помощи на их discord\",\"disclaimer.title\":\"Важное уведомление\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Исправление доступно\",\"gameStatus.playable\":\"Играбельно\",\"gameStatus.unplayable\":\"Неиграбельно\",\"menu.advancedLabel\":\"Обновления\",\"menu.checkForUpdates\":\"Проверить обновления\",\"menu.discord\":\"Нажмите для присоединения\",\"menu.error.getPath\":\"Ошибка при получении пути к игре\",\"menu.error.noAppId\":\"Нет идентификатора для этой игры, она была выпущена?\",\"menu.error.noInstall\":\"У вас установлена игра?\",\"menu.error.notInstalled\":\"Игра не установлена! Добавьте и установите её сначала :D\",\"menu.fetchFreeApis\":\"Обновить данные\",\"menu.fixesMenu\":\"Исправления онлайн\",\"menu.joinDiscordLabel\":\"Присоединяйтесь к серверу инструмента!\",\"menu.manageGameLabel\":\"Управление игрой\",\"menu.remove.confirm\":\"Вы уверены, что хотите удалить игру из библиотеки?\",\"menu.remove.failure\":\"Не удалось удалить игру из библиотеки\",\"menu.remove.success\":\"Игра удалена из библиотеки!\",\"menu.removeLuaTools\":\"Удалить из библиотеки\",\"menu.settings\":\"Настройки\",\"menu.title\":\"LuaTools · Меню\",\"settings.close\":\"Закрыть\",\"settings.donateKeys.description\":\"Пожертвуйте ключи расшифровки для игр и помогите всем!\",\"settings.donateKeys.label\":\"Пожертвовать ключи\",\"settings.donateKeys.no\":\"Не хочу помогать\",\"settings.donateKeys.yes\":\"Конечно, я помогу без потерь\",\"settings.empty\":\"Настройки пока недоступны!\",\"settings.error\":\"Не удалось загрузить настройки!\",\"settings.fastDownload.description\":\"Автоматически выбирать первый доступный источник при добавлении игры.\",\"settings.fastDownload.label\":\"Быстрая загрузка\",\"settings.general\":\"Общие\",\"settings.generalDescription\":\"Основные настройки LuaTools\",\"settings.installedFixes.date\":\"Установлено:\",\"settings.installedFixes.delete\":\"Удалить\",\"settings.installedFixes.deleteConfirm\":\"Вы уверены, что хотите удалить это исправление? Это удалит файлы исправления и запустит проверку Steam.\",\"settings.installedFixes.deleteError\":\"Не удалось удалить исправление.\",\"settings.installedFixes.deleteSuccess\":\"Исправление успешно удалено!\",\"settings.installedFixes.deleting\":\"Удаление исправления...\",\"settings.installedFixes.empty\":\"Пока нет установленных исправлений.\",\"settings.installedFixes.error\":\"Не удалось загрузить установленные исправления.\",\"settings.installedFixes.files\":\"{count} файлов\",\"settings.installedFixes.loading\":\"Поиск установленных исправлений...\",\"settings.installedFixes.title\":\"Установленные Исправления\",\"settings.installedFixes.type\":\"Тип:\",\"settings.installedLua.delete\":\"Удалить\",\"settings.installedLua.deleteConfirm\":\"Удалить через LuaTools для этой игры?\",\"settings.installedLua.deleteError\":\"Не удалось удалить через LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Успешно удалено через LuaTools!\",\"settings.installedLua.deleting\":\"Удаление через LuaTools...\",\"settings.installedLua.disabled\":\"Отключено\",\"settings.installedLua.empty\":\"Пока нет установленных скриптов Lua.\",\"settings.installedLua.error\":\"Не удалось загрузить установленные скрипты Lua.\",\"settings.installedLua.loading\":\"Поиск установленных скриптов Lua...\",\"settings.installedLua.modified\":\"Изменено:\",\"settings.installedLua.title\":\"Игры через LuaTools\",\"settings.installedLua.unknownInfo\":\"Игры, показывающие 'Неизвестная игра', были установлены из внешних источников (не через LuaTools).\",\"settings.language.description\":\"Выберите язык для использования в LuaTools\",\"settings.language.label\":\"Язык - language\",\"settings.language.option.en\":\"Английский - English\",\"settings.language.option.pt-BR\":\"Португальский - Portuguese\",\"settings.loading\":\"Загрузка...\",\"settings.noChanges\":\"Нет изменений для сохранения!\",\"settings.refresh\":\"Обновить\",\"settings.refreshing\":\"Обновление...\",\"settings.save\":\"Сохранить настройки\",\"settings.saveError\":\"Не удалось сохранить настройки!\",\"settings.saveSuccess\":\"Настройки успешно сохранены!\",\"settings.saving\":\"Сохранение...\",\"settings.search.clear\":\"Очистить поиск\",\"settings.search.noResults\":\"Ничего не найдено\",\"settings.search.placeholder\":\"Поиск настроек, игр, исправлений...\",\"settings.theme.description\":\"Выберите цветовую тему для интерфейса LuaTools.\",\"settings.theme.label\":\"Тема\",\"settings.title\":\"LuaTools · Настройки\",\"settings.unsaved\":\"Не сохранено!\",\"settings.useSteamLanguage.description\":\"Использовать язык клиента Steam вместо настроек LuaTools.\",\"settings.useSteamLanguage.label\":\"Использовать язык Steam\",\"settings.useSteamLanguage.no\":\"Нет\",\"settings.useSteamLanguage.yes\":\"Да\",\"{fix} applied successfully!\":\"{fix} успешно применено!\",\"settings.morrenusApiKey.label\":\"API-ключ Morrenus\",\"settings.morrenusApiKey.description\":\"API-ключ необходим для использования Sadie Source. Получите на {link}\",\"settings.morrenusApiKey.placeholder\":\"Введите ваш API-ключ\"}",
    "sv": "{\"Add via LuaTools\":\"Lägg till via LuaTools\",\"Advanced\":\"Avancerat\",\"All-In-One Fixes\":\"Allt-i-ett fixar\",\"Apply\":\"Tillämpa\",\"Applying {fix}\":\"Tillämpar {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Är du säker på att du vill ta bort fixen? Detta tar bort fixfilerna och verifierar spelfilerna.\",\"Are you sure?\":\"Är du säker?\",\"Back\":\"Tillbaka\",\"Base Game\":\"Grundspel\",\"Cancel\":\"Avbryt\",\"Cancellation failed\":\"Avbrytningen misslyckades\",\"Cancelled\":\"Avbruten\",\"Cancelled by user\":\"Avbruten av användare\",\"Cancelled: {reason}\":\"Avbruten: {reason}\",\"Cancelling...\":\"Avbryter...\",\"Check for updates\":\"Sök efter uppdateringar\",\"Checking availability…\":\"Kontrollerar tillgänglighet…\",\"Checking content…\":\"Kontrollerar innehåll…\",\"Checking generic fix...\":\"Kontrollerar generell fix...\",\"Checking key...\":\"Kontrollerar nyckel...\",\"Checking online-fix...\":\"Kontrollerar online-fix...\",\"Checking…\":\"Kontrollerar…\",\"Close\":\"Stäng\",\"Confirm\":\"Bekräfta\",\"Content details =>\":\"Innehållsdetaljer =>\",\"DLC Detected\":\"DLC upptäckt\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC:er läggs till tillsammans med grundspelet. För att lägga till fixar för denna DLC, gå till grundspelets sida: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Avfärda\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Laddar ner...\",\"Downloading: {percent}%\":\"Laddar ner: {percent}%\",\"Downloading…\":\"Laddar ner…\",\"Error applying fix\":\"Fel vid tillämpning av fix\",\"Error checking for fixes\":\"Fel vid sökning efter fixar\",\"Error starting Online Fix\":\"Fel vid start av Online Fix\",\"Error starting un-fix\":\"Fel vid borttagning av fix\",\"Error! Code: {code}\":\"Fel! Kod: {code}\",\"Error, Code: {code}\":\"Fel, Kod: {code}\",\"Error, Timed Out\":\"Fel, tidsgräns överskriden\",\"Error: {error}\":\"Fel: {error}\",\"Expires\":\"Går ut\",\"Extracting to game folder...\":\"Packar upp till spelmapp...\",\"Failed\":\"Misslyckades\",\"Failed to cancel fix download\":\"Kunde inte avbryta nedladdning av fix\",\"Failed to check for fixes.\":\"Kunde inte söka efter fixar.\",\"Failed to load free APIs.\":\"Kunde inte ladda gratis API:er.\",\"Failed to start fix download\":\"Kunde inte starta nedladdning av fix\",\"Failed to start un-fix\":\"Kunde inte starta borttagning av fix\",\"Failed to verify key\":\"Kunde inte verifiera nyckel\",\"Failed: {error}\":\"Misslyckades: {error}\",\"Fetch Free API's\":\"Hämta gratis API:er\",\"Fetching game name...\":\"Hämtar spelnamn...\",\"Finishing…\":\"Slutför…\",\"Fixes Menu\":\"Fix-meny\",\"Found\":\"Hittad\",\"Game Added!\":\"Spel tillagt!\",\"Game added!\":\"Spel tillagt!\",\"Game folder\":\"Spelmapp\",\"Game install path not found\":\"Spelets installationssökväg hittades inte\",\"Game not found on any available API.\":\"Spelet hittades inte på någon tillgänglig API.\",\"Generic Fix\":\"Generell fix\",\"Generic fix found!\":\"Generell fix hittad!\",\"Go to Base Game\":\"Gå till grundspel\",\"Hide\":\"Dölj\",\"Included\":\"Inkluderad\",\"Initializing download...\":\"Initialiserar nedladdning...\",\"Installing…\":\"Installerar…\",\"Invalid Morrenus API Key format\":\"Ogiltigt Morrenus API-nyckelformat\",\"Invalid key format\":\"Ogiltigt nyckelformat\",\"Invalid or rejected key\":\"Ogiltig eller avvisad nyckel\",\"Join the Discord!\":\"Gå med i Discord!\",\"Left click to install, Right click for SteamDB\":\"Vänsterklicka för att installera, högerklicka för SteamDB\",\"Loaded free APIs: {count}\":\"Laddade gratis API:er: {count}\",\"Loading APIs...\":\"Laddar API:er...\",\"Loading fixes...\":\"Laddar fixar...\",\"Look for Fixes\":\"Sök efter fixar\",\"LuaTools backend unavailable\":\"LuaTools-backend otillgänglig\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fixes Menu\",\"LuaTools · Added Games\":\"LuaTools · Tillagda spel\",\"LuaTools · Fixes Menu\":\"LuaTools · Fixes Menu\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Hantera spel\",\"Missing\":\"Saknas\",\"No games found.\":\"Inga spel hittades.\",\"No generic fix\":\"Ingen generell fix\",\"No online-fix\":\"Ingen online-fix\",\"No updates available.\":\"Inga uppdateringar tillgängliga.\",\"No workshop for the game\":\"Ingen workshop för spelet\",\"Not found\":\"Hittades inte\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix hittad!\",\"Only possible thanks to {name} 💜\":\"Bara möjligt tack vare {name} 💜\",\"Proceed\":\"Fortsätt\",\"Processing package…\":\"Bearbetar paket…\",\"Remove via LuaTools\":\"Ta bort via LuaTools\",\"Removed {count} files. Running Steam verification...\":\"{count} filer borttagna. Kör Steam-verifiering...\",\"Removing fix files...\":\"Tar bort fixfiler...\",\"Restart Steam\":\"Starta om Steam\",\"Restart Steam now?\":\"Starta om Steam nu?\",\"Searching across sources...\":\"Söker på tvärs av källor...\",\"Select Download Source\":\"Välj nedladdningskälla\",\"Settings\":\"Inställningar\",\"Skipped\":\"Överhoppad\",\"The game has been added successfully.\":\"Spelet har lagts till.\",\"This game may not work, support for it wont be given in our discord\":\"Det här spelet kanske inte fungerar, support ges inte i vår discord\",\"Un-Fix (verify game)\":\"Ta bort fix (verifiera spel)\",\"Un-Fixing game\":\"Tar bort fix från spel\",\"Unknown Game\":\"Okänt spel\",\"Unknown error\":\"Okänt fel\",\"Usage\":\"Användning\",\"Verifying API limits...\":\"Verifierar API-gränser...\",\"Waiting…\":\"Väntar…\",\"Working…\":\"Arbetar…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Du har överskridit din dagliga nedladdningsgräns. Vänta till imorgon eller uppgradera din plan på Morrenus webbplats.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Din Morrenus API-nyckel är ogiltig eller utgången. Kontrollera din nyckel i inställningarna eller generera en ny på Morrenus webbplats.\",\"bigpicture.mouseTip\":\"För att använda musläge i Steam: Guide-knapp + Höger joystick, klicka med RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Alternativtyp stöds inte: {type}\",\"common.status.error\":\"Fel\",\"common.status.loading\":\"Laddar...\",\"common.status.success\":\"Lyckades\",\"common.translationMissing\":\"översättning saknas\",\"common.warning\":\"Varning\",\"days left\":\"dagar kvar\",\"disclaimer.inputLabel\":\"Skriv \\\"Jag förstår\\\" i rutan nedan för att fortsätta\",\"disclaimer.inputPlaceholder\":\"Jag förstår\",\"disclaimer.line1\":\"LuaTools är inte kopplat till Millennium på något sätt\",\"disclaimer.line2\":\"Millennium kommer INTE att ge dig support för detta tillägg på deras Discord-server\",\"disclaimer.line3\":\"Du kommer att bli BANNAD från både LuaTools och Millennium servrar om du ber om hjälp på deras Discord\",\"disclaimer.title\":\"Viktigt meddelande\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Fix tillgänglig\",\"gameStatus.playable\":\"Spelbar\",\"gameStatus.unplayable\":\"Ospelbar\",\"menu.advancedLabel\":\"Avancerat\",\"menu.checkForUpdates\":\"Sök efter uppdateringar\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Fel vid hämtning av spelsökväg\",\"menu.error.noAppId\":\"Kunde inte fastställa spelets AppID\",\"menu.error.noInstall\":\"Kunde inte hitta spelinstallationen\",\"menu.error.notInstalled\":\"Spelet är inte installerat! Lägg till och installera det först :D\",\"menu.fetchFreeApis\":\"Hämta gratis API:er\",\"menu.fixesMenu\":\"Fix-meny\",\"menu.joinDiscordLabel\":\"Gå med i Discord!\",\"menu.manageGameLabel\":\"Hantera spel\",\"menu.remove.confirm\":\"Ta bort via LuaTools för detta spel?\",\"menu.remove.failure\":\"Kunde inte ta bort LuaTools.\",\"menu.remove.success\":\"LuaTools borttaget för denna app.\",\"menu.removeLuaTools\":\"Ta bort via LuaTools\",\"menu.settings\":\"Inställningar\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Stäng\",\"settings.donateKeys.description\":\"Donera dekrypteringsnycklar för spel, det hjälper alla!\",\"settings.donateKeys.label\":\"Donera nycklar\",\"settings.donateKeys.no\":\"Nej\",\"settings.donateKeys.yes\":\"Ja\",\"settings.empty\":\"Inga inställningar tillgängliga ännu.\",\"settings.error\":\"Kunde inte ladda inställningar.\",\"settings.fastDownload.description\":\"Välj automatiskt den första tillgängliga källan när du lägger till et spel.\",\"settings.fastDownload.label\":\"Snabb nedladdning\",\"settings.general\":\"Allmänt\",\"settings.generalDescription\":\"Globala LuaTools-inställningar.\",\"settings.installedFixes.date\":\"Installerad:\",\"settings.installedFixes.delete\":\"Ta bort\",\"settings.installedFixes.deleteConfirm\":\"Är du säker på att du vill ta bort denna fix? Detta tar bort fixfilerna och kör Steam-verifiering.\",\"settings.installedFixes.deleteError\":\"Kunde inte ta bort fixen.\",\"settings.installedFixes.deleteSuccess\":\"Fix borttagen!\",\"settings.installedFixes.deleting\":\"Tar bort fix...\",\"settings.installedFixes.empty\":\"Inga fixar installerade ännu.\",\"settings.installedFixes.error\":\"Kunde inte ladda installerade fixar.\",\"settings.installedFixes.files\":\"{count} filer\",\"settings.installedFixes.loading\":\"Söker efter installerade fixar...\",\"settings.installedFixes.title\":\"Installerade fixar\",\"settings.installedFixes.type\":\"Typ:\",\"settings.installedLua.delete\":\"Ta bort\",\"settings.installedLua.deleteConfirm\":\"Ta bort via LuaTools för detta spel?\",\"settings.installedLua.deleteError\":\"Kunde inte ta bort via LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Borttaget via LuaTools!\",\"settings.installedLua.deleting\":\"Tar bort via LuaTools...\",\"settings.installedLua.disabled\":\"Inaktiverad\",\"settings.installedLua.empty\":\"Inga Lua-skript installerade ännu.\",\"settings.installedLua.error\":\"Kunde inte ladda installerade Lua-skript.\",\"settings.installedLua.loading\":\"Söker efter installerade Lua-skript...\",\"settings.installedLua.modified\":\"Ändrad:\",\"settings.installedLua.title\":\"Spel via LuaTools\",\"settings.installedLua.unknownInfo\":\"Spel som visar 'Okänt spel' installerades från externa källor (inte via LuaTools).\",\"settings.language.description\":\"Välj språket som används av LuaTools.\",\"settings.language.label\":\"Språk\",\"settings.language.option.en\":\"English\",\"settings.language.option.pt-BR\":\"Brazilian Portuguese\",\"settings.loading\":\"Laddar inställningar...\",\"settings.noChanges\":\"Inga ändringar att spara.\",\"settings.refresh\":\"Uppdatera\",\"settings.refreshing\":\"Uppdaterar...\",\"settings.save\":\"Spara inställningar\",\"settings.saveError\":\"Kunde inte spara inställningar.\",\"settings.saveSuccess\":\"Inställningar sparade.\",\"settings.saving\":\"Sparar...\",\"settings.search.clear\":\"Rensa sökning\",\"settings.search.noResults\":\"Inga träffar\",\"settings.search.placeholder\":\"Sök inställningar, spel, fixar...\",\"settings.theme.description\":\"Välj färgtema för LuaTools gränssnitt.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Settings\",\"settings.unsaved\":\"Osparade ändringar\",\"settings.useSteamLanguage.description\":\"Använd Steam-klientens språk istället för LuaTools-inställningen.\",\"settings.useSteamLanguage.label\":\"Använd Steam-språk\",\"settings.useSteamLanguage.no\":\"Nej\",\"settings.useSteamLanguage.yes\":\"Ja\",\"{fix} applied successfully!\":\"{fix} tillämpades!\",\"settings.morrenusApiKey.label\":\"Morrenus API-nyckel\",\"settings.morrenusApiKey.description\":\"API-nyckel krävs för att använda Sadie Source. Hämta från {link}\",\"settings.morrenusApiKey.placeholder\":\"Ange din API-nyckel\"}",
    "th": "{\"Add via LuaTools\":\"เพิ่มผ่าน LuaTools\",\"Advanced\":\"ขั้นสูง\",\"All-In-One Fixes\":\"แก้ไขทั้งหมดในที่เดียว\",\"Apply\":\"นำไปใช้\",\"Applying {fix}\":\"กำลังติดตั้ง {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"คุณแน่ใจหรือไม่ว่าต้องการถอนการแก้ไข? การดำเนินการนี้จะลบไฟล์แก้ไขและตรวจสอบไฟล์เกม\",\"Are you sure?\":\"คุณแน่ใจหรือไม่?\",\"Back\":\"กลับ\",\"Base Game\":\"เกมหลัก\",\"Cancel\":\"ยกเลิก\",\"Cancellation failed\":\"ยกเลิกไม่สำเร็จ\",\"Cancelled\":\"ยกเลิกแล้ว\",\"Cancelled by user\":\"ผู้ใช้ยกเลิก\",\"Cancelled: {reason}\":\"ยกเลิกแล้ว: {reason}\",\"Cancelling...\":\"กำลังยกเลิก...\",\"Check for updates\":\"ตรวจสอบอัปเดต\",\"Checking availability…\":\"กำลังตรวจสอบความพร้อมใช้งาน…\",\"Checking content…\":\"กำลังตรวจสอบเนื้อหา…\",\"Checking generic fix...\":\"กำลังตรวจสอบตัวแก้ไขทั่วไป...\",\"Checking key...\":\"กำลังตรวจสอบคีย์...\",\"Checking online-fix...\":\"กำลังตรวจสอบ online-fix...\",\"Checking…\":\"กำลังตรวจสอบ…\",\"Close\":\"ปิด\",\"Confirm\":\"ยืนยัน\",\"Content details =>\":\"รายละเอียดเนื้อหา =>\",\"DLC Detected\":\"ตรวจพบ DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC จะถูกเพิ่มพร้อมกับเกมหลัก หากต้องการเพิ่มตัวแก้ไขสำหรับ DLC นี้ กรุณาไปที่หน้าเกมหลัก: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"ปิดทิ้ง\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"กำลังดาวน์โหลด...\",\"Downloading: {percent}%\":\"กำลังดาวน์โหลด: {percent}%\",\"Downloading…\":\"กำลังดาวน์โหลด…\",\"Error applying fix\":\"เกิดข้อผิดพลาดในการติดตั้งตัวแก้ไข\",\"Error checking for fixes\":\"เกิดข้อผิดพลาดในการตรวจสอบตัวแก้ไข\",\"Error starting Online Fix\":\"เกิดข้อผิดพลาดในการเริ่ม Online Fix\",\"Error starting un-fix\":\"เกิดข้อผิดพลาดในการเริ่มถอนการแก้ไข\",\"Error! Code: {code}\":\"ผิดพลาด! รหัส: {code}\",\"Error, Code: {code}\":\"ผิดพลาด, รหัส: {code}\",\"Error, Timed Out\":\"ผิดพลาด, หมดเวลา\",\"Error: {error}\":\"ข้อผิดพลาด: {error}\",\"Expires\":\"หมดอายุ\",\"Extracting to game folder...\":\"กำลังแตกไฟล์ไปยังโฟลเดอร์เกม...\",\"Failed\":\"ล้มเหลว\",\"Failed to cancel fix download\":\"ยกเลิกการดาวน์โหลดตัวแก้ไขไม่สำเร็จ\",\"Failed to check for fixes.\":\"ตรวจสอบตัวแก้ไขไม่สำเร็จ\",\"Failed to load free APIs.\":\"โหลด API ฟรีไม่สำเร็จ\",\"Failed to start fix download\":\"เริ่มดาวน์โหลดตัวแก้ไขไม่สำเร็จ\",\"Failed to start un-fix\":\"เริ่มถอนการแก้ไขไม่สำเร็จ\",\"Failed to verify key\":\"ตรวจสอบคีย์ไม่สำเร็จ\",\"Failed: {error}\":\"ล้มเหลว: {error}\",\"Fetch Free API's\":\"ดึงข้อมูล API ฟรี\",\"Fetching game name...\":\"กำลังดึงชื่อเกม...\",\"Finishing…\":\"กำลังเสร็จสิ้น…\",\"Fixes Menu\":\"เมนูตัวแก้ไข\",\"Found\":\"พบแล้ว\",\"Game Added!\":\"เพิ่มเกมแล้ว!\",\"Game added!\":\"เพิ่มเกมแล้ว!\",\"Game folder\":\"โฟลเดอร์เกม\",\"Game install path not found\":\"ไม่พบเส้นทางติดตั้งเกม\",\"Game not found on any available API.\":\"ไม่พบเกมใน API ที่พร้อมใช้งาน\",\"Generic Fix\":\"ตัวแก้ไขทั่วไป\",\"Generic fix found!\":\"พบตัวแก้ไขทั่วไปแล้ว!\",\"Go to Base Game\":\"ไปที่เกมหลัก\",\"Hide\":\"ซ่อน\",\"Included\":\"รวมอยู่แล้ว\",\"Initializing download...\":\"กำลังเริ่มต้นการดาวน์โหลด...\",\"Installing…\":\"กำลังติดตั้ง…\",\"Invalid Morrenus API Key format\":\"รูปแบบคีย์ API Morrenus ไม่ถูกต้อง\",\"Invalid key format\":\"รูปแบบคีย์ไม่ถูกต้อง\",\"Invalid or rejected key\":\"คีย์ไม่ถูกต้องหรือถูกปฏิเสธ\",\"Join the Discord!\":\"เข้าร่วม Discord!\",\"Left click to install, Right click for SteamDB\":\"คลิกซ้ายเพื่อติดตั้ง คลิกขวาเพื่อเปิด SteamDB\",\"Loaded free APIs: {count}\":\"โหลด API ฟรีแล้ว: {count}\",\"Loading APIs...\":\"กำลังโหลด API...\",\"Loading fixes...\":\"กำลังโหลดตัวแก้ไข...\",\"Look for Fixes\":\"ค้นหาตัวแก้ไข\",\"LuaTools backend unavailable\":\"แบ็กเอนด์ LuaTools ไม่พร้อมใช้งาน\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · เมนูแก้ไขทั้งหมด\",\"LuaTools · Added Games\":\"LuaTools · เกมที่เพิ่มแล้ว\",\"LuaTools · Fixes Menu\":\"LuaTools · เมนูตัวแก้ไข\",\"LuaTools · Menu\":\"LuaTools · เมนู\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"จัดการเกม\",\"Missing\":\"ขาดหายไป\",\"No games found.\":\"ไม่พบเกม\",\"No generic fix\":\"ไม่มีตัวแก้ไขทั่วไป\",\"No online-fix\":\"ไม่มี online-fix\",\"No updates available.\":\"ไม่มีอัปเดตใหม่\",\"No workshop for the game\":\"ไม่มี Workshop สำหรับเกมนี้\",\"Not found\":\"ไม่พบ\",\"Online Fix\":\"แก้ไขออนไลน์\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"พบ Online-fix แล้ว!\",\"Only possible thanks to {name} 💜\":\"เป็นไปได้ด้วยความช่วยเหลือจาก {name} 💜\",\"Proceed\":\"ดำเนินการต่อ\",\"Processing package…\":\"กำลังประมวลผลแพ็กเกจ…\",\"Remove via LuaTools\":\"ลบผ่าน LuaTools\",\"Removed {count} files. Running Steam verification...\":\"ลบ {count} ไฟล์แล้ว กำลังตรวจสอบผ่าน Steam...\",\"Removing fix files...\":\"กำลังลบไฟล์แก้ไข...\",\"Restart Steam\":\"รีสตาร์ท Steam\",\"Restart Steam now?\":\"รีสตาร์ท Steam ตอนนี้เลยไหม?\",\"Searching across sources...\":\"กำลังค้นหาจากแหล่งต่างๆ...\",\"Select Download Source\":\"เลือกแหล่งดาวน์โหลด\",\"Settings\":\"การตั้งค่า\",\"Skipped\":\"ข้ามแล้ว\",\"The game has been added successfully.\":\"เพิ่มเกมเรียบร้อยแล้ว\",\"This game may not work, support for it wont be given in our discord\":\"เกมนี้อาจใช้งานไม่ได้ และจะไม่ได้รับการสนับสนุนใน Discord ของเรา\",\"Un-Fix (verify game)\":\"ถอนการแก้ไข (ตรวจสอบเกม)\",\"Un-Fixing game\":\"กำลังถอนการแก้ไขเกม\",\"Unknown Game\":\"เกมที่ไม่รู้จัก\",\"Unknown error\":\"ข้อผิดพลาดที่ไม่ทราบสาเหตุ\",\"Usage\":\"การใช้งาน\",\"Verifying API limits...\":\"กำลังตรวจสอบขีดจำกัด API...\",\"Waiting…\":\"กำลังรอ…\",\"Working…\":\"กำลังทำงาน…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"คุณใช้งานเกินขีดจำกัดการดาวน์โหลดรายวัน กรุณารอจนถึงพรุ่งนี้หรืออัปเกรดแผนของคุณที่เว็บไซต์ Morrenus\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"คีย์ API Morrenus ของคุณไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบคีย์ในการตั้งค่าหรือสร้างใหม่ที่เว็บไซต์ Morrenus\",\"bigpicture.mouseTip\":\"วิธีใช้โหมดเมาส์ใน Steam: กดปุ่ม Guide + จอยสติ๊กขวา คลิกด้วย RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"ประเภทตัวเลือกที่ไม่รองรับ: {type}\",\"common.status.error\":\"ผิดพลาด\",\"common.status.loading\":\"กำลังโหลด...\",\"common.status.success\":\"สำเร็จ\",\"common.translationMissing\":\"ไม่มีคำแปล\",\"common.warning\":\"คำเตือน\",\"days left\":\"วันที่เหลือ\",\"disclaimer.inputLabel\":\"พิมพ์ \\\"ฉันเข้าใจ\\\" ในช่องด้านล่างเพื่อดำเนินการต่อ\",\"disclaimer.inputPlaceholder\":\"ฉันเข้าใจ\",\"disclaimer.line1\":\"LuaTools ไม่ได้มีส่วนเกี่ยวข้องกับ Millennium แต่อย่างใด\",\"disclaimer.line2\":\"Millennium จะไม่ให้การสนับสนุนปลั๊กอินนี้ใน Discord ของพวกเขา\",\"disclaimer.line3\":\"คุณจะถูกแบนจากทั้งสองเซิร์ฟเวอร์หากไปขอความช่วยเหลือใน Discord ของ Millennium\",\"disclaimer.title\":\"คำเตือนสำคัญ\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"มีตัวแก้ไขพร้อมใช้\",\"gameStatus.playable\":\"เล่นได้\",\"gameStatus.unplayable\":\"เล่นไม่ได้\",\"menu.advancedLabel\":\"ขั้นสูง\",\"menu.checkForUpdates\":\"ตรวจสอบอัปเดต\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"เกิดข้อผิดพลาดในการค้นหาเส้นทางเกม\",\"menu.error.noAppId\":\"ไม่สามารถระบุ AppID ของเกมได้\",\"menu.error.noInstall\":\"ไม่พบการติดตั้งเกม\",\"menu.error.notInstalled\":\"ยังไม่ได้ติดตั้งเกม! กรุณาเพิ่มและติดตั้งก่อน :D\",\"menu.fetchFreeApis\":\"ดึงข้อมูล API ฟรี\",\"menu.fixesMenu\":\"เมนูตัวแก้ไข\",\"menu.joinDiscordLabel\":\"เข้าร่วม Discord!\",\"menu.manageGameLabel\":\"จัดการเกม\",\"menu.remove.confirm\":\"ลบ LuaTools สำหรับเกมนี้หรือไม่?\",\"menu.remove.failure\":\"ลบ LuaTools ไม่สำเร็จ\",\"menu.remove.success\":\"ลบ LuaTools สำหรับเกมนี้แล้ว\",\"menu.removeLuaTools\":\"ลบเกมผ่าน LuaTools\",\"menu.settings\":\"การตั้งค่า\",\"menu.title\":\"LuaTools · เมนู\",\"settings.close\":\"ปิด\",\"settings.donateKeys.description\":\"อนุญาตให้ LuaTools บริจาคคีย์ Steam ที่เหลือ\",\"settings.donateKeys.label\":\"บริจาคคีย์\",\"settings.donateKeys.no\":\"ไม่\",\"settings.donateKeys.yes\":\"ใช่\",\"settings.empty\":\"ไม่มีการตั้งค่าที่พร้อมใช้งาน\",\"settings.error\":\"โหลดการตั้งค่าไม่สำเร็จ\",\"settings.fastDownload.description\":\"เลือกแหล่งแรกที่ใช้งานได้โดยอัตโนมัติเมื่อเพิ่มเกม\",\"settings.fastDownload.label\":\"ดาวน์โหลดด่วน\",\"settings.general\":\"ทั่วไป\",\"settings.generalDescription\":\"การตั้งค่าทั่วไปของ LuaTools\",\"settings.installedFixes.date\":\"ติดตั้งเมื่อ:\",\"settings.installedFixes.delete\":\"ลบ\",\"settings.installedFixes.deleteConfirm\":\"คุณแน่ใจหรือไม่ว่าต้องการลบตัวแก้ไขนี้? การดำเนินการนี้จะลบไฟล์แก้ไขและตรวจสอบผ่าน Steam\",\"settings.installedFixes.deleteError\":\"ลบตัวแก้ไขไม่สำเร็จ\",\"settings.installedFixes.deleteSuccess\":\"ลบตัวแก้ไขเรียบร้อยแล้ว!\",\"settings.installedFixes.deleting\":\"กำลังลบตัวแก้ไข...\",\"settings.installedFixes.empty\":\"ยังไม่มีตัวแก้ไขที่ติดตั้ง\",\"settings.installedFixes.error\":\"โหลดรายการตัวแก้ไขที่ติดตั้งไม่สำเร็จ\",\"settings.installedFixes.files\":\"{count} ไฟล์\",\"settings.installedFixes.loading\":\"กำลังค้นหาตัวแก้ไขที่ติดตั้ง...\",\"settings.installedFixes.title\":\"ตัวแก้ไขที่ติดตั้ง\",\"settings.installedFixes.type\":\"ประเภท:\",\"settings.installedLua.delete\":\"ลบ\",\"settings.installedLua.deleteConfirm\":\"ลบ LuaTools สำหรับเกมนี้หรือไม่?\",\"settings.installedLua.deleteError\":\"ลบผ่าน LuaTools ไม่สำเร็จ\",\"settings.installedLua.deleteSuccess\":\"ลบผ่าน LuaTools เรียบร้อยแล้ว!\",\"settings.installedLua.deleting\":\"กำลังลบผ่าน LuaTools...\",\"settings.installedLua.disabled\":\"ปิดใช้งาน\",\"settings.installedLua.empty\":\"ยังไม่มีสคริปต์ Lua ที่ติดตั้ง\",\"settings.installedLua.error\":\"โหลดรายการสคริปต์ Lua ที่ติดตั้งไม่สำเร็จ\",\"settings.installedLua.loading\":\"กำลังค้นหาสคริปต์ Lua ที่ติดตั้ง...\",\"settings.installedLua.modified\":\"แก้ไขเมื่อ:\",\"settings.installedLua.title\":\"เกมผ่าน LuaTools\",\"settings.installedLua.unknownInfo\":\"เกมที่แสดง 'เกมที่ไม่รู้จัก' ถูกติดตั้งจากแหล่งภายนอก (ไม่ผ่าน LuaTools)\",\"settings.language.description\":\"เลือกภาษาที่ใช้ใน LuaTools\",\"settings.language.label\":\"ภาษา\",\"settings.language.option.en\":\"อังกฤษ\",\"settings.language.option.pt-BR\":\"โปรตุเกส (บราซิล)\",\"settings.loading\":\"กำลังโหลดการตั้งค่า...\",\"settings.noChanges\":\"ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก\",\"settings.refresh\":\"รีเฟรช\",\"settings.refreshing\":\"กำลังรีเฟรช...\",\"settings.save\":\"บันทึกการตั้งค่า\",\"settings.saveError\":\"บันทึกการตั้งค่าไม่สำเร็จ\",\"settings.saveSuccess\":\"บันทึกการตั้งค่าเรียบร้อยแล้ว\",\"settings.saving\":\"กำลังบันทึก...\",\"settings.search.clear\":\"ล้างการค้นหา\",\"settings.search.noResults\":\"ไม่พบผลลัพธ์\",\"settings.search.placeholder\":\"ค้นหาการตั้งค่า เกม ตัวแก้ไข...\",\"settings.theme.description\":\"เลือกธีมสีสำหรับหน้าจอ LuaTools\",\"settings.theme.label\":\"ธีม\",\"settings.title\":\"LuaTools · การตั้งค่า\",\"settings.unsaved\":\"มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก\",\"settings.useSteamLanguage.description\":\"ใช้ภาษาจากไคลเอนต์ Steam แทนการตั้งค่าของ LuaTools\",\"settings.useSteamLanguage.label\":\"ใช้ภาษาของ Steam\",\"settings.useSteamLanguage.no\":\"ไม่\",\"settings.useSteamLanguage.yes\":\"ใช่\",\"{fix} applied successfully!\":\"ติดตั้ง {fix} เรียบร้อยแล้ว!\",\"settings.morrenusApiKey.label\":\"คีย์ API ของ Morrenus\",\"settings.morrenusApiKey.description\":\"ต้องใช้คีย์ API เพื่อใช้งาน Sadie Source รับได้ที่ {link}\",\"settings.morrenusApiKey.placeholder\":\"กรอกคีย์ API ของคุณ\"}",
    "tr": "{\"Add via LuaTools\":\"LuaTools ile Ekle\",\"Advanced\":\"Gelişmiş\",\"All-In-One Fixes\":\"Hepsi Bir Arada Fixler\",\"Apply\":\"Uygula\",\"Applying {fix}\":\"{fix} uygulanıyor\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Fixi kaldırmak istediğinizden emin misiniz? Bu, fix dosyalarını kaldıracak ve oyun dosyalarını doğrulayacaktır.\",\"Are you sure?\":\"Emin misiniz?\",\"Back\":\"Geri\",\"Base Game\":\"Ana Oyun\",\"Cancel\":\"İptal\",\"Cancellation failed\":\"İptal etme başarısız\",\"Cancelled\":\"İptal edildi\",\"Cancelled by user\":\"Kullanıcı tarafından iptal edildi\",\"Cancelled: {reason}\":\"İptal edildi: {reason}\",\"Cancelling...\":\"İptal ediliyor...\",\"Check for updates\":\"Güncellemeleri kontrol et\",\"Checking availability…\":\"Uygunluk kontrol ediliyor…\",\"Checking content…\":\"İçerik kontrol ediliyor…\",\"Checking generic fix...\":\"Genel Fix kontrol ediliyor...\",\"Checking key...\":\"Anahtar kontrol ediliyor...\",\"Checking online-fix...\":\"Online-fix kontrol ediliyor...\",\"Checking…\":\"Kontrol ediliyor…\",\"Close\":\"Kapat\",\"Confirm\":\"Onayla\",\"Content details =>\":\"İçerik detayları =>\",\"DLC Detected\":\"DLC Algılandı\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC'ler ana oyunla birlikte eklenir. Bu DLC için fix eklemek için ana oyun sayfasına gidin: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Kapat\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"İndiriliyor...\",\"Downloading: {percent}%\":\"İndiriliyor: {percent}%\",\"Downloading…\":\"İndiriliyor…\",\"Error applying fix\":\"Fix uygulanırken hata\",\"Error checking for fixes\":\"Fix kontrol edilirken hata\",\"Error starting Online Fix\":\"Online Fix başlatılırken hata\",\"Error starting un-fix\":\"Fix kaldırma başlatılırken hata\",\"Error! Code: {code}\":\"Hata! Kod: {code}\",\"Error, Code: {code}\":\"Hata, Kod: {code}\",\"Error, Timed Out\":\"Hata, Zaman aşımı\",\"Error: {error}\":\"Hata: {error}\",\"Expires\":\"Sona erer\",\"Extracting to game folder...\":\"Oyun klasörüne çıkarılıyor...\",\"Failed\":\"Başarısız\",\"Failed to cancel fix download\":\"Fix indirmesi iptal edilemedi\",\"Failed to check for fixes.\":\"Fix kontrol edilemedi.\",\"Failed to load free APIs.\":\"Ücretsiz API'ler yüklenemedi.\",\"Failed to start fix download\":\"Fix indirmesi başlatılamadı\",\"Failed to start un-fix\":\"Fix kaldırma başlatılamadı\",\"Failed to verify key\":\"Anahtar doğrulanamadı\",\"Failed: {error}\":\"Başarısız: {error}\",\"Fetch Free API's\":\"Ücretsiz API'leri Getir\",\"Fetching game name...\":\"Oyun adı alınıyor...\",\"Finishing…\":\"Tamamlanıyor…\",\"Fixes Menu\":\"Fix Menüsü\",\"Found\":\"Bulundu\",\"Game Added!\":\"Oyun eklendi!\",\"Game added!\":\"Oyun eklendi!\",\"Game folder\":\"Oyun klasörü\",\"Game install path not found\":\"Oyun kurulum yolu bulunamadı\",\"Game not found on any available API.\":\"Hiçbir API'de oyun bulunamadı.\",\"Generic Fix\":\"Genel Düzeltme\",\"Generic fix found!\":\"Genel fix bulundu!\",\"Go to Base Game\":\"Ana Oyuna Git\",\"Hide\":\"Gizle\",\"Included\":\"Dahil\",\"Initializing download...\":\"İndirme başlatılıyor...\",\"Installing…\":\"Kuruluyor…\",\"Invalid Morrenus API Key format\":\"Geçersiz Morrenus API anahtarı formatı\",\"Invalid key format\":\"Geçersiz anahtar formatı\",\"Invalid or rejected key\":\"Geçersiz veya reddedilen anahtar\",\"Join the Discord!\":\"Discord'a katıl!\",\"Left click to install, Right click for SteamDB\":\"Kurulum için sol tık, SteamDB açmak için sağ tık\",\"Loaded free APIs: {count}\":\"Yüklenen ücretsiz API'ler: {count}\",\"Loading APIs...\":\"API'ler yükleniyor...\",\"Loading fixes...\":\"Fix yükleniyor...\",\"Look for Fixes\":\"Fixleri Ara\",\"LuaTools backend unavailable\":\"LuaTools arka plan kodu kullanılamıyor\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · AIO Fix Menüsü\",\"LuaTools · Added Games\":\"LuaTools · Eklenen Oyunlar\",\"LuaTools · Fixes Menu\":\"LuaTools · Fix Menüsü\",\"LuaTools · Menu\":\"LuaTools · Menü\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Oyunu Yönet\",\"Missing\":\"Eksik\",\"No games found.\":\"Oyun bulunamadı.\",\"No generic fix\":\"Genel fix yok\",\"No online-fix\":\"Online-fix yok\",\"No updates available.\":\"Güncelleme mevcut değil.\",\"No workshop for the game\":\"Oyun için workshop yok\",\"Not found\":\"Bulunamadı\",\"Online Fix\":\"Online Fix\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix bulundu!\",\"Only possible thanks to {name} 💜\":\"Sadece {name} sayesinde mümkün 💜\",\"Proceed\":\"Devam et\",\"Processing package…\":\"Paket işleniyor…\",\"Remove via LuaTools\":\"LuaTools ile Kaldır\",\"Removed {count} files. Running Steam verification...\":\"{count} dosya kaldırıldı. Steam doğrulaması çalıştırılıyor...\",\"Removing fix files...\":\"Fix dosyaları kaldırılıyor...\",\"Restart Steam\":\"Steam'i Yeniden Başlat\",\"Restart Steam now?\":\"Steam'i şimdi yeniden başlat?\",\"Searching across sources...\":\"Kaynaklar arasında aranıyor...\",\"Select Download Source\":\"İndirme Kaynağını Seç\",\"Settings\":\"Ayarlar\",\"Skipped\":\"Atlandı\",\"The game has been added successfully.\":\"Oyun başarıyla eklendi.\",\"This game may not work, support for it wont be given in our discord\":\"Bu oyun çalışmayabilir, discordumuzda destek verilmeyecektir\",\"Un-Fix (verify game)\":\"Fixi Kaldır (oyunu doğrula)\",\"Un-Fixing game\":\"Oyun Fixi kaldırılıyor\",\"Unknown Game\":\"Bilinmeyen Oyun\",\"Unknown error\":\"Bilinmeyen hata\",\"Usage\":\"Kullanım\",\"Verifying API limits...\":\"API limitleri doğrulanıyor...\",\"Waiting…\":\"Bekleniyor…\",\"Working…\":\"Çalışıyor…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Günlük indirme limitinizi aştınız. Yarına kadar bekleyin veya Morrenus web sitesinden planınızı yükseltin.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Morrenus API anahtarınız geçersiz veya süresi dolmuş. Ayarlardan anahtarınızı kontrol edin veya Morrenus web sitesinden yenisini oluşturun.\",\"bigpicture.mouseTip\":\"Steam'de fare modunu kullanmak için: Guide Düğmesi + Sağ Joystick, RB ile tıklayın\",\"common.alert.ok\":\"Tamam\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Desteklenmeyen seçenek türü: {type}\",\"common.status.error\":\"Hata\",\"common.status.loading\":\"Yükleniyor...\",\"common.status.success\":\"Başarılı\",\"common.translationMissing\":\"çeviri eksik\",\"common.warning\":\"Uyarı\",\"days left\":\"gün kaldı\",\"disclaimer.inputLabel\":\"devam etmek için aşağıdaki kutuya \\\"Anlıyorum\\\" yazın\",\"disclaimer.inputPlaceholder\":\"Anlıyorum\",\"disclaimer.line1\":\"LuaTools, Millennium ile hiçbir şekilde bağlantılı değildir\",\"disclaimer.line2\":\"Millennium bu eklenti için discord sunucusunda size destek SAĞLAMAYACAKTIR\",\"disclaimer.line3\":\"Yardım istemek için discord'larına giderseniz hem LuaTools hem de Millennium sunucularından BANLANACAKSINIZ\",\"disclaimer.title\":\"Önemli Uyarı\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Düzeltme mevcut\",\"gameStatus.playable\":\"Oynanabilir\",\"gameStatus.unplayable\":\"Oynanamaz\",\"menu.advancedLabel\":\"Gelişmiş\",\"menu.checkForUpdates\":\"Güncellemeleri Kontrol Et\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Oyun yolu alınırken hata\",\"menu.error.noAppId\":\"Oyun AppID'si belirlenemedi\",\"menu.error.noInstall\":\"Oyun kurulumu bulunamadı\",\"menu.error.notInstalled\":\"Oyun yüklü değil! Önce ekleyip yükleyin :D\",\"menu.fetchFreeApis\":\"Ücretsiz API'leri Getir\",\"menu.fixesMenu\":\"Fix Menüsü\",\"menu.joinDiscordLabel\":\"Discord'a katıl!\",\"menu.manageGameLabel\":\"Oyunu Yönet\",\"menu.remove.confirm\":\"Bu oyun için LuaTools'u kaldır?\",\"menu.remove.failure\":\"LuaTools kaldırılamadı.\",\"menu.remove.success\":\"Bu uygulama için LuaTools kaldırıldı.\",\"menu.removeLuaTools\":\"LuaTools ile Kaldır\",\"menu.settings\":\"Ayarlar\",\"menu.title\":\"LuaTools · Menü\",\"settings.close\":\"Kapat\",\"settings.donateKeys.description\":\"LuaTools'un kullanılmayan Steam keylerini bağışlamasına izin ver. Herkese yardımcı ol\",\"settings.donateKeys.label\":\"Anahtarları Bağışla\",\"settings.donateKeys.no\":\"Hayır\",\"settings.donateKeys.yes\":\"Evet\",\"settings.empty\":\"Henüz ayar mevcut değil.\",\"settings.error\":\"Ayarlar yüklenemedi.\",\"settings.fastDownload.description\":\"Bir oyun eklerken mevcut ilk kaynağı otomatik olarak seçin.\",\"settings.fastDownload.label\":\"Hızlı İndirme\",\"settings.general\":\"Genel\",\"settings.generalDescription\":\"LuaTools genel tercihleri.\",\"settings.installedFixes.date\":\"Yüklendi:\",\"settings.installedFixes.delete\":\"Sil\",\"settings.installedFixes.deleteConfirm\":\"Bu düzeltmeyi kaldırmak istediğinizden emin misiniz? Bu, düzeltme dosyalarını silecek ve Steam doğrulamasını çalıştıracaktır.\",\"settings.installedFixes.deleteError\":\"Düzeltme kaldırılamadı.\",\"settings.installedFixes.deleteSuccess\":\"Düzeltme başarıyla kaldırıldı!\",\"settings.installedFixes.deleting\":\"Düzeltme kaldırılıyor...\",\"settings.installedFixes.empty\":\"Henüz düzeltme yüklenmedi.\",\"settings.installedFixes.error\":\"Yüklü düzeltmeler yüklenemedi.\",\"settings.installedFixes.files\":\"{count} dosya\",\"settings.installedFixes.loading\":\"Yüklü düzeltmeler taranıyor...\",\"settings.installedFixes.title\":\"Yüklü Düzeltmeler\",\"settings.installedFixes.type\":\"Tür:\",\"settings.installedLua.delete\":\"Kaldır\",\"settings.installedLua.deleteConfirm\":\"Bu oyun için LuaTools ile kaldırılsın mı?\",\"settings.installedLua.deleteError\":\"LuaTools ile kaldırılamadı.\",\"settings.installedLua.deleteSuccess\":\"LuaTools ile başarıyla kaldırıldı!\",\"settings.installedLua.deleting\":\"LuaTools ile kaldırılıyor...\",\"settings.installedLua.disabled\":\"Devre dışı\",\"settings.installedLua.empty\":\"Henüz Lua betiği yüklenmedi.\",\"settings.installedLua.error\":\"Yüklü Lua betikleri yüklenemedi.\",\"settings.installedLua.loading\":\"Yüklü Lua betikleri taranıyor...\",\"settings.installedLua.modified\":\"Değiştirildi:\",\"settings.installedLua.title\":\"LuaTools ile Oyunlar\",\"settings.installedLua.unknownInfo\":\"'Bilinmeyen Oyun' gösteren oyunlar harici kaynaklardan yüklendi (LuaTools ile değil).\",\"settings.language.description\":\"LuaTools tarafından kullanılacak dili seçin.\",\"settings.language.label\":\"Dil\",\"settings.language.option.en\":\"İngilizce\",\"settings.language.option.pt-BR\":\"Brezilya Portekizcesi\",\"settings.loading\":\"Ayarlar yükleniyor...\",\"settings.noChanges\":\"Kaydedilecek değişiklik yok.\",\"settings.refresh\":\"Yenile\",\"settings.refreshing\":\"Yenileniyor...\",\"settings.save\":\"Ayarları Kaydet\",\"settings.saveError\":\"Ayarlar kaydedilemedi.\",\"settings.saveSuccess\":\"Ayarlar başarıyla kaydedildi.\",\"settings.saving\":\"Kaydediliyor...\",\"settings.search.clear\":\"Aramayı temizle\",\"settings.search.noResults\":\"Sonuç bulunamadı\",\"settings.search.placeholder\":\"Ayarları, oyunları, düzeltmeleri ara...\",\"settings.theme.description\":\"LuaTools arayüzü için renk teması seçin.\",\"settings.theme.label\":\"Tema\",\"settings.title\":\"LuaTools · Ayarlar\",\"settings.unsaved\":\"Kaydedilmemiş değişiklikler\",\"settings.useSteamLanguage.description\":\"LuaTools ayarı yerine Steam istemcisinin dilini kullanın.\",\"settings.useSteamLanguage.label\":\"Steam Dilini Kullan\",\"settings.useSteamLanguage.no\":\"Hayır\",\"settings.useSteamLanguage.yes\":\"Evet\",\"{fix} applied successfully!\":\"{fix} başarıyla uygulandı!\",\"settings.morrenusApiKey.label\":\"Morrenus API Anahtarı\",\"settings.morrenusApiKey.description\":\"Sadie Source'u kullanmak için API anahtarı gereklidir. {link} adresinden alın\",\"settings.morrenusApiKey.placeholder\":\"API Anahtarınızı girin\"}",
    "uk": "{\"Add via LuaTools\":\"Додати через LuaTools\",\"Advanced\":\"Додатково\",\"All-In-One Fixes\":\"Комплексні виправлення\",\"Apply\":\"Застосувати\",\"Applying {fix}\":\"Застосування {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Ви впевнені, що хочете скасувати виправлення? Це видалить файли виправлення та перевірить файли гри.\",\"Are you sure?\":\"Ви впевнені?\",\"Back\":\"Назад\",\"Base Game\":\"Основна гра\",\"Cancel\":\"Скасувати\",\"Cancellation failed\":\"Не вдалося скасувати\",\"Cancelled\":\"Скасовано\",\"Cancelled by user\":\"Скасовано користувачем\",\"Cancelled: {reason}\":\"Скасовано: {reason}\",\"Cancelling...\":\"Скасування...\",\"Check for updates\":\"Перевірити оновлення\",\"Checking availability…\":\"Перевірка доступності…\",\"Checking content…\":\"Перевірка вмісту…\",\"Checking generic fix...\":\"Перевірка загального виправлення...\",\"Checking key...\":\"Перевірка ключа...\",\"Checking online-fix...\":\"Перевірка online-fix...\",\"Checking…\":\"Перевірка…\",\"Close\":\"Закрити\",\"Confirm\":\"Підтвердити\",\"Content details =>\":\"Деталі вмісту =>\",\"DLC Detected\":\"Виявлено DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC додаються разом з основною грою. Щоб додати виправлення для цього DLC, перейдіть на сторінку основної гри: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Закрити\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Завантаження...\",\"Downloading: {percent}%\":\"Завантаження: {percent}%\",\"Downloading…\":\"Завантаження…\",\"Error applying fix\":\"Помилка при застосуванні виправлення\",\"Error checking for fixes\":\"Помилка при перевірці виправлень\",\"Error starting Online Fix\":\"Помилка при запуску Online Fix\",\"Error starting un-fix\":\"Помилка при запуску скасування виправлення\",\"Error! Code: {code}\":\"Помилка! Код: {code}\",\"Error, Code: {code}\":\"Помилка, Код: {code}\",\"Error, Timed Out\":\"Помилка, час очікування вичерпано\",\"Error: {error}\":\"Помилка: {error}\",\"Expires\":\"Закінчується\",\"Extracting to game folder...\":\"Розпакування в папку гри...\",\"Failed\":\"Невдача\",\"Failed to cancel fix download\":\"Не вдалося скасувати завантаження виправлення\",\"Failed to check for fixes.\":\"Не вдалося перевірити виправлення.\",\"Failed to load free APIs.\":\"Не вдалося завантажити безкоштовні API.\",\"Failed to start fix download\":\"Не вдалося розпочати завантаження виправлення\",\"Failed to start un-fix\":\"Не вдалося розпочати скасування виправлення\",\"Failed to verify key\":\"Не вдалося перевірити ключ\",\"Failed: {error}\":\"Невдача: {error}\",\"Fetch Free API's\":\"Отримати безкоштовні API\",\"Fetching game name...\":\"Отримання назви гри...\",\"Finishing…\":\"Завершення…\",\"Fixes Menu\":\"Меню виправлень\",\"Found\":\"Знайдено\",\"Game Added!\":\"Гру додано!\",\"Game added!\":\"Гру додано!\",\"Game folder\":\"Папка гри\",\"Game install path not found\":\"Шлях встановлення гри не знайдено\",\"Game not found on any available API.\":\"Гру не знайдено в жодному доступному API.\",\"Generic Fix\":\"Загальне виправлення\",\"Generic fix found!\":\"Загальне виправлення знайдено!\",\"Go to Base Game\":\"Перейти до основної гри\",\"Hide\":\"Сховати\",\"Included\":\"Включено\",\"Initializing download...\":\"Ініціалізація завантаження...\",\"Installing…\":\"Встановлення…\",\"Invalid Morrenus API Key format\":\"Невірний формат ключа API Morrenus\",\"Invalid key format\":\"Невірний формат ключа\",\"Invalid or rejected key\":\"Недійсний або відхилений ключ\",\"Join the Discord!\":\"Приєднуйтесь до Discord!\",\"Left click to install, Right click for SteamDB\":\"Лівий клік для встановлення, правий клік для SteamDB\",\"Loaded free APIs: {count}\":\"Завантажено безкоштовних API: {count}\",\"Loading APIs...\":\"Завантаження API...\",\"Loading fixes...\":\"Завантаження виправлень...\",\"Look for Fixes\":\"Шукати виправлення\",\"LuaTools backend unavailable\":\"Бекенд LuaTools недоступний\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Комплексні виправлення\",\"LuaTools · Added Games\":\"LuaTools · Додані ігри\",\"LuaTools · Fixes Menu\":\"LuaTools · Меню виправлень\",\"LuaTools · Menu\":\"LuaTools · Меню\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Керувати грою\",\"Missing\":\"Відсутнє\",\"No games found.\":\"Ігор не знайдено.\",\"No generic fix\":\"Загальне виправлення відсутнє\",\"No online-fix\":\"Online-fix відсутній\",\"No updates available.\":\"Оновлення відсутні.\",\"No workshop for the game\":\"Немає майстерні для гри\",\"Not found\":\"Не знайдено\",\"Online Fix\":\"Онлайн-виправлення\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Online-fix знайдено!\",\"Only possible thanks to {name} 💜\":\"Можливо лише завдяки {name} 💜\",\"Proceed\":\"Продовжити\",\"Processing package…\":\"Обробка пакету…\",\"Remove via LuaTools\":\"Видалити через LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Видалено {count} файлів. Запуск перевірки Steam...\",\"Removing fix files...\":\"Видалення файлів виправлення...\",\"Restart Steam\":\"Перезапустити Steam\",\"Restart Steam now?\":\"Перезапустити Steam зараз?\",\"Searching across sources...\":\"Пошук за всіма джерелами...\",\"Select Download Source\":\"Виберіть джерело завантаження\",\"Settings\":\"Налаштування\",\"Skipped\":\"Пропущено\",\"The game has been added successfully.\":\"Гру успішно додано.\",\"This game may not work, support for it wont be given in our discord\":\"Ця гра може не працювати, підтримка по ній в нашому Discord не надаватиметься\",\"Un-Fix (verify game)\":\"Скасувати виправлення (перевірити гру)\",\"Un-Fixing game\":\"Скасування виправлення гри\",\"Unknown Game\":\"Невідома гра\",\"Unknown error\":\"Невідома помилка\",\"Usage\":\"Використання\",\"Verifying API limits...\":\"Перевірка лімітів API...\",\"Waiting…\":\"Очікування…\",\"Working…\":\"Виконується…\",\"Workshop: \":\"Майстерня: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Ви перевищили денний ліміт завантажень. Зачекайте до завтра або оновіть план на сайті Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Ваш ключ API Morrenus недійсний або прострочений. Перевірте ключ у налаштуваннях або згенеруйте новий на сайті Morrenus.\",\"bigpicture.mouseTip\":\"Для режиму миші у Steam: кнопка Guide + правий стік, натискання через RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Непідтримуваний тип опції: {type}\",\"common.status.error\":\"Помилка\",\"common.status.loading\":\"Завантаження...\",\"common.status.success\":\"Успішно\",\"common.translationMissing\":\"переклад відсутній\",\"common.warning\":\"Попередження\",\"days left\":\"днів залишилось\",\"disclaimer.inputLabel\":\"введіть \\\"Я Розумію\\\" в поле нижче, щоб продовжити\",\"disclaimer.inputPlaceholder\":\"Я Розумію\",\"disclaimer.line1\":\"LuaTools жодним чином не пов'язаний з Millennium\",\"disclaimer.line2\":\"Millennium НЕ надаватиме підтримку цього плагіна у своєму Discord\",\"disclaimer.line3\":\"Вас ЗАБАНЯТЬ на обох серверах, якщо ви звернетесь за допомогою в Discord Millennium\",\"disclaimer.title\":\"Важливе попередження\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Доступне виправлення\",\"gameStatus.playable\":\"Можна грати\",\"gameStatus.unplayable\":\"Неможливо грати\",\"menu.advancedLabel\":\"Додатково\",\"menu.checkForUpdates\":\"Перевірити оновлення\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Помилка при отриманні шляху гри\",\"menu.error.noAppId\":\"Не вдалося визначити AppID гри\",\"menu.error.noInstall\":\"Не вдалося знайти встановлену гру\",\"menu.error.notInstalled\":\"Гру не встановлено! Спочатку додайте та встановіть :D\",\"menu.fetchFreeApis\":\"Отримати безкоштовні API\",\"menu.fixesMenu\":\"Меню виправлень\",\"menu.joinDiscordLabel\":\"Приєднуйтесь до Discord!\",\"menu.manageGameLabel\":\"Керувати грою\",\"menu.remove.confirm\":\"Видалити LuaTools для цієї гри?\",\"menu.remove.failure\":\"Не вдалося видалити LuaTools.\",\"menu.remove.success\":\"LuaTools видалено для цієї гри.\",\"menu.removeLuaTools\":\"Видалити гру через LuaTools\",\"menu.settings\":\"Налаштування\",\"menu.title\":\"LuaTools · Меню\",\"settings.close\":\"Закрити\",\"settings.donateKeys.description\":\"Дозволити LuaTools передавати зайві ключі Steam.\",\"settings.donateKeys.label\":\"Передати ключі\",\"settings.donateKeys.no\":\"Ні\",\"settings.donateKeys.yes\":\"Так\",\"settings.empty\":\"Немає доступних налаштувань.\",\"settings.error\":\"Не вдалося завантажити налаштування.\",\"settings.fastDownload.description\":\"Автоматично вибирати перше доступне джерело при додаванні гри.\",\"settings.fastDownload.label\":\"Швидке завантаження\",\"settings.general\":\"Загальні\",\"settings.generalDescription\":\"Глобальні налаштування LuaTools.\",\"settings.installedFixes.date\":\"Встановлено:\",\"settings.installedFixes.delete\":\"Видалити\",\"settings.installedFixes.deleteConfirm\":\"Ви впевнені, що хочете видалити це виправлення? Це видалить файли виправлення та запустить перевірку Steam.\",\"settings.installedFixes.deleteError\":\"Не вдалося видалити виправлення.\",\"settings.installedFixes.deleteSuccess\":\"Виправлення успішно видалено!\",\"settings.installedFixes.deleting\":\"Видалення виправлення...\",\"settings.installedFixes.empty\":\"Ще немає встановлених виправлень.\",\"settings.installedFixes.error\":\"Не вдалося завантажити встановлені виправлення.\",\"settings.installedFixes.files\":\"{count} файлів\",\"settings.installedFixes.loading\":\"Пошук встановлених виправлень...\",\"settings.installedFixes.title\":\"Встановлені виправлення\",\"settings.installedFixes.type\":\"Тип:\",\"settings.installedLua.delete\":\"Видалити\",\"settings.installedLua.deleteConfirm\":\"Видалити LuaTools для цієї гри?\",\"settings.installedLua.deleteError\":\"Не вдалося видалити через LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Успішно видалено через LuaTools!\",\"settings.installedLua.deleting\":\"Видалення через LuaTools...\",\"settings.installedLua.disabled\":\"Вимкнено\",\"settings.installedLua.empty\":\"Ще немає встановлених скриптів Lua.\",\"settings.installedLua.error\":\"Не вдалося завантажити встановлені скрипти Lua.\",\"settings.installedLua.loading\":\"Пошук встановлених скриптів Lua...\",\"settings.installedLua.modified\":\"Змінено:\",\"settings.installedLua.title\":\"Ігри через LuaTools\",\"settings.installedLua.unknownInfo\":\"Ігри з позначкою 'Невідома гра' були встановлені із зовнішніх джерел (не через LuaTools).\",\"settings.language.description\":\"Оберіть мову інтерфейсу LuaTools.\",\"settings.language.label\":\"Мова\",\"settings.language.option.en\":\"Англійська\",\"settings.language.option.pt-BR\":\"Португальська (Бразилія)\",\"settings.loading\":\"Завантаження налаштувань...\",\"settings.noChanges\":\"Немає змін для збереження.\",\"settings.refresh\":\"Оновити\",\"settings.refreshing\":\"Оновлення...\",\"settings.save\":\"Зберегти налаштування\",\"settings.saveError\":\"Не вдалося зберегти налаштування.\",\"settings.saveSuccess\":\"Налаштування успішно збережено.\",\"settings.saving\":\"Збереження...\",\"settings.search.clear\":\"Очистити пошук\",\"settings.search.noResults\":\"Нічого не знайдено\",\"settings.search.placeholder\":\"Шукати налаштування, ігри, виправлення...\",\"settings.theme.description\":\"Оберіть колірну тему інтерфейсу LuaTools.\",\"settings.theme.label\":\"Тема\",\"settings.title\":\"LuaTools · Налаштування\",\"settings.unsaved\":\"Незбережені зміни\",\"settings.useSteamLanguage.description\":\"Використовувати мову клієнта Steam замість налаштувань LuaTools.\",\"settings.useSteamLanguage.label\":\"Використовувати мову Steam\",\"settings.useSteamLanguage.no\":\"Ні\",\"settings.useSteamLanguage.yes\":\"Так\",\"{fix} applied successfully!\":\"{fix} успішно застосовано!\",\"settings.morrenusApiKey.label\":\"Ключ API Morrenus\",\"settings.morrenusApiKey.description\":\"Ключ API потрібен для використання Sadie Source. Отримайте на {link}\",\"settings.morrenusApiKey.placeholder\":\"Введіть ваш ключ API\"}",
    "vi": "{\"Add via LuaTools\":\"Thêm qua LuaTools\",\"Advanced\":\"Nâng cao\",\"All-In-One Fixes\":\"Bản sửa lỗi tất cả trong một\",\"Apply\":\"Áp dụng\",\"Applying {fix}\":\"Đang áp dụng {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"Bạn có chắc muốn gỡ bản sửa lỗi? Thao tác này sẽ xóa các tệp sửa lỗi và xác minh tệp trò chơi.\",\"Are you sure?\":\"Bạn có chắc không?\",\"Back\":\"Quay lại\",\"Base Game\":\"Trò chơi gốc\",\"Cancel\":\"Hủy\",\"Cancellation failed\":\"Hủy thất bại\",\"Cancelled\":\"Đã hủy\",\"Cancelled by user\":\"Người dùng đã hủy\",\"Cancelled: {reason}\":\"Đã hủy: {reason}\",\"Cancelling...\":\"Đang hủy...\",\"Check for updates\":\"Kiểm tra cập nhật\",\"Checking availability…\":\"Đang kiểm tra khả dụng…\",\"Checking content…\":\"Đang kiểm tra nội dung…\",\"Checking generic fix...\":\"Đang kiểm tra bản sửa lỗi chung...\",\"Checking key...\":\"Đang kiểm tra khóa...\",\"Checking online-fix...\":\"Đang kiểm tra online-fix...\",\"Checking…\":\"Đang kiểm tra…\",\"Close\":\"Đóng\",\"Confirm\":\"Xác nhận\",\"Content details =>\":\"Chi tiết nội dung =>\",\"DLC Detected\":\"Phát hiện DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC được thêm cùng với trò chơi gốc. Để thêm bản sửa lỗi cho DLC này, vui lòng đến trang trò chơi gốc: <br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"Bỏ qua\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"Đang tải xuống...\",\"Downloading: {percent}%\":\"Đang tải xuống: {percent}%\",\"Downloading…\":\"Đang tải xuống…\",\"Error applying fix\":\"Lỗi khi áp dụng bản sửa lỗi\",\"Error checking for fixes\":\"Lỗi khi kiểm tra bản sửa lỗi\",\"Error starting Online Fix\":\"Lỗi khi khởi chạy Online Fix\",\"Error starting un-fix\":\"Lỗi khi bắt đầu gỡ bản sửa lỗi\",\"Error! Code: {code}\":\"Lỗi! Mã: {code}\",\"Error, Code: {code}\":\"Lỗi, Mã: {code}\",\"Error, Timed Out\":\"Lỗi, hết thời gian chờ\",\"Error: {error}\":\"Lỗi: {error}\",\"Expires\":\"Hết hạn\",\"Extracting to game folder...\":\"Đang giải nén vào thư mục trò chơi...\",\"Failed\":\"Thất bại\",\"Failed to cancel fix download\":\"Không thể hủy tải bản sửa lỗi\",\"Failed to check for fixes.\":\"Không thể kiểm tra bản sửa lỗi.\",\"Failed to load free APIs.\":\"Không thể tải API miễn phí.\",\"Failed to start fix download\":\"Không thể bắt đầu tải bản sửa lỗi\",\"Failed to start un-fix\":\"Không thể bắt đầu gỡ bản sửa lỗi\",\"Failed to verify key\":\"Xác minh khóa thất bại\",\"Failed: {error}\":\"Thất bại: {error}\",\"Fetch Free API's\":\"Tải API miễn phí\",\"Fetching game name...\":\"Đang lấy tên trò chơi...\",\"Finishing…\":\"Đang hoàn tất…\",\"Fixes Menu\":\"Menu sửa lỗi\",\"Found\":\"Đã tìm thấy\",\"Game Added!\":\"Đã thêm game!\",\"Game added!\":\"Đã thêm trò chơi!\",\"Game folder\":\"Thư mục trò chơi\",\"Game install path not found\":\"Không tìm thấy đường dẫn cài đặt trò chơi\",\"Game not found on any available API.\":\"Không tìm thấy trò chơi trên bất kỳ API nào có sẵn.\",\"Generic Fix\":\"Bản sửa lỗi chung\",\"Generic fix found!\":\"Đã tìm thấy bản sửa lỗi chung!\",\"Go to Base Game\":\"Đến trò chơi gốc\",\"Hide\":\"Ẩn\",\"Included\":\"Đã bao gồm\",\"Initializing download...\":\"Đang khởi tạo tải xuống...\",\"Installing…\":\"Đang cài đặt…\",\"Invalid Morrenus API Key format\":\"Định dạng khóa API Morrenus không hợp lệ\",\"Invalid key format\":\"Định dạng khóa không hợp lệ\",\"Invalid or rejected key\":\"Khóa không hợp lệ hoặc bị từ chối\",\"Join the Discord!\":\"Tham gia Discord!\",\"Left click to install, Right click for SteamDB\":\"Nhấp chuột trái để cài đặt, nhấp chuột phải để mở SteamDB\",\"Loaded free APIs: {count}\":\"Đã tải API miễn phí: {count}\",\"Loading APIs...\":\"Đang tải API...\",\"Loading fixes...\":\"Đang tải bản sửa lỗi...\",\"Look for Fixes\":\"Tìm bản sửa lỗi\",\"LuaTools backend unavailable\":\"Backend LuaTools không khả dụng\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · Menu sửa lỗi tổng hợp\",\"LuaTools · Added Games\":\"LuaTools · Trò chơi đã thêm\",\"LuaTools · Fixes Menu\":\"LuaTools · Menu sửa lỗi\",\"LuaTools · Menu\":\"LuaTools · Menu\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"Quản lý trò chơi\",\"Missing\":\"Thiếu\",\"No games found.\":\"Không tìm thấy trò chơi nào.\",\"No generic fix\":\"Không có bản sửa lỗi chung\",\"No online-fix\":\"Không có online-fix\",\"No updates available.\":\"Không có bản cập nhật mới.\",\"No workshop for the game\":\"Không có workshop cho trò chơi\",\"Not found\":\"Không tìm thấy\",\"Online Fix\":\"Sửa lỗi trực tuyến\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"Đã tìm thấy Online-fix!\",\"Only possible thanks to {name} 💜\":\"Có được nhờ sự đóng góp của {name} 💜\",\"Proceed\":\"Tiếp tục\",\"Processing package…\":\"Đang xử lý gói…\",\"Remove via LuaTools\":\"Xóa qua LuaTools\",\"Removed {count} files. Running Steam verification...\":\"Đã xóa {count} tệp. Đang chạy xác minh Steam...\",\"Removing fix files...\":\"Đang xóa tệp sửa lỗi...\",\"Restart Steam\":\"Khởi động lại Steam\",\"Restart Steam now?\":\"Khởi động lại Steam ngay bây giờ?\",\"Searching across sources...\":\"Đang tìm kiếm trên các nguồn...\",\"Select Download Source\":\"Chọn nguồn tải xuống\",\"Settings\":\"Cài đặt\",\"Skipped\":\"Đã bỏ qua\",\"The game has been added successfully.\":\"Game đã được thêm thành công.\",\"This game may not work, support for it wont be given in our discord\":\"Trò chơi này có thể không hoạt động, hỗ trợ sẽ không được cung cấp trong discord của chúng tôi\",\"Un-Fix (verify game)\":\"Gỡ bản sửa (xác minh trò chơi)\",\"Un-Fixing game\":\"Đang gỡ bản sửa lỗi\",\"Unknown Game\":\"Trò chơi không xác định\",\"Unknown error\":\"Lỗi không xác định\",\"Usage\":\"Sử dụng\",\"Verifying API limits...\":\"Đang xác minh giới hạn API...\",\"Waiting…\":\"Đang chờ…\",\"Working…\":\"Đang xử lý…\",\"Workshop: \":\"Workshop: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"Bạn đã vượt quá giới hạn tải xuống hàng ngày. Vui lòng chờ đến ngày mai hoặc nâng cấp gói của bạn trên trang web Morrenus.\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"Khóa API Morrenus của bạn không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra khóa trong cài đặt hoặc tạo lại trên trang web Morrenus.\",\"bigpicture.mouseTip\":\"Để dùng chế độ chuột trong Steam: nút Guide + Joystick phải, nhấp bằng RB\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"Loại tùy chọn không được hỗ trợ: {type}\",\"common.status.error\":\"Lỗi\",\"common.status.loading\":\"Đang tải...\",\"common.status.success\":\"Thành công\",\"common.translationMissing\":\"thiếu bản dịch\",\"common.warning\":\"Cảnh báo\",\"days left\":\"ngày còn lại\",\"disclaimer.inputLabel\":\"nhập \\\"Tôi Hiểu\\\" vào ô bên dưới để tiếp tục\",\"disclaimer.inputPlaceholder\":\"Tôi Hiểu\",\"disclaimer.line1\":\"LuaTools không liên kết với Millennium dưới bất kỳ hình thức nào\",\"disclaimer.line2\":\"Millennium sẽ KHÔNG hỗ trợ plugin này trên Discord của họ\",\"disclaimer.line3\":\"Bạn sẽ bị CẤM trên cả hai máy chủ nếu yêu cầu hỗ trợ trên Discord của Millennium\",\"disclaimer.title\":\"Cảnh báo quan trọng\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"Có bản sửa lỗi\",\"gameStatus.playable\":\"Chơi được\",\"gameStatus.unplayable\":\"Không chơi được\",\"menu.advancedLabel\":\"Nâng cao\",\"menu.checkForUpdates\":\"Kiểm tra cập nhật\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"Lỗi khi tìm đường dẫn trò chơi\",\"menu.error.noAppId\":\"Không thể xác định AppID của trò chơi\",\"menu.error.noInstall\":\"Không tìm thấy trò chơi đã cài đặt\",\"menu.error.notInstalled\":\"Trò chơi chưa được cài đặt! Hãy thêm và cài đặt trước :D\",\"menu.fetchFreeApis\":\"Tải API miễn phí\",\"menu.fixesMenu\":\"Menu sửa lỗi\",\"menu.joinDiscordLabel\":\"Tham gia Discord!\",\"menu.manageGameLabel\":\"Quản lý trò chơi\",\"menu.remove.confirm\":\"Xóa LuaTools cho trò chơi này?\",\"menu.remove.failure\":\"Không thể xóa LuaTools.\",\"menu.remove.success\":\"Đã xóa LuaTools cho trò chơi này.\",\"menu.removeLuaTools\":\"Xóa trò chơi qua LuaTools\",\"menu.settings\":\"Cài đặt\",\"menu.title\":\"LuaTools · Menu\",\"settings.close\":\"Đóng\",\"settings.donateKeys.description\":\"Cho phép LuaTools tặng key Steam thừa.\",\"settings.donateKeys.label\":\"Tặng key\",\"settings.donateKeys.no\":\"Không\",\"settings.donateKeys.yes\":\"Có\",\"settings.empty\":\"Không có cài đặt nào.\",\"settings.error\":\"Không thể tải cài đặt.\",\"settings.fastDownload.description\":\"Tự động chọn nguồn đầu tiên có sẵn khi thêm trò chơi.\",\"settings.fastDownload.label\":\"Tải xuống nhanh\",\"settings.general\":\"Chung\",\"settings.generalDescription\":\"Tùy chọn chung của LuaTools.\",\"settings.installedFixes.date\":\"Đã cài đặt:\",\"settings.installedFixes.delete\":\"Xóa\",\"settings.installedFixes.deleteConfirm\":\"Bạn có chắc muốn xóa bản sửa lỗi này? Thao tác này sẽ xóa các tệp sửa lỗi và chạy xác minh Steam.\",\"settings.installedFixes.deleteError\":\"Không thể xóa bản sửa lỗi.\",\"settings.installedFixes.deleteSuccess\":\"Đã xóa bản sửa lỗi thành công!\",\"settings.installedFixes.deleting\":\"Đang xóa bản sửa lỗi...\",\"settings.installedFixes.empty\":\"Chưa có bản sửa lỗi nào được cài đặt.\",\"settings.installedFixes.error\":\"Không thể tải danh sách bản sửa lỗi đã cài.\",\"settings.installedFixes.files\":\"{count} tệp\",\"settings.installedFixes.loading\":\"Đang tìm bản sửa lỗi đã cài đặt...\",\"settings.installedFixes.title\":\"Bản sửa lỗi đã cài đặt\",\"settings.installedFixes.type\":\"Loại:\",\"settings.installedLua.delete\":\"Xóa\",\"settings.installedLua.deleteConfirm\":\"Xóa LuaTools cho trò chơi này?\",\"settings.installedLua.deleteError\":\"Không thể xóa qua LuaTools.\",\"settings.installedLua.deleteSuccess\":\"Đã xóa qua LuaTools thành công!\",\"settings.installedLua.deleting\":\"Đang xóa qua LuaTools...\",\"settings.installedLua.disabled\":\"Đã tắt\",\"settings.installedLua.empty\":\"Chưa có script Lua nào được cài đặt.\",\"settings.installedLua.error\":\"Không thể tải danh sách script Lua đã cài.\",\"settings.installedLua.loading\":\"Đang tìm script Lua đã cài đặt...\",\"settings.installedLua.modified\":\"Đã sửa đổi:\",\"settings.installedLua.title\":\"Trò chơi qua LuaTools\",\"settings.installedLua.unknownInfo\":\"Trò chơi hiển thị 'Trò chơi không xác định' được cài đặt từ nguồn bên ngoài (không qua LuaTools).\",\"settings.language.description\":\"Chọn ngôn ngữ hiển thị cho LuaTools.\",\"settings.language.label\":\"Ngôn ngữ\",\"settings.language.option.en\":\"Tiếng Anh\",\"settings.language.option.pt-BR\":\"Tiếng Bồ Đào Nha (Brazil)\",\"settings.loading\":\"Đang tải cài đặt...\",\"settings.noChanges\":\"Không có thay đổi nào để lưu.\",\"settings.refresh\":\"Làm mới\",\"settings.refreshing\":\"Đang làm mới...\",\"settings.save\":\"Lưu cài đặt\",\"settings.saveError\":\"Không thể lưu cài đặt.\",\"settings.saveSuccess\":\"Đã lưu cài đặt thành công.\",\"settings.saving\":\"Đang lưu...\",\"settings.search.clear\":\"Xóa tìm kiếm\",\"settings.search.noResults\":\"Không tìm thấy kết quả\",\"settings.search.placeholder\":\"Tìm cài đặt, trò chơi, bản sửa lỗi...\",\"settings.theme.description\":\"Chọn giao diện màu sắc cho LuaTools.\",\"settings.theme.label\":\"Giao diện\",\"settings.title\":\"LuaTools · Cài đặt\",\"settings.unsaved\":\"Có thay đổi chưa lưu\",\"settings.useSteamLanguage.description\":\"Sử dụng ngôn ngữ từ ứng dụng Steam thay vì cài đặt của LuaTools.\",\"settings.useSteamLanguage.label\":\"Dùng ngôn ngữ của Steam\",\"settings.useSteamLanguage.no\":\"Không\",\"settings.useSteamLanguage.yes\":\"Có\",\"{fix} applied successfully!\":\"Đã áp dụng {fix} thành công!\",\"settings.morrenusApiKey.label\":\"Khóa API Morrenus\",\"settings.morrenusApiKey.description\":\"Cần khóa API để sử dụng Sadie Source. Lấy từ {link}\",\"settings.morrenusApiKey.placeholder\":\"Nhập khóa API của bạn\"}",
    "zh-CN": "{\"Add via LuaTools\":\"通过LuaTools添加\",\"Advanced\":\"高级\",\"All-In-One Fixes\":\"一体化修复\",\"Apply\":\"应用\",\"Applying {fix}\":\"正在应用{fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"确定要取消修复吗？这将删除修复文件并验证游戏文件。\",\"Are you sure?\":\"确定吗？\",\"Back\":\"返回\",\"Base Game\":\"基础游戏\",\"Cancel\":\"取消\",\"Cancellation failed\":\"取消失败\",\"Cancelled\":\"已取消\",\"Cancelled by user\":\"用户已取消\",\"Cancelled: {reason}\":\"已取消：{reason}\",\"Cancelling...\":\"正在取消...\",\"Check for updates\":\"检查更新\",\"Checking availability…\":\"正在检查可用性…\",\"Checking content…\":\"正在检查内容…\",\"Checking generic fix...\":\"正在检查通用修复...\",\"Checking key...\":\"正在验证密钥...\",\"Checking online-fix...\":\"正在检查在线修复...\",\"Checking…\":\"检查中…\",\"Close\":\"关闭\",\"Confirm\":\"确认\",\"Content details =>\":\"内容详情 =>\",\"DLC Detected\":\"检测到DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC与基础游戏一起添加。要为此DLC添加修复，请前往基础游戏页面：<br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"关闭\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"正在下载...\",\"Downloading: {percent}%\":\"下载中：{percent}%\",\"Downloading…\":\"正在下载…\",\"Error applying fix\":\"应用修复错误\",\"Error checking for fixes\":\"检查修复错误\",\"Error starting Online Fix\":\"启动在线修复错误\",\"Error starting un-fix\":\"启动取消修复错误\",\"Error! Code: {code}\":\"错误！代码：{code}\",\"Error, Code: {code}\":\"错误，代码：{code}\",\"Error, Timed Out\":\"错误，超时\",\"Error: {error}\":\"错误: {error}\",\"Expires\":\"到期\",\"Extracting to game folder...\":\"正在解压到游戏文件夹...\",\"Failed\":\"失败\",\"Failed to cancel fix download\":\"取消修复下载失败\",\"Failed to check for fixes.\":\"检查修复失败。\",\"Failed to load free APIs.\":\"加载免费API失败。\",\"Failed to start fix download\":\"启动修复下载失败\",\"Failed to start un-fix\":\"启动取消修复失败\",\"Failed to verify key\":\"密钥验证失败\",\"Failed: {error}\":\"失败：{error}\",\"Fetch Free API's\":\"获取免费API\",\"Fetching game name...\":\"正在获取游戏名称...\",\"Finishing…\":\"正在完成…\",\"Fixes Menu\":\"修复菜单\",\"Found\":\"已找到\",\"Game Added!\":\"游戏已添加！\",\"Game added!\":\"游戏已添加！\",\"Game folder\":\"游戏文件夹\",\"Game install path not found\":\"找不到游戏安装路径\",\"Game not found on any available API.\":\"在任何可用的 API 上都找不到游戏。\",\"Generic Fix\":\"通用修复\",\"Generic fix found!\":\"找到通用修复！\",\"Go to Base Game\":\"前往基础游戏\",\"Hide\":\"隐藏\",\"Included\":\"已包含\",\"Initializing download...\":\"正在初始化下载...\",\"Installing…\":\"正在安装…\",\"Invalid Morrenus API Key format\":\"Morrenus API密钥格式无效\",\"Invalid key format\":\"密钥格式无效\",\"Invalid or rejected key\":\"无效或被拒绝的密钥\",\"Join the Discord!\":\"加入Discord！\",\"Left click to install, Right click for SteamDB\":\"左键点击安装，右键点击SteamDB\",\"Loaded free APIs: {count}\":\"已加载免费API：{count}\",\"Loading APIs...\":\"正在加载 API...\",\"Loading fixes...\":\"正在加载修复...\",\"Look for Fixes\":\"查找修复\",\"LuaTools backend unavailable\":\"LuaTools后端不可用\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · 一体化修复菜单\",\"LuaTools · Added Games\":\"LuaTools · 已添加游戏\",\"LuaTools · Fixes Menu\":\"LuaTools · 修复菜单\",\"LuaTools · Menu\":\"LuaTools · 菜单\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"管理游戏\",\"Missing\":\"缺失\",\"No games found.\":\"未找到游戏。\",\"No generic fix\":\"无通用修复\",\"No online-fix\":\"无在线修复\",\"No updates available.\":\"没有可用更新。\",\"No workshop for the game\":\"该游戏没有创意工坊\",\"Not found\":\"未找到\",\"Online Fix\":\"在线修复\",\"Online Fix (Unsteam)\":\"在线修复（非Steam）\",\"Online-fix found!\":\"找到在线修复！\",\"Only possible thanks to {name} 💜\":\"仅感谢{name} 💜\",\"Proceed\":\"继续\",\"Processing package…\":\"正在处理包…\",\"Remove via LuaTools\":\"通过LuaTools移除\",\"Removed {count} files. Running Steam verification...\":\"已删除{count}个文件。正在运行Steam验证...\",\"Removing fix files...\":\"正在删除修复文件...\",\"Restart Steam\":\"重启Steam\",\"Restart Steam now?\":\"现在重启Steam吗？\",\"Searching across sources...\":\"跨源搜索中...\",\"Select Download Source\":\"选择下载源\",\"Settings\":\"设置\",\"Skipped\":\"已跳过\",\"The game has been added successfully.\":\"游戏已成功添加。\",\"This game may not work, support for it wont be given in our discord\":\"此游戏可能无法运行，我们的 discord 将不提供支持\",\"Un-Fix (verify game)\":\"取消修复（验证游戏）\",\"Un-Fixing game\":\"正在取消修复游戏\",\"Unknown Game\":\"未知游戏\",\"Unknown error\":\"未知错误\",\"Usage\":\"用量\",\"Verifying API limits...\":\"正在验证API限制...\",\"Waiting…\":\"等待中…\",\"Working…\":\"处理中…\",\"Workshop: \":\"创意工坊: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"您已超过每日下载限制。请等到明天再使用，或在Morrenus网站上升级您的计划。\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"您的Morrenus API密钥无效或已过期。请在设置中检查您的密钥或在Morrenus网站上重新生成。\",\"bigpicture.mouseTip\":\"在Steam中使用鼠标模式：Guide键 + 右摇杆，RB点击\",\"common.alert.ok\":\"确定\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"不支持的操作类型: {type}\",\"common.status.error\":\"错误\",\"common.status.loading\":\"加载中...\",\"common.status.success\":\"成功\",\"common.translationMissing\":\"缺少翻译\",\"common.warning\":\"警告\",\"days left\":\"天剩余\",\"disclaimer.inputLabel\":\"在下面的框中输入\\\"我理解\\\"以继续\",\"disclaimer.inputPlaceholder\":\"我理解\",\"disclaimer.line1\":\"LuaTools与Millennium没有任何关联\",\"disclaimer.line2\":\"Millennium不会在其discord服务器上为您提供此插件的支持\",\"disclaimer.line3\":\"如果您去他们的discord寻求帮助，您将被LuaTools和Millennium服务器封禁\",\"disclaimer.title\":\"重要通知\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"有可用修复\",\"gameStatus.playable\":\"可玩\",\"gameStatus.unplayable\":\"不可玩\",\"menu.advancedLabel\":\"高级\",\"menu.checkForUpdates\":\"检查更新\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"获取游戏路径错误\",\"menu.error.noAppId\":\"无法确定游戏AppID\",\"menu.error.noInstall\":\"找不到游戏安装\",\"menu.error.notInstalled\":\"游戏未安装！请先添加并安装 :D\",\"menu.fetchFreeApis\":\"获取免费API\",\"menu.fixesMenu\":\"修复菜单\",\"menu.joinDiscordLabel\":\"加入Discord！\",\"menu.manageGameLabel\":\"管理游戏\",\"menu.remove.confirm\":\"确定要为该游戏通过LuaTools移除吗？\",\"menu.remove.failure\":\"移除LuaTools失败。\",\"menu.remove.success\":\"已为该应用程序移除LuaTools。\",\"menu.removeLuaTools\":\"通过LuaTools移除\",\"menu.settings\":\"设置\",\"menu.title\":\"LuaTools · 菜单\",\"settings.close\":\"关闭\",\"settings.donateKeys.description\":\"捐赠游戏解密密钥，帮助所有人！\",\"settings.donateKeys.label\":\"捐赠密钥\",\"settings.donateKeys.no\":\"否\",\"settings.donateKeys.yes\":\"是\",\"settings.empty\":\"暂无设置。\",\"settings.error\":\"加载设置失败。\",\"settings.fastDownload.description\":\"添加游戏时自动选择第一个可用源。\",\"settings.fastDownload.label\":\"快速下载\",\"settings.general\":\"通用\",\"settings.generalDescription\":\"LuaTools全局偏好设置。\",\"settings.installedFixes.date\":\"安装时间：\",\"settings.installedFixes.delete\":\"删除\",\"settings.installedFixes.deleteConfirm\":\"您确定要删除此修复吗？这将删除修复文件并运行Steam验证。\",\"settings.installedFixes.deleteError\":\"删除修复失败。\",\"settings.installedFixes.deleteSuccess\":\"修复删除成功！\",\"settings.installedFixes.deleting\":\"正在删除修复...\",\"settings.installedFixes.empty\":\"尚未安装任何修复。\",\"settings.installedFixes.error\":\"加载已安装的修复失败。\",\"settings.installedFixes.files\":\"{count} 个文件\",\"settings.installedFixes.loading\":\"正在扫描已安装的修复...\",\"settings.installedFixes.title\":\"已安装的修复\",\"settings.installedFixes.type\":\"类型：\",\"settings.installedLua.delete\":\"删除\",\"settings.installedLua.deleteConfirm\":\"是否通过LuaTools删除此游戏？\",\"settings.installedLua.deleteError\":\"通过LuaTools删除失败。\",\"settings.installedLua.deleteSuccess\":\"通过LuaTools删除成功！\",\"settings.installedLua.deleting\":\"正在通过LuaTools删除...\",\"settings.installedLua.disabled\":\"已禁用\",\"settings.installedLua.empty\":\"尚未安装任何Lua脚本。\",\"settings.installedLua.error\":\"加载已安装的Lua脚本失败。\",\"settings.installedLua.loading\":\"正在扫描已安装的Lua脚本...\",\"settings.installedLua.modified\":\"修改时间：\",\"settings.installedLua.title\":\"通过LuaTools安装的游戏\",\"settings.installedLua.unknownInfo\":\"显示'未知游戏'的游戏是从外部来源安装的（不是通过LuaTools）。\",\"settings.language.description\":\"选择LuaTools使用的语言。\",\"settings.language.label\":\"语言\",\"settings.language.option.en\":\"英语\",\"settings.language.option.pt-BR\":\"巴西葡萄牙语\",\"settings.loading\":\"正在加载设置...\",\"settings.noChanges\":\"没有要保存的更改。\",\"settings.refresh\":\"刷新\",\"settings.refreshing\":\"正在刷新...\",\"settings.save\":\"保存设置\",\"settings.saveError\":\"保存设置失败。\",\"settings.saveSuccess\":\"设置保存成功。\",\"settings.saving\":\"正在保存...\",\"settings.search.clear\":\"清除搜索\",\"settings.search.noResults\":\"未找到结果\",\"settings.search.placeholder\":\"搜索设置、游戏、修复...\",\"settings.theme.description\":\"选择 LuaTools 界面的颜色主题。\",\"settings.theme.label\":\"主题\",\"settings.title\":\"LuaTools · 设置\",\"settings.unsaved\":\"未保存的更改\",\"settings.useSteamLanguage.description\":\"使用 Steam 客户端语言而不是 LuaTools 设置的语言。\",\"settings.useSteamLanguage.label\":\"使用 Steam 语言\",\"settings.useSteamLanguage.no\":\"否\",\"settings.useSteamLanguage.yes\":\"是\",\"{fix} applied successfully!\":\"{fix}已成功应用！\",\"settings.morrenusApiKey.label\":\"Morrenus API 密钥\",\"settings.morrenusApiKey.description\":\"使用 Sadie Source 需要 API 密钥。从 {link} 获取\",\"settings.morrenusApiKey.placeholder\":\"输入您的 API 密钥\"}",
    "zh-TW": "{\"Add via LuaTools\":\"透過 LuaTools 新增\",\"Advanced\":\"進階\",\"All-In-One Fixes\":\"一鍵修復\",\"Apply\":\"套用\",\"Applying {fix}\":\"正在套用 {fix}\",\"Are you sure you want to un-fix? This will remove fix files and verify game files.\":\"確定要還原修復嗎？這將會移除修復檔案並驗證遊戲檔案。\",\"Are you sure?\":\"確定嗎？\",\"Back\":\"返回\",\"Base Game\":\"本體遊戲\",\"Cancel\":\"取消\",\"Cancellation failed\":\"取消失敗\",\"Cancelled\":\"已取消\",\"Cancelled by user\":\"已被使用者取消\",\"Cancelled: {reason}\":\"已取消：{reason}\",\"Cancelling...\":\"正在取消...\",\"Check for updates\":\"檢查更新\",\"Checking availability…\":\"正在檢查可用性…\",\"Checking content…\":\"正在檢查內容…\",\"Checking generic fix...\":\"正在檢查通用修復...\",\"Checking key...\":\"正在驗證金鑰...\",\"Checking online-fix...\":\"正在檢查 online-fix...\",\"Checking…\":\"正在檢查…\",\"Close\":\"關閉\",\"Confirm\":\"確認\",\"Content details =>\":\"內容詳情 =>\",\"DLC Detected\":\"偵測到 DLC\",\"DLCs are added together with the base game. To add fixes for this DLC, please go to the base game page: <br><br><b>{gameName}</b>\":\"DLC 會與本體遊戲一起新增。若要為此 DLC 新增修復，請前往本體遊戲頁面：<br><br><b>{gameName}</b>\",\"Discord\":\"Discord\",\"Dismiss\":\"關閉\",\"Dlc: \":\"DLC: \",\"Downloading...\":\"正在下載...\",\"Downloading: {percent}%\":\"正在下載：{percent}%\",\"Downloading…\":\"正在下載…\",\"Error applying fix\":\"套用修復時發生錯誤\",\"Error checking for fixes\":\"檢查修復時發生錯誤\",\"Error starting Online Fix\":\"啟動 Online Fix 時發生錯誤\",\"Error starting un-fix\":\"啟動還原修復時發生錯誤\",\"Error! Code: {code}\":\"錯誤！代碼：{code}\",\"Error, Code: {code}\":\"錯誤，代碼：{code}\",\"Error, Timed Out\":\"錯誤，連線逾時\",\"Error: {error}\":\"錯誤: {error}\",\"Expires\":\"到期\",\"Extracting to game folder...\":\"正在解壓縮至遊戲資料夾...\",\"Failed\":\"失敗\",\"Failed to cancel fix download\":\"無法取消修復下載\",\"Failed to check for fixes.\":\"無法檢查修復。\",\"Failed to load free APIs.\":\"無法載入免費 API。\",\"Failed to start fix download\":\"無法開始下載修復\",\"Failed to start un-fix\":\"無法開始還原修復\",\"Failed to verify key\":\"金鑰驗證失敗\",\"Failed: {error}\":\"失敗：{error}\",\"Fetch Free API's\":\"取得免費 API\",\"Fetching game name...\":\"正在取得遊戲名稱...\",\"Finishing…\":\"即將完成…\",\"Fixes Menu\":\"修復選單\",\"Found\":\"已找到\",\"Game Added!\":\"遊戲已新增！\",\"Game added!\":\"遊戲已新增！\",\"Game folder\":\"遊戲資料夾\",\"Game install path not found\":\"找不到遊戲安裝路徑\",\"Game not found on any available API.\":\"在任何可用的 API 上都找不到遊戲。\",\"Generic Fix\":\"通用修復\",\"Generic fix found!\":\"已找到通用修復！\",\"Go to Base Game\":\"前往本體遊戲\",\"Hide\":\"隱藏\",\"Included\":\"已包含\",\"Initializing download...\":\"正在初始化下載...\",\"Installing…\":\"正在安裝…\",\"Invalid Morrenus API Key format\":\"Morrenus API金鑰格式無效\",\"Invalid key format\":\"金鑰格式無效\",\"Invalid or rejected key\":\"無效或被拒絕的金鑰\",\"Join the Discord!\":\"加入 Discord！\",\"Left click to install, Right click for SteamDB\":\"左鍵安裝，右鍵開啟 SteamDB\",\"Loaded free APIs: {count}\":\"已載入免費 API：{count}\",\"Loading APIs...\":\"正在載入 API...\",\"Loading fixes...\":\"正在載入修復...\",\"Look for Fixes\":\"搜尋修復\",\"LuaTools backend unavailable\":\"LuaTools 後端無法使用\",\"LuaTools · AIO Fixes Menu\":\"LuaTools · 一鍵修復選單\",\"LuaTools · Added Games\":\"LuaTools · 已新增的遊戲\",\"LuaTools · Fixes Menu\":\"LuaTools · 修復選單\",\"LuaTools · Menu\":\"LuaTools · 選單\",\"LuaTools · {api}\":\"LuaTools · {api}\",\"Manage Game\":\"管理遊戲\",\"Missing\":\"缺少\",\"No games found.\":\"找不到任何遊戲。\",\"No generic fix\":\"沒有通用修復\",\"No online-fix\":\"沒有 online-fix\",\"No updates available.\":\"沒有可用的更新。\",\"No workshop for the game\":\"此遊戲沒有創意工坊\",\"Not found\":\"未找到\",\"Online Fix\":\"線上修復\",\"Online Fix (Unsteam)\":\"Online Fix (Unsteam)\",\"Online-fix found!\":\"已找到 Online-fix！\",\"Only possible thanks to {name} 💜\":\"感謝 {name} 才能實現 💜\",\"Proceed\":\"繼續\",\"Processing package…\":\"正在處理套件…\",\"Remove via LuaTools\":\"透過 LuaTools 移除\",\"Removed {count} files. Running Steam verification...\":\"已移除 {count} 個檔案。正在執行 Steam 驗證...\",\"Removing fix files...\":\"正在移除修復檔案...\",\"Restart Steam\":\"重新啟動 Steam\",\"Restart Steam now?\":\"現在要重新啟動 Steam 嗎？\",\"Searching across sources...\":\"跨來源搜尋中...\",\"Select Download Source\":\"選擇下載源\",\"Settings\":\"設定\",\"Skipped\":\"已略過\",\"The game has been added successfully.\":\"遊戲已成功新增。\",\"This game may not work, support for it wont be given in our discord\":\"此遊戲可能無法運行，我們的 discord 將不提供支持\",\"Un-Fix (verify game)\":\"還原修復（驗證遊戲）\",\"Un-Fixing game\":\"正在還原遊戲修復\",\"Unknown Game\":\"未知遊戲\",\"Unknown error\":\"未知錯誤\",\"Usage\":\"用量\",\"Verifying API limits...\":\"正在驗證API限制...\",\"Waiting…\":\"等待中…\",\"Working…\":\"處理中…\",\"Workshop: \":\"創意工坊: \",\"You have exceeded your daily download limit. Please wait until tomorrow for more uses, or upgrade your plan on the Morrenus website.\":\"您已超過每日下載限制。請等到明天再使用，或在Morrenus網站上升級您的方案。\",\"Your Morrenus API key is invalid or expired. Please check your key in the settings or regenerate it on the Morrenus website.\":\"您的Morrenus API金鑰無效或已過期。請在設定中檢查您的金鑰或在Morrenus網站上重新產生。\",\"bigpicture.mouseTip\":\"在 Steam 中使用滑鼠模式：Guide 鍵 + 右搖桿，按 RB 點擊\",\"common.alert.ok\":\"OK\",\"common.appName\":\"LuaTools\",\"common.error.unsupportedOption\":\"不支援的選項類型：{type}\",\"common.status.error\":\"錯誤\",\"common.status.loading\":\"載入中...\",\"common.status.success\":\"成功\",\"common.translationMissing\":\"缺少翻譯\",\"common.warning\":\"警告\",\"days left\":\"天剩餘\",\"disclaimer.inputLabel\":\"在下方輸入框中輸入「我了解」以繼續\",\"disclaimer.inputPlaceholder\":\"我了解\",\"disclaimer.line1\":\"LuaTools 與 Millennium 沒有任何關聯\",\"disclaimer.line2\":\"Millennium 不會在他們的 Discord 上為此外掛提供支援\",\"disclaimer.line3\":\"如果你在 Millennium 的 Discord 上尋求協助，你將會被兩個伺服器同時封禁\",\"disclaimer.title\":\"重要提醒\",\"gameStatus.denuvo\":\"Denuvo\",\"gameStatus.needsFixes\":\"有可用修復\",\"gameStatus.playable\":\"可遊玩\",\"gameStatus.unplayable\":\"無法遊玩\",\"menu.advancedLabel\":\"進階\",\"menu.checkForUpdates\":\"檢查更新\",\"menu.discord\":\"Discord\",\"menu.error.getPath\":\"取得遊戲路徑時發生錯誤\",\"menu.error.noAppId\":\"無法取得遊戲的 AppID\",\"menu.error.noInstall\":\"找不到已安裝的遊戲\",\"menu.error.notInstalled\":\"遊戲尚未安裝！請先新增並安裝 :D\",\"menu.fetchFreeApis\":\"取得免費 API\",\"menu.fixesMenu\":\"修復選單\",\"menu.joinDiscordLabel\":\"加入 Discord！\",\"menu.manageGameLabel\":\"管理遊戲\",\"menu.remove.confirm\":\"要移除此遊戲的 LuaTools 嗎？\",\"menu.remove.failure\":\"無法移除 LuaTools。\",\"menu.remove.success\":\"已移除此遊戲的 LuaTools。\",\"menu.removeLuaTools\":\"透過 LuaTools 移除遊戲\",\"menu.settings\":\"設定\",\"menu.title\":\"LuaTools · 選單\",\"settings.close\":\"關閉\",\"settings.donateKeys.description\":\"允許 LuaTools 捐贈多餘的 Steam 金鑰。\",\"settings.donateKeys.label\":\"捐贈金鑰\",\"settings.donateKeys.no\":\"否\",\"settings.donateKeys.yes\":\"是\",\"settings.empty\":\"沒有可用的設定。\",\"settings.error\":\"無法載入設定。\",\"settings.fastDownload.description\":\"新增遊戲時自動選擇第一個可用源。\",\"settings.fastDownload.label\":\"快速下載\",\"settings.general\":\"一般\",\"settings.generalDescription\":\"LuaTools 全域偏好設定。\",\"settings.installedFixes.date\":\"安裝時間：\",\"settings.installedFixes.delete\":\"刪除\",\"settings.installedFixes.deleteConfirm\":\"確定要移除此修復嗎？這將會刪除修復檔案並執行 Steam 驗證。\",\"settings.installedFixes.deleteError\":\"無法移除修復。\",\"settings.installedFixes.deleteSuccess\":\"已成功移除修復！\",\"settings.installedFixes.deleting\":\"正在移除修復...\",\"settings.installedFixes.empty\":\"尚未安裝任何修復。\",\"settings.installedFixes.error\":\"無法載入已安裝的修復。\",\"settings.installedFixes.files\":\"{count} 個檔案\",\"settings.installedFixes.loading\":\"正在搜尋已安裝的修復...\",\"settings.installedFixes.title\":\"已安裝的修復\",\"settings.installedFixes.type\":\"類型：\",\"settings.installedLua.delete\":\"移除\",\"settings.installedLua.deleteConfirm\":\"要移除此遊戲的 LuaTools 嗎？\",\"settings.installedLua.deleteError\":\"無法透過 LuaTools 移除。\",\"settings.installedLua.deleteSuccess\":\"已成功透過 LuaTools 移除！\",\"settings.installedLua.deleting\":\"正在透過 LuaTools 移除...\",\"settings.installedLua.disabled\":\"已停用\",\"settings.installedLua.empty\":\"尚未安裝任何 Lua 腳本。\",\"settings.installedLua.error\":\"無法載入已安裝的 Lua 腳本。\",\"settings.installedLua.loading\":\"正在搜尋已安裝的 Lua 腳本...\",\"settings.installedLua.modified\":\"修改時間：\",\"settings.installedLua.title\":\"透過 LuaTools 的遊戲\",\"settings.installedLua.unknownInfo\":\"顯示「未知遊戲」的項目是從外部來源安裝的（非透過 LuaTools）。\",\"settings.language.description\":\"選擇 LuaTools 介面使用的語言。\",\"settings.language.label\":\"語言\",\"settings.language.option.en\":\"英文\",\"settings.language.option.pt-BR\":\"巴西葡萄牙文\",\"settings.loading\":\"正在載入設定...\",\"settings.noChanges\":\"沒有需要儲存的變更。\",\"settings.refresh\":\"重新整理\",\"settings.refreshing\":\"正在重新整理...\",\"settings.save\":\"儲存設定\",\"settings.saveError\":\"無法儲存設定。\",\"settings.saveSuccess\":\"設定已成功儲存。\",\"settings.saving\":\"正在儲存...\",\"settings.search.clear\":\"清除搜尋\",\"settings.search.noResults\":\"找不到任何結果\",\"settings.search.placeholder\":\"搜尋設定、遊戲、修復...\",\"settings.theme.description\":\"選擇 LuaTools 介面的色彩主題。\",\"settings.theme.label\":\"主題\",\"settings.title\":\"LuaTools · 設定\",\"settings.unsaved\":\"有未儲存的變更\",\"settings.useSteamLanguage.description\":\"使用 Steam 用戶端的語言，而非 LuaTools 的設定。\",\"settings.useSteamLanguage.label\":\"使用 Steam 語言\",\"settings.useSteamLanguage.no\":\"否\",\"settings.useSteamLanguage.yes\":\"是\",\"{fix} applied successfully!\":\"{fix} 已成功套用！\",\"settings.morrenusApiKey.label\":\"Morrenus API 金鑰\",\"settings.morrenusApiKey.description\":\"使用 Sadie Source 需要 API 金鑰。從 {link} 取得\",\"settings.morrenusApiKey.placeholder\":\"輸入您的 API 金鑰\"}",
  };
  const LT_LOCALE_CACHE = {};
  function ltGetLocaleStrings(lang) {
    if (!lang || !LT_LOCALES[lang]) lang = "en";
    if (!LT_LOCALE_CACHE[lang]) {
      try { LT_LOCALE_CACHE[lang] = JSON.parse(LT_LOCALES[lang]); }
      catch (e) { LT_LOCALE_CACHE[lang] = {}; }
    }
    return LT_LOCALE_CACHE[lang];
  }
  function ltResolveLang(pref) {
    let l = (typeof pref === "string" && pref) ? pref : ((document.documentElement && document.documentElement.lang) || "en");
    const low = String(l).toLowerCase();
    if (low === "pt-br") return "pt-BR";
    if (low === "zh-cn") return "zh-CN";
    if (low === "zh-tw") return "zh-TW";
    if (low === "es-419") return "es";
    if (LT_LOCALES[l]) return l;
    if (LT_LOCALES[low]) return low;
    return "en";
  }

  // ============================================================
  // LuaTools GUI backend shim
  // ------------------------------------------------------------
  // The old Lua/Millennium backend is gone. The LuaTools GUI desktop app is now
  // the real backend, reached over HTTP on 127.0.0.1:20761. We declare a LOCAL
  // `Millennium` here that shadows the shared global only inside this IIFE — so
  // other Millennium plugins keep their real callServerMethod untouched — and map
  // each legacy RPC name to a fetch(). Every call site consumes the result as
  // `typeof res === "string" ? JSON.parse(res) : res`, so returning a plain object
  // (not a JSON string) is safe. See plan: the app owns everything backend-related;
  // the plugin only reflects state and triggers app actions.
  // ============================================================
  const Millennium = (function () {
    const BASE = "http://127.0.0.1:20761";
    const aid = (a) =>
      a && typeof a === "object" ? (a.appid ?? a.appId ?? a.id) : a;
    const getJson = (u) =>
      fetch(BASE + u)
        .then((r) => r.json())
        .catch(() => ({ success: false }));
    const postJson = (u, body) =>
      fetch(BASE + u, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
        .then((r) => r.json())
        .catch(() => ({ success: false }));

    // Raw fetch() to 127.0.0.1 from this HTTPS page is blocked as mixed content.
    // Route through the CDP bridge (window.Millennium, defined by the CEF injector's
    // polyfill) instead, which makes the real HTTP call from the app process itself.
    const call = (method, args) =>
      window.Millennium.callServerMethod("luatools", method, args || {}).then(
        (res) => (typeof res === "string" ? JSON.parse(res) : res),
      );

    const map = {
      // ── Real endpoints (LuaTools GUI HTTP server) ──
      HasLuaToolsForApp: (a) => call("HasLuaToolsForApp", { appid: aid(a) }),
      DeleteLuaToolsForApp: (a) => call("DeleteLuaToolsForApp", { appid: aid(a) }),
      CancelAddViaLuaTools: (a) => call("CancelAddViaLuaTools", { appid: aid(a) }),
      RestartSteam: () => call("RestartSteam", {}),
      OpenExternalUrl: (a) => postJson("/open-url", { url: a && a.url }),
      CheckForUpdatesNow: () => postJson("/check-updates"),
      ReadLoadedApps: () => call("ReadLoadedApps", {}),
      DismissLoadedApps: () => call("DismissLoadedApps", {}),
      // GetSettingsConfig is a DATA fetch the frontend runs on load — it must NOT
      // open anything (the Settings *button* opens the app via /open/settings).
      // Return a benign empty config so settings loading succeeds silently.
      GetSettingsConfig: () => {
        const lang = ltResolveLang();
        return Promise.resolve({
          success: true,
          schemaVersion: 0,
          schema: [],
          values: {},
          language: lang,
          locales: Object.keys(LT_LOCALES),
          translations: ltGetLocaleStrings(lang),
        });
      },

      // ── Client-side stubs (subsystems fully owned by the app) ──
      // Translations are embedded in this file (LT_LOCALES) — no backend needed.
      GetTranslations: (a) => {
        const lang = ltResolveLang(a && (a.language || a.lang));
        return Promise.resolve({
          success: true,
          strings: ltGetLocaleStrings(lang),
          language: lang,
          locales: Object.keys(LT_LOCALES),
        });
      },
      GetGamesDatabase: () => Promise.resolve({ success: true, database: {} }),
      GetThemes: () => Promise.resolve({ success: true, themes: [] }),
      GetIconDataUrl: () => Promise.resolve({ success: true, dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAKSWlDQ1BzUkdCIElFQzYxOTY2LTIuMQAASImdU3dYk/cWPt/3ZQ9WQtjwsZdsgQAiI6wIyBBZohCSAGGEEBJAxYWIClYUFRGcSFXEgtUKSJ2I4qAouGdBiohai1VcOO4f3Ke1fXrv7e371/u855zn/M55zw+AERImkeaiagA5UoU8Otgfj09IxMm9gAIVSOAEIBDmy8JnBcUAAPADeXh+dLA//AGvbwACAHDVLiQSx+H/g7pQJlcAIJEA4CIS5wsBkFIAyC5UyBQAyBgAsFOzZAoAlAAAbHl8QiIAqg0A7PRJPgUA2KmT3BcA2KIcqQgAjQEAmShHJAJAuwBgVYFSLALAwgCgrEAiLgTArgGAWbYyRwKAvQUAdo5YkA9AYACAmUIszAAgOAIAQx4TzQMgTAOgMNK/4KlfcIW4SAEAwMuVzZdL0jMUuJXQGnfy8ODiIeLCbLFCYRcpEGYJ5CKcl5sjE0jnA0zODAAAGvnRwf44P5Dn5uTh5mbnbO/0xaL+a/BvIj4h8d/+vIwCBAAQTs/v2l/l5dYDcMcBsHW/a6lbANpWAGjf+V0z2wmgWgrQevmLeTj8QB6eoVDIPB0cCgsL7SViob0w44s+/zPhb+CLfvb8QB7+23rwAHGaQJmtwKOD/XFhbnauUo7nywRCMW735yP+x4V//Y4p0eI0sVwsFYrxWIm4UCJNx3m5UpFEIcmV4hLpfzLxH5b9CZN3DQCshk/ATrYHtctswH7uAQKLDljSdgBAfvMtjBoLkQAQZzQyefcAAJO/+Y9AKwEAzZek4wAAvOgYXKiUF0zGCAAARKCBKrBBBwzBFKzADpzBHbzAFwJhBkRADCTAPBBCBuSAHAqhGJZBGVTAOtgEtbADGqARmuEQtMExOA3n4BJcgetwFwZgGJ7CGLyGCQRByAgTYSE6iBFijtgizggXmY4EImFINJKApCDpiBRRIsXIcqQCqUJqkV1II/ItchQ5jVxA+pDbyCAyivyKvEcxlIGyUQPUAnVAuagfGorGoHPRdDQPXYCWomvRGrQePYC2oqfRS+h1dAB9io5jgNExDmaM2WFcjIdFYIlYGibHFmPlWDVWjzVjHVg3dhUbwJ5h7wgkAouAE+wIXoQQwmyCkJBHWExYQ6gl7CO0EroIVwmDhDHCJyKTqE+0JXoS+cR4YjqxkFhGrCbuIR4hniVeJw4TX5NIJA7JkuROCiElkDJJC0lrSNtILaRTpD7SEGmcTCbrkG3J3uQIsoCsIJeRt5APkE+S+8nD5LcUOsWI4kwJoiRSpJQSSjVlP+UEpZ8yQpmgqlHNqZ7UCKqIOp9aSW2gdlAvU4epEzR1miXNmxZDy6Qto9XQmmlnafdoL+l0ugndgx5Fl9CX0mvoB+nn6YP0dwwNhg2Dx0hiKBlrGXsZpxi3GS+ZTKYF05eZyFQw1zIbmWeYD5hvVVgq9ip8FZHKEpU6lVaVfpXnqlRVc1U/1XmqC1SrVQ+rXlZ9pkZVs1DjqQnUFqvVqR1Vu6k2rs5Sd1KPUM9RX6O+X/2C+mMNsoaFRqCGSKNUY7fGGY0hFsYyZfFYQtZyVgPrLGuYTWJbsvnsTHYF+xt2L3tMU0NzqmasZpFmneZxzQEOxrHg8DnZnErOIc4NznstAy0/LbHWaq1mrX6tN9p62r7aYu1y7Rbt69rvdXCdQJ0snfU6bTr3dQm6NrpRuoW623XP6j7TY+t56Qn1yvUO6d3RR/Vt9KP1F+rv1u/RHzcwNAg2kBlsMThj8MyQY+hrmGm40fCE4agRy2i6kcRoo9FJoye4Ju6HZ+M1eBc+ZqxvHGKsNN5l3Gs8YWJpMtukxKTF5L4pzZRrmma60bTTdMzMyCzcrNisyeyOOdWca55hvtm82/yNhaVFnMVKizaLx5balnzLBZZNlvesmFY+VnlW9VbXrEnWXOss623WV2xQG1ebDJs6m8u2qK2brcR2m23fFOIUjynSKfVTbtox7PzsCuya7AbtOfZh9iX2bfbPHcwcEh3WO3Q7fHJ0dcx2bHC866ThNMOpxKnD6VdnG2ehc53zNRemS5DLEpd2lxdTbaeKp26fesuV5RruutK10/Wjm7ub3K3ZbdTdzD3Ffav7TS6bG8ldwz3vQfTw91jicczjnaebp8LzkOcvXnZeWV77vR5Ps5wmntYwbcjbxFvgvct7YDo+PWX6zukDPsY+Ap96n4e+pr4i3z2+I37Wfpl+B/ye+zv6y/2P+L/hefIW8U4FYAHBAeUBvYEagbMDawMfBJkEpQc1BY0FuwYvDD4VQgwJDVkfcpNvwBfyG/ljM9xnLJrRFcoInRVaG/owzCZMHtYRjobPCN8Qfm+m+UzpzLYIiOBHbIi4H2kZmRf5fRQpKjKqLupRtFN0cXT3LNas5Fn7Z72O8Y+pjLk722q2cnZnrGpsUmxj7Ju4gLiquIF4h/hF8ZcSdBMkCe2J5MTYxD2J43MC52yaM5zkmlSWdGOu5dyiuRfm6c7Lnnc8WTVZkHw4hZgSl7I/5YMgQlAvGE/lp25NHRPyhJuFT0W+oo2iUbG3uEo8kuadVpX2ON07fUP6aIZPRnXGMwlPUit5kRmSuSPzTVZE1t6sz9lx2S05lJyUnKNSDWmWtCvXMLcot09mKyuTDeR55m3KG5OHyvfkI/lz89sVbIVM0aO0Uq5QDhZML6greFsYW3i4SL1IWtQz32b+6vkjC4IWfL2QsFC4sLPYuHhZ8eAiv0W7FiOLUxd3LjFdUrpkeGnw0n3LaMuylv1Q4lhSVfJqedzyjlKD0qWlQyuCVzSVqZTJy26u9Fq5YxVhlWRV72qX1VtWfyoXlV+scKyorviwRrjm4ldOX9V89Xlt2treSrfK7etI66Trbqz3Wb+vSr1qQdXQhvANrRvxjeUbX21K3nShemr1js20zcrNAzVhNe1bzLas2/KhNqP2ep1/XctW/a2rt77ZJtrWv913e/MOgx0VO97vlOy8tSt4V2u9RX31btLugt2PGmIbur/mft24R3dPxZ6Pe6V7B/ZF7+tqdG9s3K+/v7IJbVI2jR5IOnDlm4Bv2pvtmne1cFoqDsJB5cEn36Z8e+NQ6KHOw9zDzd+Zf7f1COtIeSvSOr91rC2jbaA9ob3v6IyjnR1eHUe+t/9+7zHjY3XHNY9XnqCdKD3x+eSCk+OnZKeenU4/PdSZ3Hn3TPyZa11RXb1nQ8+ePxd07ky3X/fJ897nj13wvHD0Ivdi2yW3S609rj1HfnD94UivW2/rZffL7Vc8rnT0Tes70e/Tf/pqwNVz1/jXLl2feb3vxuwbt24m3Ry4Jbr1+Hb27Rd3Cu5M3F16j3iv/L7a/eoH+g/qf7T+sWXAbeD4YMBgz8NZD+8OCYee/pT/04fh0kfMR9UjRiONj50fHxsNGr3yZM6T4aeypxPPyn5W/3nrc6vn3/3i+0vPWPzY8Av5i8+/rnmp83Lvq6mvOscjxx+8znk98ab8rc7bfe+477rfx70fmSj8QP5Q89H6Y8en0E/3Pud8/vwv94Tz+y1HOM8AAAAJcEhZcwAACxMAAAsTAQCanBgAAAdLSURBVFiFxZd/bJbVFcc/93me9+37vv1hf9CfULuCEwFbWkkgi6zVABuKQzRzsmjQBHDxx0jEDdBFtmzLYoJADM5kg6CEMCuTBSzIqDHgUlJEbaFtpFCUlta+w7a00Ld96fM89zn7423pb+qyP3buH8/Nc88953vOPefce5SI8P8kC2Df3ftu/lBKYfktor1RHMfB0Q5aa7rD3dyWd1vWCw0vPKR8qhiYAdwOTDu6+Wjfrj/sqs2Iy7hoYHze7XVXKFRrSIXQaJQoeughjjh8+BBkJIDJSClV0Kf71s1ZOOcJ5VPB4Wuihcq/VCYmkrgEWKLRBFXQEeSAh/cGcOpWso1JdAeBt0RLLbCm4OcFwdEMZ94/Q+O3jST5k2KAEExMn4GxUpAqhD1A2nCrJwWglEKQYkHOKdSzkc4IOXk55N+fP4a38o1KfPjAHPonA2Ngvgo4b2IuVqjvBsDzvPuAaiBPmYqe/h4KnyrEjDNH8IXrwtRW1TLFnMKEwazAw0sLEvzIxHx8tCcMANM0MUwD0zIxTKPYsZ3jCChTEWmLECBA8TPFY2Sf3HGSCBGswOShNGB9GfDAGACW38Ln9+Hz+xKUUicQMP0m15quEb0RpfQ3pSROTRwh0I7YfPHuF6SRNrH1w2iY5R8CWYrYsCB25kopUOwFkgyfwZXaK2QtyGL5+8vHKAf4bNdntEXayAxl4uJOCmA4EAPjkKnMBbE5YFkWlmXNBFaICNGOKAnTElh5YiXRjig3rt4YI6h6XzUW1uR5NIoUCkHmO+IsdsWNbff5fRiWsQ0BBCLhCEvfXkpLZQtVv68ikBIYIyi/NJYR/0Ml3WJhxQAYlpENPAjgaY9gWpDkO5K58PcLFK4pZHT2tH/Zzl0/ugsHBx3VseP7L8nAKOqQjjkGgFLq8ZsrAwEormD32ASnjKw9Hec7+OD5D8idn0vpA6W0eC309vZiqpEpOhkJQpyKeyp2gorFg0GqTEXft3142mPaD6dx5OkjIzbuXb6XQGqAuOQ4Vn+4mjV/WoONTWu0FUOM7+wNQYgnfqESESp+XHHJjtrfs/ttbNumu6mbzAWZPPLPRyh/spzW062kz0vnm7PfoCzFc58+hxUcyv2Wz1vYuXonp2tPk0EGATOAZ3pDFXGcMBlIy5ZBAL121A7Z/TZ2v43nebTVtVH0bBGL31rMhUMXaK5uxh/0U7qpdEKryjaUcWDLAW5wAxeXFFKIj4tHe3pcAIL0DAKI2FE7fhCA67poVxM+HyajIIPZq2YzY8kM0uemT+racH2Y1kutNHzUwNE3j9IlXeT6c3FlZK0YANA7CKDHjtoJNwE4Lq520Z6m50oP7dfb6aWXDZ9uIGd+zqQgBqn5TDOvPfwaTZebyPXljihYAwAig2VkbAhLLCUDKQGy87JJIomDaw9OqKzpVBOvP/g6m0s2s/XRrXRe6iSvKI/tNdvJTM6k3WkfN0ANAE97V8e5KYewaCEtO42G2gaOrT82Zv3kX0/yyg9ewR/wM+++eYgjrJ2+lrpjdQRSA6x/ez1RoniuN2KfQl23AHwh35dOpzN1Yggxl2UlZXF4+2HuXHYn+YtilbD9Yju7frGLTYc3Ubis8Cb/ka1H2LJ0C7ujuylcUUjBtAIutl4kxUwZLjYcu47jzE/Eu3VJFRH8IT8hQrzz03foauoCoOKPFdxz/z0jlAMse2kZOd/P4eM/fwzAzEUz6aV3tNgqA6CvvW+/GRgbBqNfMJ72SE1P5VL3JWr+VgPA1earpN8xfnZMyZ9CS30LAKG0EKMfI4LsG6yEjeLJyVu6YIC0pwkRouffPQDMfXQutQdrx+U9d/wc9z55LwBX6q/Ebs8h+lqhThkA2tUg/OpWgTicEkig4UgDACW/LMHRDtse3jbcNNbNXsfUOVOZtWgW/b391JyoIZnk4WJ+DQPPcrvfRil1SpBKpdTCyQAkJibS+HUjZ/edZe4Tc3m5+mU2Fm3kxdwXSZuRRtuFNiQkvFr9KgDlvyun1W4l38pHoTAwGgX5B4ASEfbP2w8ChmFkeZ4XHqyGrhsrSI52cN2Br+fiikvX9S7EEjZWbSS7KBuA4zuPc7nxMvl351OyqgSAM4fOsHnFZhKNROKsOJQoTGXOBs7dBPBe8XvDvCcPObZT7jouWutxATjaQRDC3WH8fj+P7XiMkmdKRnjJiTqUbylnz2/3YGGR6k8lnnjqdN3qGq9m9yCfEhHKispGbPY8b6Vt2+86TqwtGw+A67kIQuf1Tq5xjdvzbmf6gukEkgNEOiLUf1LPV51fkUoqCf4EtGjSVNpLlbpy2yk91CyNeU+LJ/j8vjItOmLb9n5i3dG4pD1NYkIiQTdIuDlMQ3MDmtjNF088ub5cRAlaNMDTHt6eUZkwfm8oIiAcBmZ5eDsU6icmJg7O+LwGJAWSCEkIDw8RiX1j41/A80D9eLome9M2GxjLNXpZVKIVAy0bxsCYqN8DUKhKQX6GUDqRcoD/AIpOehvPtru5AAAAAElFTkSuQmCC" }),
      CheckForFixes: () =>
        Promise.resolve({ success: true, hasFix: false, fixes: [] }),

      // ── API subsystem: mostly app-owned. ──
      GetInitApisMessage: () => Promise.resolve({ success: true, message: "" }),
    };

    return {
      callServerMethod: function (plugin, method, args) {
        const h = map[method];
        if (h) {
          try {
            return Promise.resolve(h(args));
          } catch (e) {
            return Promise.resolve({ success: false, error: String(e) });
          }
        }
        // Unknown method → benign success so no call site rejects.
        return Promise.resolve({ success: true });
      },
    };
  })();

  // Big Picture Mode Detector - Multi-method system for maximum reliability
  function isBigPictureMode() {
    const htmlClasses = document.documentElement.className;
    const userAgent = navigator.userAgent;

    // METHOD 1: HTML Classes
    // Big Picture: 'BasicUI' + 'touch'
    // Normal Mode: 'DesktopUI' (without 'touch')
    const hasBigPictureClass = htmlClasses.includes("BasicUI");
    const hasDesktopClass = htmlClasses.includes("DesktopUI");
    const hasTouchClass = htmlClasses.includes("touch");

    // METHOD 2: User Agent
    // Big Picture: 'Valve Steam Gamepad'
    // Normal Mode: 'Valve Steam Client'
    const isGamepadUA = userAgent.includes("Valve Steam Gamepad");
    const isClientUA = userAgent.includes("Valve Steam Client");

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
      if (
        typeof Millennium !== "undefined" &&
        typeof Millennium.callServerMethod === "function"
      ) {
        Millennium.callServerMethod("luatools", "Logger.log", {
          message: String(message),
        });
      }
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[LuaTools] backendLog failed", err);
      }
    }
  }

  // Store-page button is an Add <-> Remove toggle. Mode is tracked on the element
  // via data-lt-mode so the delegated click handler knows which action to run.
  function startLuaToolsAdd(appid, anchor) {
    if (runState.inProgress && runState.appid === appid) return;
    runState.inProgress = true;
    runState.appid = appid;
    showTestPopup();
    // Raw fetch() to 127.0.0.1 is blocked as mixed content on this HTTPS store page;
    // route through the CDP bridge (window.Millennium -> CefInjectorService -> HttpClient)
    // instead, which makes the actual HTTP call from the app process, not the browser.
    window.Millennium.callServerMethod("luatools", "StartLuaToolsAdd", { appid }).catch(
      function () {},
    );

    let finished = false;
    let picking = false;
    let renderKey = "";

    const q = function (sel) {
      const o = document.querySelector(".luatools-overlay");
      return o ? o.querySelector(sel) : null;
    };

    const renderSources = function (sources, clickable) {
      const list = q(".luatools-api-list");
      if (!list) return;
      const colors = getThemeColors();
      const key =
        sources
          .map(function (s) {
            return (
              s.name +
              ":" +
              s.status +
              ":" +
              s.locked +
              ":" +
              s.downloading +
              ":" +
              (s.stats || "")
            );
          })
          .join("|") +
        ":" +
        clickable;
      if (key === renderKey) return; // avoid flicker / click-eating
      renderKey = key;
      list.innerHTML = "";
      sources.forEach(function (s) {
        const item = document.createElement("div");
        item.className = "luatools-api-item";
        item.setAttribute("data-api-name", s.name);
        item.style.cssText =
          "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:8px;background:rgba(" +
          colors.rgbString +
          ",0.1);border:1px solid " +
          colors.borderRgba +
          ";border-radius:6px;transition:all 0.15s;";
        const left = document.createElement("div");
        left.style.cssText =
          "font-size:14px;color:" +
          colors.textSecondary +
          ";font-weight:500;";
        left.textContent = s.displayName || s.name;
        const right = document.createElement("div");
        right.style.cssText =
          "font-size:13px;color:" +
          colors.textSecondary +
          ";display:flex;align-items:center;gap:8px;";
        let badge;
        if (s.downloading) badge = lt("Downloading…");
        else if (s.needsKey && s.locked) badge = lt("Needs key");
        else if (!s.available) badge = lt("Not found");
        else badge = lt("Available");
        right.textContent = badge + (s.stats ? " (" + s.stats + ")" : "");
        item.appendChild(left);
        item.appendChild(right);
        if (clickable && s.canDownload && !s.downloading) {
          item.style.cursor = "pointer";
          item.onmouseover = function () {
            item.style.borderColor = colors.accent;
          };
          item.onmouseout = function () {
            item.style.borderColor = colors.borderRgba;
          };
          item.onclick = function () {
            if (picking) return;
            picking = true;
            renderKey = "";
            const st = q(".luatools-status");
            if (st) st.textContent = lt("Starting download…");
            window.Millennium.callServerMethod("luatools", "PickLuaToolsAddSource", {
              appid,
              source: s.name,
            }).catch(function () {});
          };
        }
        list.appendChild(item);
      });
    };

    const timer = setInterval(function () {
      if (finished) {
        clearInterval(timer);
        return;
      }
      window.Millennium.callServerMethod("luatools", "GetLuaToolsAddStatus", { appid })
        .then(function (st) {
          if (typeof st === "string") st = JSON.parse(st);
          const overlay = document.querySelector(".luatools-overlay");
          if (!overlay) return;
          const statusEl = q(".luatools-status");
          const titleEl = q(".luatools-title");
          const wrap = q(".luatools-progress-wrap");
          const bar = q(".luatools-progress-bar");
          const percent = q(".luatools-percent");

          if (st.installed || st.installStatus) {
            finished = true;
            clearInterval(timer);
            runState.inProgress = false;
            runState.appid = null;
            if (titleEl) titleEl.textContent = lt("Game Added!");
            if (statusEl)
              statusEl.textContent =
                st.installStatus || lt("The game has been added successfully.");
            if (wrap) wrap.style.display = "none";
            const cancel = q(".luatools-cancel-btn");
            if (cancel) cancel.style.display = "none";
            const hide = q(".luatools-hide-btn");
            if (hide) hide.innerHTML = "<span>" + lt("Close") + "</span>";
            // Game is added → remove the store-page "Add via LuaTools" button.
            if (anchor && anchor.parentElement)
              anchor.parentElement.removeChild(anchor);
            window.__LuaToolsButtonInserted = false;
            return;
          }
          if (st.error) {
            if (statusEl)
              statusEl.textContent = lt("Failed: {error}").replace(
                "{error}",
                st.error,
              );
            if (wrap) wrap.style.display = "none";
            picking = false;
            renderKey = "";
            if (st.sources && st.sources.length)
              renderSources(st.sources, !st.fastFetch);
            return;
          }
          if (st.checking && (!st.sources || !st.sources.length)) {
            if (statusEl) statusEl.textContent = lt("Checking sources…");
            return;
          }
          const dl = (st.sources || []).filter(function (s) {
            return s.downloading;
          })[0];
          if (dl) {
            if (st.fastFetch && titleEl && !st.installed && !st.installStatus)
              titleEl.textContent = lt("Downloading…");
            if (statusEl)
              statusEl.textContent = lt("Downloading from {api}…").replace(
                "{api}",
                dl.displayName || dl.name,
              );
            if (wrap) wrap.style.display = "block";
            const pct = dl.indeterminate
              ? null
              : Math.max(0, Math.min(100, Math.floor(dl.progress)));
            if (bar) bar.style.width = (pct == null ? 100 : pct) + "%";
            if (percent) percent.textContent = pct == null ? "…" : pct + "%";
            renderSources(st.sources, false);
            return;
          }
          if (st.sourcesLoaded && st.sources && st.sources.length) {
            if (st.fastFetch) {
              if (titleEl && !st.installed && !st.installStatus)
                titleEl.textContent = lt("Downloading…");
              if (statusEl) statusEl.textContent = lt("Starting download…");
              renderSources(st.sources, false);
            } else {
              if (statusEl)
                statusEl.textContent = lt("Select a download source:");
              renderSources(st.sources, true);
            }
          }
        })
        .catch(function () {});
    }, 800);
  }

  backendLog("LuaTools script loaded");
  backendLog(
    "Mode Detection: " +
      (window.__LUATOOLS_IS_BIG_PICTURE__ ? "BIG PICTURE MODE" : "NORMAL MODE"),
  );
  // anti-spam state
  const logState = {
    missingOnce: false,
  };
  // click/run debounce state
  const runState = {
    inProgress: false,
    appid: null,
  };

  // Games Database - backend handles caching
  function fetchGamesDatabase() {
    if (
      typeof Millennium === "undefined" ||
      typeof Millennium.callServerMethod !== "function"
    ) {
      return Promise.resolve({});
    }
    return Millennium.callServerMethod("luatools", "GetGamesDatabase", {
      contentScriptQuery: "",
    })
      .then(function (res) {
        var payload = (res && (res.result || res.value)) || res;
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch (e) {}
        }
        return payload || {};
      })
      .catch(function (err) {
        console.warn("[LuaTools] Failed to fetch games database", err);
        return {};
      });
  }

  // Fixes - backend handles caching
  function fetchFixes(appid) {
    if (
      typeof Millennium === "undefined" ||
      typeof Millennium.callServerMethod !== "function"
    ) {
      return Promise.resolve(null);
    }
    return Millennium.callServerMethod("luatools", "CheckForFixes", {
      appid: appid,
      contentScriptQuery: "",
    })
      .then(function (res) {
        const payload = typeof res === "string" ? JSON.parse(res) : res;
        return payload && payload.success ? payload : null;
      })
      .catch(function (err) {
        console.warn("[LuaTools] Failed to fetch fixes", err);
        return null;
      });
  }

  const TRANSLATION_PLACEHOLDER = "translation missing";

  function applyTranslationBundle(bundle) {
    if (!bundle || typeof bundle !== "object") return;
    const stored = window.__LuaToolsI18n || {};
    if (bundle.language) {
      stored.language = String(bundle.language);
    } else if (!stored.language) {
      stored.language = "en";
    }
    if (bundle.strings && typeof bundle.strings === "object") {
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
      bgPrimary: "#1b2838",
      bgSecondary: "#2a475e",
      bgTertiary: "rgba(44, 79, 112, 0.86)",
      bgHover: "rgba(68, 112, 153, 0.86)",
      bgContainer: "rgba(40, 74, 102, 0.6)",
      accent: "#66c0f4",
      accentLight: "#a4d7f5",
      border: "rgba(102,192,244,0.3)",
      borderHover: "rgba(102,192,244,0.8)",
      text: "#fff",
      textSecondary: "#c7d5e0",
      gradient: "linear-gradient(135deg, #66c0f4 0%, #a4d7f5 100%)",
      gradientLight: "linear-gradient(135deg, #a4d7f5 0%, #7dd4ff 100%)",
      shadow: "rgba(102,192,244,0.4)",
      shadowHover: "rgba(102,192,244,0.6)",
    },
  };

  // Runtime THEMES map - start with fallback, then hydrate from themes.json/backend.
  let THEMES = DEFAULT_THEMES;
  let themesLoaded = false;

  function normalizeThemesPayload(input) {
    try {
      let payload = input;
      if (typeof payload === "string") payload = JSON.parse(payload);
      if (payload && typeof payload === "object") {
        if (Array.isArray(payload.themes)) return payload.themes;
        if (Array.isArray(payload.result)) return payload.result;
        if (payload.result && Array.isArray(payload.result.themes))
          return payload.result.themes;
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
        });
      });
      if (Object.keys(map).length === 0) return;
      // Merge into existing THEMES if themes have been loaded, otherwise start from DEFAULT_THEMES
      THEMES = Object.assign({}, themesLoaded ? THEMES : DEFAULT_THEMES, map);
      themesLoaded = true;
      try {
        ensureLuaToolsStyles();
      } catch (_) {}
    } catch (e) {
      console.warn("Failed to apply backend themes", e);
    }
  }

  function loadThemesFromFile() {
    try {
      return fetch("themes/themes.json", {
        cache: "no-store",
      })
        .then(function (res) {
          if (!res || !res.ok) return null;
          return res.json();
        })
        .then(function (json) {
          if (!json) return null;
          _applyBackendThemes(json);
          return json;
        })
        .catch(function () {
          return null;
        });
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function loadThemesFromBackend() {
    if (
      typeof Millennium === "undefined" ||
      typeof Millennium.callServerMethod !== "function"
    ) {
      return Promise.resolve(null);
    }
    return Millennium.callServerMethod("luatools", "GetThemes", {
      contentScriptQuery: "",
    })
      .then(function (res) {
        try {
          const payload = typeof res === "string" ? JSON.parse(res) : res;
          if (payload && payload.success && payload.themes) {
            _applyBackendThemes(payload.themes);
            return payload.themes;
          }
        } catch (_) {}
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function loadThemes() {
    return Promise.all([loadThemesFromFile(), loadThemesFromBackend()]).catch(
      function () {
        /* ignore */
      },
    );
  }

  // Trigger load (non-blocking). Keeps DEFAULT_THEMES as a safe fallback.
  loadThemes();

  function getCurrentThemeKey() {
    try {
      const settings = window.__LuaToolsSettings || {};
      const themeKey = (settings.values || {}).general || {};
      return themeKey.theme || "original";
    } catch (e) {
      return "original";
    }
  }

  function getCurrentTheme() {
    try {
      const themeName = getCurrentThemeKey();
      const theme = THEMES[themeName] || THEMES.original;
      if (!THEMES[themeName]) {
        try {
          backendLog(
            "LuaTools: Theme " +
              themeName +
              " not found in THEMES, using original. Available: " +
              Object.keys(THEMES).join(", "),
          );
        } catch (_) {}
      }
      return theme;
    } catch (e) {
      return THEMES.original;
    }
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16),
        ]
      : [102, 192, 244];
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
      shadowRgba: theme.shadow.replace("0.4", "0.3"),
      bgContainer: theme.bgContainer,
      bgTertiary: theme.bgTertiary,
      bgHover: theme.bgHover,
      rgbString: rgb.join(","),
    };
  }

  function generateThemeStyles(theme) {
    return `
            /* Force overlay backdrops to follow the active theme (overrides inline styles) */
            .luatools-settings-overlay,
            .luatools-overlay,
            .luatools-loadedapps-overlay {
                background: rgba(${theme.rgbString}, 0.12) !important;
                backdrop-filter: blur(8px) !important;
            }

            /* Prefer overlay-scoped select rules to override theme CSS files */
            .luatools-settings-overlay select,
            .luatools-overlay select,
            .luatools-loadedapps-overlay select {
                background-color: ${theme.bgTertiary} !important;
                color: ${theme.text} !important;
                border: 1px solid ${theme.border} !important;
                border-radius: 3px !important;
                padding: 6px 8px !important;
                font-size: 14px !important;
            }
            .luatools-settings-overlay select option,
            .luatools-overlay select option,
            .luatools-loadedapps-overlay select option {
                background-color: ${theme.bgPrimary} !important;
                color: ${theme.text} !important;
            }
            .luatools-settings-overlay select option:checked,
            .luatools-overlay select option:checked,
            .luatools-loadedapps-overlay select option:checked {
                background: ${theme.accent} !important;
                color: ${theme.text} !important;
            }
            .luatools-settings-overlay select:hover,
            .luatools-overlay select:hover,
            .luatools-loadedapps-overlay select:hover {
                border-color: ${theme.borderHover} !important;
            }
            .luatools-settings-overlay select:focus,
            .luatools-overlay select:focus,
            .luatools-loadedapps-overlay select:focus {
                outline: none !important;
                border-color: ${theme.accent} !important;
                box-shadow: 0 0 0 2px ${theme.shadow} !important;
            }
            .luatools-btn {
                padding: 12px 24px;
                background: ${theme.bgSecondary};
                border: 2px solid ${theme.border.replace("0.3", "0.5")};
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
                border-color: ${theme.borderHover.replace("0.8", "0.8")};
                color: ${theme.text};
                font-weight: 700;
                box-shadow: 0 4px 15px ${theme.shadow}, inset 0 1px 0 rgba(255,255,255,0.3);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }
            .luatools-btn.primary:hover:not([data-disabled="1"]) {
                background: ${theme.gradientLight};
                transform: translateY(-3px) scale(1.03);
                box-shadow: 0 8px 25px rgba(26, 159, 255, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.4);
            }

            /* Modern Toggle Switch */
            .luatools-toggle-container {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
            }
            .luatools-toggle-label-wrap {
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex: 1;
                margin-right: 20px;
            }
            .luatools-toggle {
                position: relative;
                display: inline-block;
                width: 50px;
                height: 26px;
                flex-shrink: 0;
            }
            .luatools-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .luatools-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.1);
                transition: .4s;
                border-radius: 34px;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .luatools-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: #ffffff;
                transition: .4s;
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }
            input:checked + .luatools-slider {
                background-color: #1a9fff;
                border-color: #1a9fff;
            }
            input:checked + .luatools-slider:before {
                transform: translateX(24px);
            }
            .luatools-slider:hover {
                border-color: #1a9fff;
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

            /* Store header button - LuaTools themed icon button */
            button.luatools-header-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                align-self: center;
                width: 36px;
                height: 36px;
                padding: 0;
                border: 2px solid ${theme.border.replace("0.3", "0.5")};
                border-radius: 4px;
                background: ${theme.bgSecondary};
                color: ${theme.text};
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 2px 8px ${theme.shadow};
                margin-left: 12px;
            }
            button.luatools-header-button:hover {
                background: ${theme.bgHover};
                transform: translateY(-1px);
                box-shadow: 0 4px 12px ${theme.shadowHover};
                border-color: ${theme.borderHover};
            }
            button.luatools-header-button:focus-visible {
                outline: 2px solid ${theme.accent};
                outline-offset: 2px;
            }
            button.luatools-header-button img,
            button.luatools-header-button svg {
                height: 16px;
                width: 16px;
            }
        `;
  }

  function ensureThemeStylesheet(themeKey) {
    const id = "luatools-theme-css";
    const href = "themes/" + themeKey + ".css";
    const link = document.getElementById(id);
    if (link) {
      const currentTheme = link.getAttribute("data-theme");
      if (currentTheme === themeKey) return;
      link.href = href;
      link.setAttribute("data-theme", themeKey);
      return;
    }
    try {
      const el = document.createElement("link");
      el.id = id;
      el.rel = "stylesheet";
      el.href = href;
      el.setAttribute("data-theme", themeKey);
      document.head.appendChild(el);
    } catch (err) {
      backendLog("LuaTools: Theme CSS injection failed: " + err);
    }
  }

  function ensureLuaToolsStyles() {
    const styleEl = document.getElementById("luatools-styles");
    const themeKey = getCurrentThemeKey();
    const theme = getCurrentTheme();
    const styles = generateThemeStyles(theme);

    try {
      ensureThemeStylesheet(themeKey);
    } catch (_) {}

    if (styleEl) {
      styleEl.textContent = styles;
    } else {
      try {
        const style = document.createElement("style");
        style.id = "luatools-styles";
        style.textContent = styles;
        document.head.appendChild(style);
      } catch (err) {
        backendLog("LuaTools: Styles injection failed: " + err);
      }
    }
  }

  function ensureFontAwesome() {
    if (document.getElementById("luatools-fontawesome")) return;
    try {
      const link = document.createElement("link");
      link.id = "luatools-fontawesome";
      link.rel = "stylesheet";
      link.href =
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
      link.integrity =
        "sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==";
      link.crossOrigin = "anonymous";
      link.referrerPolicy = "no-referrer";
      document.head.appendChild(link);
    } catch (err) {
      backendLog("LuaTools: Font Awesome injection failed: " + err);
    }
  }

  function showSettingsPopup() {
    if (
      document.querySelector(".luatools-settings-overlay") ||
      settingsMenuPending
    )
      return;
    settingsMenuPending = true;
    ensureTranslationsLoaded(false)
      .catch(function () {
        return null;
      })
      .finally(function () {
        settingsMenuPending = false;
        if (document.querySelector(".luatools-settings-overlay")) return;

        try {
          const d = document.querySelector(".luatools-overlay");
          if (d) d.remove();
        } catch (_) {}
        ensureLuaToolsStyles();
        ensureFontAwesome();

        const overlay = document.createElement("div");
        overlay.className = "luatools-settings-overlay";
        overlay.style.cssText =
          "position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:99999;display:flex;align-items:center;justify-content:center;";

        const modal = document.createElement("div");
        const colors = getThemeColors();
        modal.style.cssText = `position:relative;background:${colors.modalBg};color:${colors.text};border:1px solid ${colors.border};border-radius:16px;width:460px;padding:20px 24px;box-shadow:0 24px 80px rgba(0,0,0,.65), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.12s ease-out;`;

        const header = document.createElement("div");
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid ${colors.borderRgba};`;

        const title = document.createElement("div");
        title.style.cssText = `display:flex;align-items:center;gap:10px;font-size:22px;color:${colors.text};font-weight:600;`;
        const titleIcon = document.createElement("img");
        titleIcon.style.cssText = "width:24px;height:24px;border-radius:4px;";
        titleIcon.alt = "LuaTools";
        try {
          Millennium.callServerMethod("luatools", "GetIconDataUrl", {
            contentScriptQuery: "",
          }).then(function (res) {
            try {
              const p = typeof res === "string" ? JSON.parse(res) : res;
              titleIcon.src =
                p && p.success && p.dataUrl
                  ? p.dataUrl
                  : "LuaTools/luatools-icon.png";
            } catch (_) {
              titleIcon.src = "LuaTools/luatools-icon.png";
            }
          });
        } catch (_) {
          titleIcon.src = "LuaTools/luatools-icon.png";
        }
        titleIcon.onerror = function () {
          this.style.display = "none";
        };
        const titleText = document.createElement("span");
        titleText.textContent = t("menu.title", "LuaTools · Menu");
        title.appendChild(titleIcon);
        title.appendChild(titleText);

        const iconButtons = document.createElement("div");
        iconButtons.style.cssText = "display:flex;gap:12px;";

        function createIconButton(id, iconClass, titleKey, titleFallback) {
          const btn = document.createElement("a");
          btn.id = id;
          btn.href = "#";
          const btnColors = getThemeColors();
          btn.style.cssText = `display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:rgba(${btnColors.rgbString},0.1);border:1px solid ${btnColors.borderRgba};border-radius:10px;color:${btnColors.accent};font-size:18px;text-decoration:none;transition:all 0.3s ease;cursor:pointer;`;
          btn.innerHTML = '<i class="fa-solid ' + iconClass + '"></i>';
          btn.title = t(titleKey, titleFallback);
          btn.onmouseover = function () {
            this.style.background = `rgba(${btnColors.rgbString},0.25)`;
            this.style.transform = "translateY(-2px) scale(1.05)";
            this.style.boxShadow = `0 8px 16px ${btnColors.shadowRgba}`;
            this.style.borderColor = btnColors.accent;
          };
          btn.onmouseout = function () {
            this.style.background = `rgba(${btnColors.rgbString},0.1)`;
            this.style.transform = "translateY(0) scale(1)";
            this.style.boxShadow = "none";
            this.style.borderColor = btnColors.borderRgba;
          };
          iconButtons.appendChild(btn);
          return btn;
        }

        const body = document.createElement("div");
        body.style.cssText =
          "font-size:14px;line-height:1.6;margin-bottom:12px;";

        // Add mouse mode tip for Big Picture
        if (window.__LUATOOLS_IS_BIG_PICTURE__) {
          const tip = document.createElement("div");
          tip.style.cssText =
            "background:rgba(102,192,244,0.15);border-left:3px solid #66c0f4;padding:12px 16px;border-radius:6px;font-size:13px;color:#c7d5e0;margin-bottom:16px;line-height:1.5;";
          tip.innerHTML =
            '<i class="fa-solid fa-info-circle" style="margin-right:8px;color:#66c0f4;"></i>' +
            t(
              "bigpicture.mouseTip",
              "To use mouse mode in Steam: Guide Button + Right Joystick, click with RB",
            );
          body.appendChild(tip);
        }

        const container = document.createElement("div");
        container.style.cssText =
          "margin-top:16px;display:flex;flex-direction:column;gap:12px;align-items:stretch;";

        function createCardButton(id, key, fallback, iconClass) {
          const btn = document.createElement("a");
          btn.id = id;
          btn.href = "#";
          const btnColors = getThemeColors();
          btn.style.cssText = `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;flex:1;background:rgba(${btnColors.rgbString},0.06);border:1px solid ${btnColors.borderRgba};border-radius:12px;color:${btnColors.text};font-size:11px;font-weight:500;text-decoration:none;transition:all 0.2s ease;cursor:pointer;text-align:center;padding:14px 6px;min-width:0;`;
          const iconHtml = iconClass
            ? '<i class="fa-solid ' +
              iconClass +
              '" style="font-size:22px;color:' +
              btnColors.accent +
              ';"></i>'
            : "";
          const textSpan =
            '<span style="text-align:center;line-height:1.3;">' +
            t(key, fallback) +
            "</span>";
          btn.innerHTML = iconHtml + textSpan;
          btn.onmouseover = function () {
            const c = getThemeColors();
            this.style.background = `rgba(${c.rgbString},0.15)`;
            this.style.transform = "translateY(-2px)";
            this.style.boxShadow = `0 8px 20px ${c.shadow.replace("0.4", "0.15")}`;
            this.style.borderColor = c.accent;
          };
          btn.onmouseout = function () {
            const c = getThemeColors();
            this.style.background = `rgba(${c.rgbString},0.06)`;
            this.style.transform = "translateY(0)";
            this.style.boxShadow = "none";
            this.style.borderColor = c.borderRgba;
          };
          return btn;
        }

        const discordBtn = createIconButton(
          "lt-settings-discord",
          "fa-brands fa-discord",
          "menu.discord",
          "Discord",
        );
        const settingsManagerBtn = createIconButton(
          "lt-settings-open-manager",
          "fa-gear",
          "menu.settings",
          "Settings",
        );
        const closeBtn = createIconButton(
          "lt-settings-close",
          "fa-xmark",
          "settings.close",
          "Close",
        );

        // Check if we are on a game page
        const isGamePage = window.location.href.includes("/app/");

        const removeBtn = document.createElement("a");
        removeBtn.id = "lt-settings-remove-lua";
        removeBtn.href = "#";
        const removeBtnColors = getThemeColors();
        removeBtn.style.cssText = `display:none;align-items:center;justify-content:center;gap:8px;padding:10px 16px;background:rgba(${removeBtnColors.rgbString},0.06);border:1px solid ${removeBtnColors.borderRgba};border-radius:10px;color:${removeBtnColors.textSecondary};font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s ease;cursor:pointer;text-align:center;`;
        removeBtn.innerHTML =
          '<i class="fa-solid fa-trash-can" style="font-size:13px;"></i><span>' +
          t("menu.removeLuaTools", "Remove via LuaTools") +
          "</span>";
        removeBtn.onmouseover = function () {
          const c = getThemeColors();
          this.style.background = `rgba(${c.rgbString},0.15)`;
          this.style.borderColor = c.accent;
        };
        removeBtn.onmouseout = function () {
          const c = getThemeColors();
          this.style.background = `rgba(${c.rgbString},0.06)`;
          this.style.borderColor = c.borderRgba;
        };
        container.appendChild(removeBtn);

        // Card button grid
        const cardGrid = document.createElement("div");
        cardGrid.style.cssText =
          "display:flex;gap:10px;justify-content:center;";

        const fixesMenuBtn = createCardButton(
          "lt-settings-fixes-menu",
          "menu.fixesMenu",
          "Fixes Menu",
          "fa-wrench",
        );
        if (isGamePage) cardGrid.appendChild(fixesMenuBtn);

        const checkBtn = createCardButton(
          "lt-settings-check",
          "menu.checkForUpdates",
          "Check Updates",
          "fa-cloud-arrow-down",
        );
        cardGrid.appendChild(checkBtn);

        container.appendChild(cardGrid);

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
          checkBtn.addEventListener("click", function (e) {
            e.preventDefault();
            try {
              overlay.remove();
            } catch (_) {}
            try {
              Millennium.callServerMethod("luatools", "CheckForUpdatesNow", {
                contentScriptQuery: "",
              }).then(function (res) {
                try {
                  const payload =
                    typeof res === "string" ? JSON.parse(res) : res;
                  const msg =
                    payload && payload.message
                      ? String(payload.message)
                      : lt("No updates available.");
                  ShowLuaToolsAlert("LuaTools", msg);
                } catch (_) {}
              });
            } catch (_) {}
          });
        }

        if (discordBtn) {
          discordBtn.addEventListener("click", function (e) {
            e.preventDefault();
            try {
              overlay.remove();
            } catch (_) {}
            const url = "https://discord.gg/luatools";
            try {
              Millennium.callServerMethod("luatools", "OpenExternalUrl", {
                url,
                contentScriptQuery: "",
              });
            } catch (_) {}
          });
        }

        if (closeBtn) {
          closeBtn.addEventListener("click", function (e) {
            e.preventDefault();
            overlay.remove();
          });
        }

        if (settingsManagerBtn) {
          // Settings are managed entirely in the LuaTools app — open its Settings
          // page directly instead of rendering an in-plugin settings modal.
          settingsManagerBtn.addEventListener("click", function (e) {
            e.preventDefault();
            try {
              overlay.remove();
            } catch (_) {}
            window.Millennium.callServerMethod("luatools", "OpenSettings", {}).catch(
              function () {},
            );
          });
        }

        if (fixesMenuBtn) {
          // Fixes are managed entirely in the LuaTools app — open its Fixes page
          // for this game directly instead of the in-plugin fixes flow.
          fixesMenuBtn.addEventListener("click", function (e) {
            e.preventDefault();
            try {
              const match =
                window.location.href.match(
                  /https:\/\/store\.steampowered\.com\/app\/(\d+)/,
                ) ||
                window.location.href.match(
                  /https:\/\/steamcommunity\.com\/app\/(\d+)/,
                );
              const appid = match
                ? parseInt(match[1], 10)
                : window.__LuaToolsCurrentAppId || NaN;
              try {
                overlay.remove();
              } catch (_) {}
              if (isNaN(appid)) {
                const errText = t(
                  "menu.error.noAppId",
                  "Could not determine game AppID",
                );
                ShowLuaToolsAlert("LuaTools", errText);
                return;
              }
              window.Millennium.callServerMethod("luatools", "OpenFix", { appid }).catch(
                function () {},
              );
            } catch (err) {
              backendLog("LuaTools: Fixes Menu button error: " + err);
            }
          });
        }

        try {
          const match =
            window.location.href.match(
              /https:\/\/store\.steampowered\.com\/app\/(\d+)/,
            ) ||
            window.location.href.match(
              /https:\/\/steamcommunity\.com\/app\/(\d+)/,
            );
          const appid = match
            ? parseInt(match[1], 10)
            : window.__LuaToolsCurrentAppId || NaN;
          if (
            !isNaN(appid) &&
            typeof Millennium !== "undefined" &&
            typeof Millennium.callServerMethod === "function"
          ) {
            Millennium.callServerMethod("luatools", "HasLuaToolsForApp", {
              appid,
              contentScriptQuery: "",
            }).then(function (res) {
              try {
                const payload = typeof res === "string" ? JSON.parse(res) : res;
                const exists = !!(
                  payload &&
                  payload.success &&
                  payload.exists === true
                );
                if (exists) {
                  const doDelete = function () {
                    try {
                      Millennium.callServerMethod(
                        "luatools",
                        "DeleteLuaToolsForApp",
                        {
                          appid,
                          contentScriptQuery: "",
                        },
                      )
                        .then(function () {
                          try {
                            window.__LuaToolsButtonInserted = false;
                            window.__LuaToolsPresenceCheckInFlight = false;
                            window.__LuaToolsPresenceCheckAppId = undefined;
                            addLuaToolsButton();
                            const successText = t(
                              "menu.remove.success",
                              "LuaTools removed for this app.",
                            );
                            ShowLuaToolsAlert("LuaTools", successText);
                          } catch (err) {
                            backendLog(
                              "LuaTools: post-delete cleanup failed: " + err,
                            );
                          }
                        })
                        .catch(function (err) {
                          const failureText = t(
                            "menu.remove.failure",
                            "Failed to remove LuaTools.",
                          );
                          const errMsg =
                            err && err.message ? err.message : failureText;
                          ShowLuaToolsAlert("LuaTools", errMsg);
                        });
                    } catch (err) {
                      backendLog("LuaTools: doDelete failed: " + err);
                    }
                  };

                  removeBtn.style.display = "flex";
                  removeBtn.onclick = function (e) {
                    e.preventDefault();
                    try {
                      overlay.remove();
                    } catch (_) {}
                    const confirmMessage = t(
                      "menu.remove.confirm",
                      "Remove via LuaTools for this game?",
                    );
                    showLuaToolsConfirm(
                      "LuaTools",
                      confirmMessage,
                      function () {
                        doDelete();
                      },
                      function () {
                        try {
                          showSettingsPopup();
                        } catch (_) {}
                      },
                    );
                  };
                } else {
                  removeBtn.style.display = "none";
                }
              } catch (_) {}
            });
          }
        } catch (_) {}
      });
  }

  function ensureTranslationsLoaded(forceRefresh, preferredLanguage) {
    try {
      if (
        !forceRefresh &&
        window.__LuaToolsI18n &&
        window.__LuaToolsI18n.ready
      ) {
        return Promise.resolve(window.__LuaToolsI18n);
      }
      if (
        typeof Millennium === "undefined" ||
        typeof Millennium.callServerMethod !== "function"
      ) {
        window.__LuaToolsI18n = window.__LuaToolsI18n || {
          language: "en",
          locales: [],
          strings: {},
          ready: false,
        };
        return Promise.resolve(window.__LuaToolsI18n);
      }
      const settingsVals =
        ((window.__LuaToolsSettings || {}).values || {}).general || {};
      const useSteamLang =
        typeof settingsVals.useSteamLanguage === "boolean"
          ? settingsVals.useSteamLanguage
          : true;
      let targetLanguage =
        typeof preferredLanguage === "string" && preferredLanguage
          ? preferredLanguage
          : "";
      if (!targetLanguage) {
        let steamLang = document.documentElement.lang || "en";
        if (steamLang.toLowerCase() === "pt-br") steamLang = "pt-BR";
        if (steamLang.toLowerCase() === "zh-cn") steamLang = "zh-CN";
        if (steamLang.toLowerCase() === "zh-tw") steamLang = "zh-TW";
        if (steamLang.toLowerCase() === "es-419") steamLang = "es";
        targetLanguage = useSteamLang
          ? steamLang
          : (window.__LuaToolsI18n && window.__LuaToolsI18n.language) || "en";
      }
      return Millennium.callServerMethod("luatools", "GetTranslations", {
        language: targetLanguage,
        contentScriptQuery: "",
      })
        .then(function (res) {
          const payload = typeof res === "string" ? JSON.parse(res) : res;
          if (!payload || payload.success !== true || !payload.strings) {
            throw new Error("Invalid translation payload");
          }
          applyTranslationBundle(payload);
          // Update button text after translations are loaded
          updateButtonTranslations();
          return window.__LuaToolsI18n;
        })
        .catch(function (err) {
          backendLog("LuaTools: translation load failed: " + err);
          window.__LuaToolsI18n = window.__LuaToolsI18n || {
            language: "en",
            locales: [],
            strings: {},
            ready: false,
          };
          return window.__LuaToolsI18n;
        });
    } catch (err) {
      backendLog("LuaTools: ensureTranslationsLoaded error: " + err);
      window.__LuaToolsI18n = window.__LuaToolsI18n || {
        language: "en",
        locales: [],
        strings: {},
        ready: false,
      };
      return Promise.resolve(window.__LuaToolsI18n);
    }
  }

  function translateText(key, fallback) {
    if (!key) {
      return typeof fallback !== "undefined" ? fallback : "";
    }
    try {
      const store = window.__LuaToolsI18n;
      if (
        store &&
        store.strings &&
        Object.prototype.hasOwnProperty.call(store.strings, key)
      ) {
        const value = store.strings[key];
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed && trimmed.toLowerCase() !== TRANSLATION_PLACEHOLDER) {
            return value;
          }
        }
      }
    } catch (_) {}
    return typeof fallback !== "undefined" ? fallback : key;
  }

  function t(key, fallback) {
    return translateText(key, fallback);
  }

  function lt(text) {
    return t(text, text);
  }

  // Translations are loaded by fetchSettingsConfig() in onFrontendReady — no separate preload needed.

  function askRestartConfirmation() {
    showLuaToolsConfirm(
      "LuaTools",
      lt("Restart Steam now?"),
      function () {
        try {
          Millennium.callServerMethod("luatools", "RestartSteam", {
            contentScriptQuery: "",
          });
          // SteamClient.User.StartRestart(true) Unreliable, closes but doesn't restart (on my pc)
        } catch (_) {}
      },
      function () {
        /* Cancel - do nothing */
      },
    );
  }

  let settingsMenuPending = false;

  // Helper: show a Steam-style popup with a 10s loading bar (custom UI)
  function showTestPopup() {
    // Avoid duplicates
    if (document.querySelector(".luatools-overlay")) return;
    // Close settings popup if open so modals don't overlap
    try {
      const s = document.querySelector(".luatools-settings-overlay");
      if (s) s.remove();
    } catch (_) {}

    ensureLuaToolsStyles();
    ensureFontAwesome();
    const overlay = document.createElement("div");
    overlay.className = "luatools-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:99999;display:flex;align-items:center;justify-content:center;";

    const modal = document.createElement("div");
    const colors = getThemeColors();
    modal.style.cssText = `background:${colors.modalBg};color:${colors.text};border:1px solid ${colors.border};border-radius:16px;width:520px;padding:28px 32px;box-shadow:0 24px 80px rgba(0,0,0,.65), 0 0 0 1px ${colors.shadowRgba};animation:slideUp 0.12s ease-out;`;

    const title = document.createElement("div");
    const titleColors = getThemeColors();
    title.style.cssText = `display:flex;align-items:center;gap:10px;font-size:20px;color:${titleColors.text};margin-bottom:16px;font-weight:600;`;
    title.className = "luatools-title";
    const dlTitleIcon = document.createElement("i");
    dlTitleIcon.className = "fa-solid fa-cloud-arrow-down";
    dlTitleIcon.style.cssText = `color:${titleColors.accent};font-size:20px;`;
    title.appendChild(dlTitleIcon);
    const dlTitleText = document.createElement("span");
    dlTitleText.textContent = lt("Select Download Source");
    title.appendChild(dlTitleText);

    // API list container
    const apiListContainer = document.createElement("div");
    apiListContainer.className = "luatools-api-list";
    apiListContainer.style.cssText = "margin-bottom:16px;";

    // Placeholder while loading APIs
    const loadingItem = document.createElement("div");
    loadingItem.style.cssText = `text-align:center;padding:10px;color:${colors.textSecondary};font-size:13px;`;
    loadingItem.textContent = lt("Loading APIs...");
    apiListContainer.appendChild(loadingItem);

    // NOTE: the source list is populated/updated by startLuaToolsAdd() from the
    // app's live DownloadViewModel state (/add-status). We intentionally do NOT
    // pre-fill it here — doing so raced with (and clobbered) the clickable rows.

    const body = document.createElement("div");
    body.style.cssText = `display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;line-height:1.4;margin-bottom:12px;color:${colors.textSecondary};`;
    body.className = "luatools-status";
    body.innerHTML =
      '<i class="fa-solid fa-spinner" style="font-size:14px;animation: spin 1.5s linear infinite;"></i><span>' +
      lt("Checking availability…") +
      "</span>";

    const progressWrap = document.createElement("div");
    progressWrap.style.cssText = `background:rgba(0,0,0,0.3);height:20px;border-radius:4px;overflow:hidden;position:relative;display:none;border:1px solid ${colors.border};margin-top:12px;`;
    progressWrap.className = "luatools-progress-wrap";
    const progressBar = document.createElement("div");
    progressBar.style.cssText = `height:100%;width:0%;background:${colors.gradient};transition:width 0.3s ease;box-shadow:0 0 10px ${colors.shadow};`;
    progressBar.className = "luatools-progress-bar";
    progressWrap.appendChild(progressBar);

    const progressInfo = document.createElement("div");
    progressInfo.style.cssText = `display:none;margin-top:8px;font-size:12px;color:${colors.textSecondary};`;
    progressInfo.className = "luatools-progress-info";

    const percent = document.createElement("span");
    percent.className = "luatools-percent";
    percent.textContent = "0%";

    progressInfo.appendChild(percent);

    const btnRow = document.createElement("div");
    btnRow.style.cssText =
      "margin-top:20px;display:flex;gap:8px;justify-content:center;";
    const cancelBtn = document.createElement("a");
    cancelBtn.className = "luatools-btn luatools-cancel-btn";
    cancelBtn.style.cssText =
      "display:none;align-items:center;justify-content:center;text-align:center;";
    cancelBtn.innerHTML = `<span>${lt("Cancel")}</span>`;
    cancelBtn.href = "#";
    cancelBtn.onclick = function (e) {
      e.preventDefault();
      cancelOperation();
    };
    const hideBtn = document.createElement("a");
    hideBtn.className = "luatools-btn luatools-hide-btn";
    hideBtn.style.cssText =
      "display:flex;align-items:center;justify-content:center;text-align:center;";
    hideBtn.innerHTML = `<span>${lt("Hide")}</span>`;
    hideBtn.href = "#";
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
        const match =
          window.location.href.match(
            /https:\/\/store\.steampowered\.com\/app\/(\d+)/,
          ) ||
          window.location.href.match(
            /https:\/\/steamcommunity\.com\/app\/(\d+)/,
          );
        const appid = match
          ? parseInt(match[1], 10)
          : window.__LuaToolsCurrentAppId || NaN;
        if (
          !isNaN(appid) &&
          typeof Millennium !== "undefined" &&
          typeof Millennium.callServerMethod === "function"
        ) {
          Millennium.callServerMethod("luatools", "CancelAddViaLuaTools", {
            appid,
            contentScriptQuery: "",
          });
        }
      } catch (_) {}
      // Update UI to show cancelled
      const status = overlay.querySelector(".luatools-status");
      if (status) status.textContent = lt("Cancelled");
      const cancelBtn = overlay.querySelector(".luatools-cancel-btn");
      if (cancelBtn) cancelBtn.style.display = "none";
      const hideBtn = overlay.querySelector(".luatools-hide-btn");
      if (hideBtn) hideBtn.innerHTML = `<span>${lt("Close")}</span>`;
      // Hide progress UI
      const wrap = overlay.querySelector(".luatools-progress-wrap");
      const progressInfo = overlay.querySelector(".luatools-progress-info");
      if (wrap) wrap.style.display = "none";
      if (progressInfo) progressInfo.style.display = "none";
      // Reset run state
      runState.inProgress = false;
      runState.appid = null;
    }
  }

  // Fixes Results popup
  function fetchSettingsConfig(forceRefresh) {
    try {
      if (
        !forceRefresh &&
        window.__LuaToolsSettings &&
        Array.isArray(window.__LuaToolsSettings.schema)
      ) {
        return Promise.resolve(window.__LuaToolsSettings);
      }
    } catch (_) {}

    if (
      typeof Millennium === "undefined" ||
      typeof Millennium.callServerMethod !== "function"
    ) {
      return Promise.reject(new Error(lt("LuaTools backend unavailable")));
    }

    return Millennium.callServerMethod("luatools", "GetSettingsConfig", {
      contentScriptQuery: "",
    }).then(function (res) {
      const payload = typeof res === "string" ? JSON.parse(res) : res;
      if (!payload || payload.success !== true) {
        const errorMsg =
          payload && payload.error
            ? String(payload.error)
            : t("settings.error", "Failed to load settings.");
        throw new Error(errorMsg);
      }
      const config = {
        schemaVersion: payload.schemaVersion || 0,
        schema: Array.isArray(payload.schema) ? payload.schema : [],
        values:
          payload && payload.values && typeof payload.values === "object"
            ? payload.values
            : {},
        language: payload && payload.language ? String(payload.language) : "en",
        locales: Array.isArray(payload && payload.locales)
          ? payload.locales
          : [],
        translations:
          payload &&
          payload.translations &&
          typeof payload.translations === "object"
            ? payload.translations
            : {},
        lastFetched: Date.now(),
      };
      applyTranslationBundle({
        language: config.language,
        locales: config.locales,
        strings: config.translations,
      });
      window.__LuaToolsSettings = config;
      return config;
    });
  }

  function closeSettingsOverlay() {
    try {
      // Remove all settings overlays (robust against older NodeList forEach support)
      var list = document.getElementsByClassName("luatools-settings-overlay");
      while (list && list.length > 0) {
        try {
          list[0].remove();
        } catch (_) {
          break;
        }
      }
      // Also remove any download/progress overlays if present
      var list2 = document.getElementsByClassName("luatools-overlay");
      while (list2 && list2.length > 0) {
        try {
          list2[0].remove();
        } catch (_) {
          break;
        }
      }
    } catch (_) {}
  }

  // Custom modern alert dialog
  function showLuaToolsAlert(title, message, onClose) {
    if (document.querySelector(".luatools-alert-overlay")) return;

    ensureLuaToolsStyles();
    ensureFontAwesome();
    const overlay = document.createElement("div");
    overlay.className = "luatools-alert-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:100001;display:flex;align-items:center;justify-content:center;";

    const modal = document.createElement("div");
    const alertModalColors = getThemeColors();
    modal.style.cssText = `background:${alertModalColors.modalBg};color:${alertModalColors.text};border:1px solid ${alertModalColors.border};border-radius:16px;width:420px;padding:28px 32px;box-shadow:0 24px 80px rgba(0,0,0,.65), 0 0 0 1px ${alertModalColors.shadowRgba};animation:slideUp 0.12s ease-out;`;

    const alertIconWrap = document.createElement("div");
    alertIconWrap.style.cssText = "text-align:center;margin-bottom:12px;";
    const alertIcon = document.createElement("i");
    alertIcon.className = "fa-solid fa-circle-info";
    alertIcon.style.cssText = `color:${alertModalColors.accent};font-size:32px;`;
    alertIconWrap.appendChild(alertIcon);

    const titleEl = document.createElement("div");
    titleEl.style.cssText = `font-size:20px;color:${alertModalColors.text};margin-bottom:12px;font-weight:600;text-align:center;`;
    titleEl.textContent = String(title || "LuaTools");

    const messageEl = document.createElement("div");
    messageEl.style.cssText = `font-size:14px;line-height:1.6;margin-bottom:24px;color:${alertModalColors.textSecondary};text-align:center;`;
    messageEl.textContent = String(message || "");

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;justify-content:center;";

    const okBtn = document.createElement("a");
    okBtn.href = "#";
    okBtn.className = "luatools-btn primary";
    okBtn.style.cssText =
      "min-width:140px;display:flex;align-items:center;justify-content:center;text-align:center;";
    okBtn.innerHTML = `<span>${lt("Close")}</span>`;
    okBtn.onclick = function (e) {
      e.preventDefault();
      overlay.remove();
      try {
        onClose && onClose();
      } catch (_) {}
    };

    btnRow.appendChild(okBtn);

    modal.appendChild(alertIconWrap);
    modal.appendChild(titleEl);
    modal.appendChild(messageEl);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        overlay.remove();
        try {
          onClose && onClose();
        } catch (_) {}
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
      backendLog("LuaTools: Alert error, falling back: " + err);
      try {
        alert(String(title) + "\n\n" + String(message));
      } catch (_) {}
    }
  }

  // Custom modal confirm dialog, styled to match Steam
  function showLuaToolsConfirm(title, message, onConfirm, onCancel) {
    // Always close settings popup first so the confirm is visible on top
    closeSettingsOverlay();

    // Create custom modern confirmation dialog
    if (document.querySelector(".luatools-confirm-overlay")) return;

    ensureLuaToolsStyles();
    ensureFontAwesome();
    const overlay = document.createElement("div");
    overlay.className = "luatools-confirm-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:100001;display:flex;align-items:center;justify-content:center;";

    const modal = document.createElement("div");
    const confirmColors = getThemeColors();
    modal.style.cssText = `background:${confirmColors.modalBg};color:${confirmColors.text};border:1px solid ${confirmColors.border};border-radius:16px;width:420px;padding:28px 32px;box-shadow:0 24px 80px rgba(0,0,0,.65), 0 0 0 1px ${confirmColors.shadowRgba};animation:slideUp 0.12s ease-out;`;

    const confirmIconWrap = document.createElement("div");
    confirmIconWrap.style.cssText = "text-align:center;margin-bottom:12px;";
    const confirmIcon = document.createElement("i");
    confirmIcon.className = "fa-solid fa-circle-question";
    confirmIcon.style.cssText = `color:${confirmColors.accent};font-size:32px;`;
    confirmIconWrap.appendChild(confirmIcon);

    const titleEl = document.createElement("div");
    titleEl.style.cssText = `font-size:20px;color:${confirmColors.text};margin-bottom:12px;font-weight:600;text-align:center;`;
    titleEl.textContent = String(title || "LuaTools");

    const messageEl = document.createElement("div");
    messageEl.style.cssText = `font-size:14px;line-height:1.6;margin-bottom:24px;color:${confirmColors.textSecondary};text-align:center;`;
    messageEl.textContent = String(message || lt("Are you sure?"));

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:12px;justify-content:center;";

    const cancelBtn = document.createElement("a");
    cancelBtn.href = "#";
    cancelBtn.className = "luatools-btn";
    cancelBtn.style.cssText =
      "flex:1;display:flex;align-items:center;justify-content:center;text-align:center;";
    cancelBtn.innerHTML = `<span>${lt("Cancel")}</span>`;
    cancelBtn.onclick = function (e) {
      e.preventDefault();
      overlay.remove();
      try {
        onCancel && onCancel();
      } catch (_) {}
    };
    const confirmBtn = document.createElement("a");
    confirmBtn.href = "#";
    confirmBtn.className = "luatools-btn primary";
    confirmBtn.style.cssText =
      "flex:1;display:flex;align-items:center;justify-content:center;text-align:center;";
    confirmBtn.innerHTML = `<span>${lt("Confirm")}</span>`;
    confirmBtn.onclick = function (e) {
      e.preventDefault();
      overlay.remove();
      try {
        onConfirm && onConfirm();
      } catch (_) {}
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    modal.appendChild(confirmIconWrap);
    modal.appendChild(titleEl);
    modal.appendChild(messageEl);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        overlay.remove();
        try {
          onCancel && onCancel();
        } catch (_) {}
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
  function showMillenniumDisclaimerModal() {
    if (document.querySelector(".luatools-disclaimer-overlay")) return;

    ensureLuaToolsStyles();
    ensureFontAwesome();

    const overlay = document.createElement("div");
    overlay.className = "luatools-disclaimer-overlay luatools-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);z-index:100005;display:flex;align-items:center;justify-content:center;";

    const modal = document.createElement("div");
    const disclaimerColors = getThemeColors();
    modal.style.cssText = `background:${disclaimerColors.modalBg};color:${disclaimerColors.text};border:1px solid ${disclaimerColors.border};border-radius:16px;width:460px;padding:28px 32px;box-shadow:0 24px 80px rgba(0,0,0,.65), 0 0 0 1px ${disclaimerColors.shadowRgba};animation:slideUp 0.12s ease-out;`;

    const iconContainer = document.createElement("div");
    iconContainer.style.cssText = "text-align:center;margin-bottom:16px;";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-triangle-exclamation";
    icon.style.cssText = `color:#FFD54F;font-size:32px;`;
    iconContainer.appendChild(icon);

    const titleEl = document.createElement("div");
    titleEl.style.cssText = `font-size:20px;font-weight:600;text-align:center;margin-bottom:16px;color:#FFD54F;`;
    titleEl.textContent = t("disclaimer.title", "Quick Note");

    const messageEl = document.createElement("div");
    messageEl.style.cssText = `font-size:13px;line-height:1.6;margin-bottom:20px;color:${disclaimerColors.textSecondary};text-align:center;`;

    const line1 = document.createElement("div");
    line1.style.cssText = `margin-bottom:8px;font-weight:500;color:${disclaimerColors.text};font-size:14px;`;
    line1.textContent = t(
      "disclaimer.line1",
      "LuaTools is not affiliated with Millennium",
    );

    const line2 = document.createElement("div");
    line2.style.cssText = "margin-bottom:8px;";
    line2.textContent = t(
      "disclaimer.line2",
      "Millennium will not offer support for this plugin on their server",
    );

    const line3 = document.createElement("div");
    line3.style.cssText = `font-weight:500;color:#FFD54F;font-size:13px;`;
    line3.textContent = t(
      "disclaimer.line3",
      "Please use our Discord for any questions — asking in Millennium servers may result in a ban",
    );

    messageEl.appendChild(line1);
    messageEl.appendChild(line2);
    messageEl.appendChild(line3);

    const inputGroup = document.createElement("div");
    inputGroup.style.cssText = "margin-bottom:16px;";

    const inputLabel = document.createElement("div");
    inputLabel.style.cssText = `font-size:11px;color:${disclaimerColors.textSecondary};margin-bottom:8px;text-align:center;text-transform:uppercase;letter-spacing:1px;`;
    inputLabel.textContent = t(
      "disclaimer.inputLabel",
      'type "I Understand" in the box bellow to continue',
    );

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = t("disclaimer.inputPlaceholder", "I Understand");
    input.style.cssText = `width:100%;box-sizing:border-box;background:${disclaimerColors.bgTertiary};border:1px solid ${disclaimerColors.borderRgba};border-radius:10px;padding:10px 14px;color:${disclaimerColors.text};font-size:14px;outline:none;text-align:center;transition:all 0.2s ease;`;
    input.onfocus = function () {
      this.style.borderColor = disclaimerColors.accent;
      this.style.boxShadow = `0 0 0 2px rgba(${disclaimerColors.rgbString},0.2)`;
    };
    input.onblur = function () {
      this.style.borderColor = disclaimerColors.borderRgba;
      this.style.boxShadow = "none";
    };

    inputGroup.appendChild(inputLabel);
    inputGroup.appendChild(input);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;justify-content:center;";

    const confirmBtn = document.createElement("a");
    confirmBtn.href = "#";
    confirmBtn.className = "luatools-btn primary";
    confirmBtn.style.minWidth = "160px";
    confirmBtn.style.justifyContent = "center";
    confirmBtn.style.textAlign = "center";
    confirmBtn.style.display = "flex";
    confirmBtn.innerHTML = `<span>${lt("Confirm")}</span>`;
    confirmBtn.style.opacity = "0.5";
    confirmBtn.style.pointerEvents = "none";

    var expectedPhrase = t("disclaimer.inputPlaceholder", "I Understand")
      .trim()
      .toLowerCase();
    input.oninput = function () {
      if (this.value.trim().toLowerCase() === expectedPhrase) {
        confirmBtn.style.opacity = "1";
        confirmBtn.style.pointerEvents = "auto";
        confirmBtn.style.boxShadow = `0 4px 12px ${disclaimerColors.shadow}`;
      } else {
        confirmBtn.style.opacity = "0.5";
        confirmBtn.style.pointerEvents = "none";
        confirmBtn.style.boxShadow = "none";
      }
    };

    confirmBtn.onclick = function (e) {
      e.preventDefault();
      if (input.value.trim().toLowerCase() === expectedPhrase) {
        localStorage.setItem("luatools millennium disclaimer accepted", "1");
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
    if (!document.getElementById("luatools-spacing-styles")) {
      const style = document.createElement("style");
      style.id = "luatools-spacing-styles";
      style.textContent = `
                .luatools-restart-button { margin-left: 6px !important; margin-right: 6px !important; }
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
            `;
      document.head.appendChild(style); // This is now separate from the main style block
    }
  }

  // Function to update button text with current translations
  function updateButtonTranslations() {
    try {
      // Update Restart Steam button
      const restartBtn = document.querySelector(".luatools-restart-button");
      if (restartBtn) {
        const restartText = lt("Restart Steam");
        restartBtn.title = restartText;
        restartBtn.setAttribute("data-tooltip-text", restartText);
        const rspan = restartBtn.querySelector("span");
        if (rspan) {
          rspan.textContent = restartText;
        }
      }

      // Update Add via LuaTools button
      const luatoolsBtn = document.querySelector(".luatools-button");
      if (luatoolsBtn) {
        const label = lt("Add via LuaTools");
        luatoolsBtn.title = label;
        luatoolsBtn.setAttribute("data-tooltip-text", label);
        const span = luatoolsBtn.querySelector("span");
        if (span) {
          span.textContent = label;
        }
      }
    } catch (err) {
      backendLog("LuaTools: updateButtonTranslations error: " + err);
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

    // Store Header Button Logic (always visible)
    const headerContainer = document.querySelector("._1wn1lBlAzl3HMRqS1llwie");
    if (
      headerContainer &&
      !document.querySelector(".luatools-header-button") &&
      !window.__LuaToolsHeaderInserted
    ) {
      ensureLuaToolsStyles();
      const headerBtn = document.createElement("button");
      headerBtn.type = "button";
      headerBtn.className = "luatools-header-button Focusable";
      headerBtn.tabIndex = "0";
      headerBtn.title = "LuaTools Settings";
      headerBtn.setAttribute("data-tooltip-text", "LuaTools Settings");

      const img = document.createElement("img");
      img.style.height = "18px";
      img.style.width = "18px";
      img.style.verticalAlign = "middle";

      img.onerror = function () {
        // cogwheel fallback
        headerBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="LuaTools"><path fill="currentColor" d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.94 3.06l-2.12-.35a7.962 7.962 0 00-1.02-2.46l1.29-1.72a.75.75 0 00-.09-.97l-1.41-1.41a.75.75 0 00-.97-.09l-1.72 1.29c-.77-.44-1.6-.78-2.46-1.02L13.06 2.06A.75.75 0 0012.31 2h-1.62a.75.75 0 00-.75.65l-.35 2.12a7.962 7.962 0 00-2.46 1.02L5 4.6a.75.75 0 00-.97.09L2.62 6.1a.75.75 0 00-.09.97l1.29 1.72c-.44.77-.78 1.6-1.02 2.46l-2.12.35a.75.75 0 00-.65.75v1.62c0 .37.27.69.63.75l2.14.36c.24.86.58 1.69 1.02 2.46L2.53 18a.75.75 0 00.09.97l1.41 1.41c.26.26.67.29.97.09l1.72-1.29c.77.44 1.6.78 2.46 1.02l.35 2.12c.06.36.38.63.75.63h1.62c.37 0 .69-.27.75-.63l.36-2.14c.86-.24 1.69-.58 2.46-1.02l1.72 1.29c.3.2.71.17.97-.09l1.41-1.41c.26-.26.29-.67.09-.97l-1.29-1.72c.44-.77.78-1.6 1.02-2.46l2.12-.35c.36-.06.63-.38.63-.75v-1.62a.75.75 0 00-.65-.75z"/></svg>';
      };

      img.src = "LuaTools/luatools-icon.png";

      Millennium.callServerMethod("luatools", "GetIconDataUrl", {})
        .then(function (res) {
          const payload = typeof res === "string" ? JSON.parse(res) : res;
          if (payload && payload.success && payload.dataUrl) {
            img.src = payload.dataUrl;
          }
        })
        .catch(function () {});

      headerBtn.appendChild(img);

      headerBtn.onclick = function (e) {
        e.preventDefault();
        showSettingsPopup();
      };

      headerContainer.appendChild(headerBtn);
      window.__LuaToolsHeaderInserted = true;
      backendLog("Inserted store header button");
    }

    // Check if we're in Big Picture mode
    const isBigPicture = window.__LUATOOLS_IS_BIG_PICTURE__;

    // Look for the appropriate container based on mode
    let targetContainer;
    if (isBigPicture) {
      // In Big Picture mode, use the queue button's parent as reference
      const queueBtn = document.querySelector("#queueBtnFollow");
      targetContainer = queueBtn ? queueBtn.parentElement : null;
    } else {
      // In normal mode, use the SteamDB buttons container
      targetContainer =
        document.querySelector(".steamdb-buttons") ||
        document.querySelector("[data-steamdb-buttons]") ||
        document.querySelector(".apphub_OtherSiteInfo");
    }

    if (targetContainer) {
      const steamdbContainer = targetContainer;

      // Keep our buttons in a deterministic spot. This row is filled asynchronously — Steam
      // injects the external-site links and Community Hub AFTER page load (and the SteamDB
      // extension its icon), which used to leave our buttons wherever they first landed,
      // different on every load. Pin [Restart][Add] as the last two children, and keep them
      // pinned with a MutationObserver so late insertions don't shuffle them — the bounded
      // ~7s insertion poll stops firing after the page is "ready", but Steam's link injection
      // can happen after that, so a one-shot re-assert isn't enough. ltPinButtons only moves
      // when actually out of order, so the observer converges (our own move → re-check →
      // already ordered → no move) instead of looping.
      const ltPinButtons = function (c) {
        try {
          const rb = c.querySelector(".luatools-restart-button");
          const ab = c.querySelector(".luatools-button");
          if (rb && ab) {
            if (rb.nextElementSibling !== ab || c.lastElementChild !== ab) {
              c.appendChild(rb);
              c.appendChild(ab);
            }
          } else if (rb && c.lastElementChild !== rb) {
            c.appendChild(rb);
          }
        } catch (_) {}
      };
      ltPinButtons(steamdbContainer);
      if (window.__LuaToolsOrderObservedEl !== steamdbContainer) {
        try {
          if (window.__LuaToolsOrderObserver) window.__LuaToolsOrderObserver.disconnect();
          const obs = new MutationObserver(function () { ltPinButtons(steamdbContainer); });
          obs.observe(steamdbContainer, { childList: true });
          window.__LuaToolsOrderObserver = obs;
          window.__LuaToolsOrderObservedEl = steamdbContainer;
        } catch (_) {}
      }

      // Insert a Restart Steam button between Community Hub and our LuaTools button
      try {
        if (
          !document.querySelector(".luatools-restart-button") &&
          !window.__LuaToolsRestartInserted
        ) {
          ensureStyles();
          // In Big Picture mode, use queue button as reference; otherwise use first link in container
          const referenceBtn = isBigPicture
            ? document.querySelector("#queueBtnFollow")
            : steamdbContainer.querySelector("a");

          // Use same custom button for both modes
          const restartBtn = document.createElement("a");
          if (referenceBtn && referenceBtn.className) {
            restartBtn.className =
              referenceBtn.className + " luatools-restart-button";
          } else {
            restartBtn.className =
              "btnv6_blue_hoverfade btn_medium luatools-restart-button";
          }
          restartBtn.href = "#";
          const restartText = lt("Restart Steam");
          restartBtn.title = restartText;
          restartBtn.setAttribute("data-tooltip-text", restartText);
          const rspan = document.createElement("span");
          rspan.textContent = restartText;
          restartBtn.appendChild(rspan);

          // Normalize margins to match native buttons
          try {
            if (referenceBtn) {
              const cs = window.getComputedStyle(referenceBtn);
              restartBtn.style.marginLeft = cs.marginLeft;
              restartBtn.style.marginRight = cs.marginRight;
            }
          } catch (_) {}

          restartBtn.addEventListener("click", function (e) {
            e.preventDefault();
            try {
              // Ensure any settings overlays are closed before confirm
              closeSettingsOverlay();
              askRestartConfirmation();
            } catch (_) {
              askRestartConfirmation();
            }
          });

          // Append to the end of the row (the re-assert block above keeps it pinned there)
          // instead of after whatever link happens to be first at this instant.
          steamdbContainer.appendChild(restartBtn);
          window.__LuaToolsRestartInserted = true;
          backendLog("Inserted Restart Steam button");
        }
      } catch (_) {}

      // Status Pills Logic
      // Always update translations for existing buttons (even if not a page change)
      const existingBtn = document.querySelector(".luatools-button");
      if (existingBtn) {
        ensureTranslationsLoaded(false).then(function () {
          updateButtonTranslations();
        });
      }

      // Check if button already exists to avoid duplicates
      if (!existingBtn && !window.__LuaToolsButtonInserted) {
        // Create the LuaTools button modeled after existing SteamDB/PCGW buttons
        // In Big Picture mode, use queue button as reference; otherwise use first link in container
        let referenceBtn = isBigPicture
          ? document.querySelector("#queueBtnFollow")
          : steamdbContainer.querySelector("a");

        // Use same custom button for both modes
        const luatoolsButton = document.createElement("a");
        luatoolsButton.href = "#";
        // Copy classes from an existing button to match look-and-feel, but set our own label
        if (referenceBtn && referenceBtn.className) {
          luatoolsButton.className =
            referenceBtn.className + " luatools-button";
        } else {
          luatoolsButton.className =
            "btnv6_blue_hoverfade btn_medium luatools-button";
        }
        const span = document.createElement("span");
        const addViaText = lt("Add via LuaTools");
        span.textContent = addViaText;
        luatoolsButton.appendChild(span);
        // Tooltip/title
        luatoolsButton.title = addViaText;
        luatoolsButton.setAttribute("data-tooltip-text", addViaText);

        // Normalize margins to match native buttons
        try {
          if (referenceBtn) {
            const cs = window.getComputedStyle(referenceBtn);
            luatoolsButton.style.marginLeft = cs.marginLeft;
            luatoolsButton.style.marginRight = cs.marginRight;
          }
        } catch (_) {}

        // Local click handler suppressed; delegated handler manages actions
        luatoolsButton.addEventListener("click", function (e) {
          e.preventDefault();
          backendLog(
            "LuaTools button clicked (delegated handler will process)",
          );
        });

        // Before inserting, ask backend if LuaTools already exists for this appid
        try {
          const match =
            window.location.href.match(
              /https:\/\/store\.steampowered\.com\/app\/(\d+)/,
            ) ||
            window.location.href.match(
              /https:\/\/steamcommunity\.com\/app\/(\d+)/,
            );
          const appid = match ? parseInt(match[1], 10) : NaN;
          if (
            !isNaN(appid) &&
            typeof Millennium !== "undefined" &&
            typeof Millennium.callServerMethod === "function"
          ) {
            // prevent multiple concurrent checks
            if (
              window.__LuaToolsPresenceCheckInFlight &&
              window.__LuaToolsPresenceCheckAppId === appid
            ) {
              return;
            }
            window.__LuaToolsPresenceCheckInFlight = true;
            window.__LuaToolsPresenceCheckAppId = appid;
            window.__LuaToolsCurrentAppId = appid;
            window.Millennium.callServerMethod("luatools", "HasLuaToolsForApp", { appid })
              .then(function (payload) {
                return typeof payload === "string" ? JSON.parse(payload) : payload;
              })
              .then(function (payload) {
              try {
                // Already added → don't show the store-page button at all (removal
                // lives in the LuaTools menu). Only show "Add via LuaTools" when the
                // game is NOT yet added.
                if (payload && payload.success && payload.exists === true) {
                  backendLog(
                    "LuaTools already present for this app; not inserting button",
                  );
                  window.__LuaToolsPresenceCheckInFlight = false;
                  return;
                }
                if (
                  !document.querySelector(".luatools-button") &&
                  !window.__LuaToolsButtonInserted
                ) {
                  // Insert after restart button (order: Restart → Add)
                  const restartExisting = steamdbContainer.querySelector(
                    ".luatools-restart-button",
                  );
                  if (restartExisting && restartExisting.after) {
                    restartExisting.after(luatoolsButton);
                  } else if (referenceBtn && referenceBtn.after) {
                    referenceBtn.after(luatoolsButton);
                  } else {
                    steamdbContainer.appendChild(luatoolsButton);
                  }
                  window.__LuaToolsButtonInserted = true;
                  backendLog("LuaTools button inserted");
                }
                window.__LuaToolsPresenceCheckInFlight = false;
              } catch (_) {
                if (
                  !document.querySelector(".luatools-button") &&
                  !window.__LuaToolsButtonInserted
                ) {
                  steamdbContainer.appendChild(luatoolsButton);
                  window.__LuaToolsButtonInserted = true;
                  backendLog("LuaTools button inserted");
                }
                window.__LuaToolsPresenceCheckInFlight = false;
              }
            })
            .catch(function () {
              if (
                !document.querySelector(".luatools-button") &&
                !window.__LuaToolsButtonInserted
              ) {
                steamdbContainer.appendChild(luatoolsButton);
                window.__LuaToolsButtonInserted = true;
              }
              window.__LuaToolsPresenceCheckInFlight = false;
            });
          } else {
            if (
              !document.querySelector(".luatools-button") &&
              !window.__LuaToolsButtonInserted
            ) {
              // Insert after restart button (order: Restart → Add)
              const restartExisting = steamdbContainer.querySelector(
                ".luatools-restart-button",
              );
              if (restartExisting && restartExisting.after) {
                restartExisting.after(luatoolsButton);
              } else if (referenceBtn && referenceBtn.after) {
                referenceBtn.after(luatoolsButton);
              } else {
                steamdbContainer.appendChild(luatoolsButton);
              }
              window.__LuaToolsButtonInserted = true;
              backendLog("LuaTools button inserted");
            }
          }
        } catch (_) {
          if (
            !document.querySelector(".luatools-button") &&
            !window.__LuaToolsButtonInserted
          ) {
            const restartExisting = steamdbContainer.querySelector(
              ".luatools-restart-button",
            );
            if (restartExisting && restartExisting.after) {
              restartExisting.after(luatoolsButton);
            } else if (referenceBtn && referenceBtn.after) {
              referenceBtn.after(luatoolsButton);
            } else {
              steamdbContainer.appendChild(luatoolsButton);
            }
            window.__LuaToolsButtonInserted = true;
            backendLog("LuaTools button inserted");
          }
        }
      }

      // status pills — only run once per appid
      try {
        const match =
          window.location.href.match(
            /https:\/\/store\.steampowered\.com\/app\/(\d+)/,
          ) ||
          window.location.href.match(
            /https:\/\/steamcommunity\.com\/app\/(\d+)/,
          );
        const appid = match
          ? parseInt(match[1], 10)
          : window.__LuaToolsCurrentAppId || NaN;

        if (!isNaN(appid)) {
          const pillBtn = steamdbContainer.querySelector(".luatools-button");
          if (pillBtn) {
            // Skip if pills already built for this appid
            var existingPills = pillBtn.querySelector(
              ".luatools-pills-container",
            );
            if (
              !(
                existingPills &&
                existingPills.dataset.appid === String(appid) &&
                existingPills.dataset.content
              )
            ) {
              fetchGamesDatabase().then(function (db) {
                const btn = steamdbContainer.querySelector(".luatools-button");
                if (!btn) return;

                let pillsContainer = btn.querySelector(
                  ".luatools-pills-container",
                );

                if (!pillsContainer) {
                  pillsContainer = document.createElement("div");
                  pillsContainer.className = "luatools-pills-container";
                  btn.appendChild(pillsContainer);
                }
                pillsContainer.dataset.appid = String(appid);

                const key = String(appid);
                const gameData = db && db[key] ? db[key] : null;

                // check denuvo
                const drmNotice = document.querySelector(".DRM_notice");
                const hasDenuvo =
                  drmNotice && drmNotice.textContent.includes("Denuvo");

                fetchFixes(appid).then(function (fixesData) {
                  const hasFixes =
                    fixesData &&
                    ((fixesData.genericFix &&
                      fixesData.genericFix.status === 200) ||
                      (fixesData.onlineFix &&
                        fixesData.onlineFix.status === 200));
                  const showDenuvoPill = hasDenuvo && !hasFixes;

                  const cacheKey = JSON.stringify({
                    d: gameData || "untested",
                    showDenuvo: showDenuvoPill,
                    hasFixes: hasFixes,
                  });

                  if (pillsContainer.dataset.content === cacheKey) return;
                  pillsContainer.dataset.content = cacheKey;

                  pillsContainer.innerHTML = "";

                  let status = "untested";
                  if (gameData && typeof gameData.playable !== "undefined") {
                    if (gameData.playable === 1) status = "playable";
                    else if (gameData.playable === 0) status = "unplayable";
                    else if (gameData.playable === 2) status = "needs_fixes";
                  }

                  if (status === "untested" && hasFixes) {
                    status = "needs_fixes";
                  }

                  if (status !== "untested") {
                    const pill = document.createElement("span");
                    pill.className = "luatools-pill";
                    if (status === "playable") {
                      pill.classList.add("green");
                      pill.textContent = t("gameStatus.playable", "Playable");
                    } else if (status === "unplayable") {
                      pill.classList.add("red");
                      pill.textContent = t(
                        "gameStatus.unplayable",
                        "Unplayable",
                      );
                    } else if (status === "needs_fixes") {
                      pill.classList.add("yellow");
                      pill.textContent = t(
                        "gameStatus.needsFixes",
                        "Needs fixes",
                      );
                    }
                    pillsContainer.appendChild(pill);
                  }

                  if (showDenuvoPill) {
                    const pill = document.createElement("span");
                    pill.className = "luatools-pill orange";
                    pill.textContent = t("gameStatus.denuvo", "Denuvo");
                    pillsContainer.appendChild(pill);
                  }
                });
              });
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    } else {
      if (!logState.missingOnce) {
        backendLog("LuaTools: steamdbContainer not found on this page");
        logState.missingOnce = true;
      }
    }
  }

  // Retry addLuaToolsButton() until its DOM containers exist, instead of the previous single silent
  // no-op attempt. Steam's own page JS can still be building out ._1wn1lBlAzl3HMRqS1llwie (header) and
  // .apphub_OtherSiteInfo (store button) when our script first runs — a one-shot attempt would just miss
  // them, and nothing else ever retried (checkUrlChange only re-fires on an actual URL change, not on
  // "containers appeared since last try"). Spaced past BUTTON_CHECK_THROTTLE (500ms) so each retry
  // actually runs addLuaToolsButton's body instead of being silently throttled away.
  //
  // window.__LuaToolsReady only gets set once this settles (header button confirmed present, or retries
  // exhausted) — that's the signal CefInjectorService's polling loop needs to know whether to re-inject.
  // Setting it any earlier (as a previous version of this file did, unconditionally at the end of the
  // IIFE) let the loop think a page was done before the button/icon had actually been created.
  function ensureLuaToolsUI(attempt) {
    attempt = attempt || 0;
    try {
      addLuaToolsButton();
    } catch (err) {
      backendLog("LuaTools: ensureLuaToolsUI attempt " + attempt + " threw: " + err);
    }

    var headerReady = !!document.querySelector(".luatools-header-button");
    if (headerReady || attempt >= 12) {
      window.__LuaToolsReady = true;
      return;
    }
    setTimeout(function () {
      ensureLuaToolsUI(attempt + 1);
    }, 600);
  }

  // Try to add the button immediately if DOM is ready
  function onFrontendReady() {
    // Fetch settings + translations FIRST, then insert the button once in the correct language
    try {
      fetchSettingsConfig(true)
        .then(function (cfg) {
          try {
            ensureLuaToolsStyles();
          } catch (_) {}

          // Show disclaimer after translations are loaded so it displays in the correct language
          try {
            if (window.location.hostname === "store.steampowered.com") {
              if (
                localStorage.getItem(
                  "luatools millennium disclaimer accepted",
                ) !== "1"
              ) {
                showMillenniumDisclaimerModal();
              }
            }
          } catch (_) {}

          // Now translations are ready — insert the button in the correct language
          ensureLuaToolsUI();
        })
        .catch(function (_) {
          // Settings failed, still insert button (English fallback)
          ensureLuaToolsUI();
        });
    } catch (_) {
      ensureLuaToolsUI();
    }

    // Show gamepad hint if connected (only in Big Picture mode)
    setTimeout(function () {
      if (
        window.GamepadNav &&
        window.GamepadNav.isConnected &&
        window.GamepadNav.isConnected()
      ) {
        backendLog("[LuaTools] Gamepad detected - Navigation enabled");

        // Only show visual hint in Big Picture mode
        if (window.__LUATOOLS_IS_BIG_PICTURE__) {
          const hint = document.createElement("div");
          hint.id = "luatools-gamepad-hint";
          hint.innerHTML = "🎮 " + lt("bigpicture.mouseTip");
          hint.style.cssText =
            "\
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
                    ";

          // Add CSS animation if not already present
          if (!document.querySelector("#luatools-gamepad-hint-styles")) {
            const style = document.createElement("style");
            style.id = "luatools-gamepad-hint-styles";
            style.textContent =
              "\
                            @keyframes fadeInOut {\
                                0% { opacity: 0; transform: translateY(10px); }\
                                10% { opacity: 1; transform: translateY(0); }\
                                90% { opacity: 1; transform: translateY(0); }\
                                100% { opacity: 0; transform: translateY(10px); }\
                            }\
                        ";
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
      if (
        typeof Millennium !== "undefined" &&
        typeof Millennium.callServerMethod === "function"
      ) {
        Millennium.callServerMethod("luatools", "GetInitApisMessage", {
          contentScriptQuery: "",
        }).then(function (res) {
          try {
            const payload = typeof res === "string" ? JSON.parse(res) : res;
            if (payload && payload.message) {
              const msg = String(payload.message);
              // Check if this is an update message (contains "update" or "restart")
              const isUpdateMsg =
                msg.toLowerCase().includes("update") ||
                msg.toLowerCase().includes("restart");

              if (isUpdateMsg) {
                // For update messages, use confirm dialog with OK (restart) and Cancel options
                askRestartConfirmation();
              } else {
                // For non-update messages, use regular alert
                ShowLuaToolsAlert("LuaTools", msg);
              }
            }
          } catch (_) {}
        });
        // Also show loaded apps list if present (only once per session, store page only)
        try {
          if (window.location.hostname === "store.steampowered.com") {
            if (!sessionStorage.getItem("LuaToolsLoadedAppsGate")) {
              sessionStorage.setItem("LuaToolsLoadedAppsGate", "1");
              Millennium.callServerMethod("luatools", "ReadLoadedApps", {
                contentScriptQuery: "",
              }).then(function (res) {
                try {
                  const payload =
                    typeof res === "string" ? JSON.parse(res) : res;
                  const apps =
                    payload && payload.success && Array.isArray(payload.apps)
                      ? payload.apps
                      : [];
                  if (apps.length > 0) {
                    showLoadedAppsPopup(apps);
                  }
                } catch (_) {}
              });
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onFrontendReady);
  } else {
    onFrontendReady();
  }

  // Delegate click handling in case the DOM is re-rendered and listeners are lost
  // Use bubble phase instead of capture phase to avoid interfering with gamepad navigation
  document.addEventListener(
    "click",
    function (evt) {
      // Quick exit if target doesn't have closest method or isn't an element
      if (!evt.target || !evt.target.closest) return;

      const anchor = evt.target.closest(".luatools-button");
      if (anchor) {
        evt.preventDefault();
        evt.stopPropagation(); // Stop propagation to avoid conflicts
        backendLog("LuaTools delegated click");
        try {
          const match =
            window.location.href.match(
              /https:\/\/store\.steampowered\.com\/app\/(\d+)/,
            ) ||
            window.location.href.match(
              /https:\/\/steamcommunity\.com\/app\/(\d+)/,
            );
          const appid = match ? parseInt(match[1], 10) : NaN;
          if (
            !isNaN(appid) &&
            typeof Millennium !== "undefined" &&
            typeof Millennium.callServerMethod === "function"
          ) {
            if (runState.inProgress && runState.appid === appid) {
              backendLog(
                "LuaTools: operation already in progress for this appid",
              );
              return;
            }

            // "Add via LuaTools": reflect the app's real add pipeline in the popup
            // (dynamic sources, Hubcap/key-gating, usage, FastFetch, progress),
            // headless. Removal is handled from the LuaTools menu, not this button.
            startLuaToolsAdd(appid, anchor);
            return;
          }
        } catch (_) {}
      }
    },
    false,
  ); // Changed from true to false (bubble phase instead of capture phase)

  // Poll backend for progress and update progress bar and text
  // BUG FIX: `lastUrl` was referenced but never declared — every call threw
  // "ReferenceError: lastUrl is not defined" immediately, meaning this whole
  // SPA-navigation-detection mechanism (setInterval + popstate + pushState/replaceState
  // hooks below) has never actually worked. Init to the current URL so the very first
  // check correctly sees "no change yet" instead of force-resetting button state.
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
  window.addEventListener("popstate", checkUrlChange);
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

  // Pre-fetch settings quietly to ensure background values (like fastDownload) are populated immediately,
  // and apply themes immediately once settings load.
  function bootSettings() {
    if (typeof Millennium === "undefined" || typeof Millennium.callServerMethod !== "function") {
        setTimeout(bootSettings, 200);
        return;
    }
    loadThemes().then(function() {
        return fetchSettingsConfig();
    }).then(function() {
        if (typeof ensureLuaToolsStyles === "function") ensureLuaToolsStyles();
    }).catch(function(e) {
        try { backendLog("LuaTools: Boot sequence failed: " + String(e)); } catch(_) {}
    });
  }
  bootSettings();

  // Use MutationObserver to catch dynamically added content
  // Heavily optimized and throttled version to avoid blocking gamepad
  if (typeof MutationObserver !== "undefined") {
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
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            // Only check first 3 added nodes to avoid blocking
            const nodesToCheck = Math.min(mutation.addedNodes.length, 3);

            for (let j = 0; j < nodesToCheck; j++) {
              const node = mutation.addedNodes[j];
              if (node.nodeType === 1) {
                // Element node
                // Quick class check without querySelector (faster)
                if (
                  node.classList &&
                  (node.classList.contains("steamdb-buttons") ||
                    node.classList.contains("apphub_OtherSiteInfo") ||
                    node.id === "queueBtnFollow")
                ) {
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
      subtree: true,
    });
  }

  function showLoadedAppsPopup(apps) {
    // Avoid duplicates
    if (document.querySelector(".luatools-loadedapps-overlay")) return;
    ensureFontAwesome();
    ensureLuaToolsStyles();
    const overlay = document.createElement("div");
    overlay.className = "luatools-loadedapps-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;";
    const modal = document.createElement("div");
    const loadedAppsModalColors = getThemeColors();
    modal.style.cssText = `background:${loadedAppsModalColors.modalBg};color:${loadedAppsModalColors.text};border:2px solid ${loadedAppsModalColors.border};border-radius:8px;width:560px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.8), 0 0 0 1px ${loadedAppsModalColors.shadowRgba};animation:slideUp 0.1s ease-out;`;
    const title = document.createElement("div");
    const loadedAppsTitleColors = getThemeColors();
    title.style.cssText = `font-size:24px;color:${loadedAppsTitleColors.text};margin-bottom:20px;font-weight:700;text-shadow:0 2px 8px ${loadedAppsTitleColors.shadow};background:${loadedAppsTitleColors.gradientLight};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;text-align:center;`;
    title.textContent = lt("LuaTools · Added Games");
    const body = document.createElement("div");
    const loadedAppsBodyColors = getThemeColors();
    body.style.cssText = `font-size:14px;line-height:1.8;margin-bottom:16px;max-height:320px;overflow:auto;padding:16px;border:1px solid ${loadedAppsBodyColors.border};border-radius:12px;background:${loadedAppsBodyColors.bgContainer};`;
    if (apps && apps.length) {
      const list = document.createElement("div");
      apps.forEach(function (item) {
        // Backend sends [{appid, name}], but tolerate a bare appid number too so a missing
        // name never renders as literal "undefined".
        const appid = item && typeof item === "object" ? item.appid : item;
        const name = item && typeof item === "object" ? item.name : null;
        const a = document.createElement("a");
        a.href = "steam://install/" + String(appid);
        a.textContent = String(name || appid);
        const linkColors = getThemeColors();
        a.style.cssText = `display:block;color:${linkColors.textSecondary};text-decoration:none;padding:10px 16px;margin-bottom:8px;background:rgba(${linkColors.rgbString},0.08);border:1px solid rgba(${linkColors.rgbString},0.2);border-radius:4px;transition:all 0.3s ease;`;
        a.onmouseover = function () {
          const c = getThemeColors();
          this.style.background = `rgba(${c.rgbString},0.2)`;
          this.style.borderColor = c.accent;
          this.style.transform = "translateX(4px)";
          this.style.color = c.text;
        };
        a.onmouseout = function () {
          const c = getThemeColors();
          this.style.background = `rgba(${c.rgbString},0.08)`;
          this.style.borderColor = `rgba(${c.rgbString},0.2)`;
          this.style.transform = "translateX(0)";
          this.style.color = c.textSecondary;
        };
        a.onclick = function (e) {
          e.preventDefault();
          try {
            window.location.href = a.href;
          } catch (_) {}
        };
        a.oncontextmenu = function (e) {
          e.preventDefault();
          const url = "https://steamdb.info/app/" + String(appid) + "/";
          try {
            Millennium.callServerMethod("luatools", "OpenExternalUrl", {
              url,
              contentScriptQuery: "",
            });
          } catch (_) {}
        };
        list.appendChild(a);
      });
      body.appendChild(list);
    } else {
      body.style.textAlign = "center";
      body.textContent = lt("No games found.");
    }
    const btnRow = document.createElement("div");
    btnRow.style.cssText =
      "margin-top:16px;display:flex;gap:8px;justify-content:space-between;align-items:center;";
    const instructionText = document.createElement("div");
    instructionText.style.cssText = "font-size:12px;color:#8f98a0;";
    instructionText.textContent = lt(
      "Left click to install, Right click for SteamDB",
    );
    const dismissBtn = document.createElement("a");
    dismissBtn.className = "luatools-btn";
    dismissBtn.innerHTML = "<span>" + lt("Dismiss") + "</span>";
    dismissBtn.href = "#";
    dismissBtn.onclick = function (e) {
      e.preventDefault();
      try {
        Millennium.callServerMethod("luatools", "DismissLoadedApps", {
          contentScriptQuery: "",
        });
      } catch (_) {}
      try {
        sessionStorage.setItem("LuaToolsLoadedAppsShown", "1");
      } catch (_) {}
      overlay.remove();
    };
    btnRow.appendChild(instructionText);
    btnRow.appendChild(dismissBtn);
    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    overlay.addEventListener("click", function (e) {
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

  // window.__LuaToolsReady (the completion marker CefInjectorService's polling loop checks — see
  // ensureLuaToolsUI() above) is set there once the button/icon setup actually settles, not here
  // unconditionally. Setting it here regardless of that outcome is exactly the bug that caused pages to
  // occasionally load with no button/icon until a manual refresh — the loop would see "ready" and stop
  // retrying before the UI had actually been created.
})();
