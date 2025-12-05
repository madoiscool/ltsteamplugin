# 🎮 Gamepad Navigation System

## Overview

LuaTools includes a complete gamepad navigation system for navigating plugin overlays and menus using game controllers. The system is fully integrated into `luatools.js` and requires no external dependencies.

## Features

- ✅ **Automatic gamepad detection** - Detects when a controller is connected
- ✅ **Smart element scanning** - Automatically finds all interactive elements within modals
- ✅ **Multi-directional navigation** - D-pad and left analog stick support
- ✅ **Visual feedback** - Focused elements show a blue glowing outline
- ✅ **Background blocking** - Prevents Steam navigation when modals are open
- ✅ **Big Picture Mode compatible** - Works in both normal and Big Picture modes
- ✅ **Steam Deck ready** - Fully functional on Steam Deck
- ✅ **Zero dependencies** - No external libraries required

## How It Works

### 1. Gamepad Detection

The system uses the native [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API) to detect controllers:

```javascript
window.addEventListener('gamepadconnected', onGamepadConnected);
window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
```

When a gamepad connects, the system:
- Starts a `requestAnimationFrame` polling loop (~60fps)
- Logs detection to console: `[Gamepad] Gamepad conectado en Millennium: {controller name}`
- Waits for overlays to be opened before scanning elements

### 2. Element Scanning

The system only scans interactive elements **inside active LuaTools overlays**. It looks for:

- `<button>` elements (not disabled)
- `<a href="...">` links
- `<input>`, `<select>`, `<textarea>` form elements
- Elements with `tabindex="0"` or positive tabindex
- Elements with class `.focusable`

**Supported overlay classes:**
- `.luatools-overlay` - General overlays
- `.luatools-settings-overlay` - Settings popup
- `.luatools-fixes-results-overlay` - Fixes results
- `.luatools-loading-fixes-overlay` - Loading screen
- `.luatools-unfix-overlay` - Un-fix progress
- `.luatools-settings-manager-overlay` - Settings manager
- `.luatools-alert-overlay` - Alert dialogs
- `.luatools-confirm-overlay` - Confirmation dialogs
- `.luatools-loadedapps-overlay` - Loaded apps list

**Element filtering:**
Only visible elements are included (width > 0, height > 0, not hidden, opacity > 0).

### 3. Navigation

**Input methods:**
- **D-pad**: Up/Down/Left/Right for directional navigation
- **Left stick**: Analog navigation with configurable deadzone (0.4) and threshold (0.7)

**Button mapping:**
- **A button (0)**: Click the focused element
- **B button (1)**: Disabled (users should use modal buttons)
- **D-pad (12-15)**: Navigate between elements

**Configuration:**
```javascript
const CONFIG = {
    deadzone: 0.4,          // Stick deadzone to prevent drift
    debounceTime: 200,      // Debounce in milliseconds
    stickThreshold: 0.7     // Threshold for stick navigation (70%)
};
```

### 4. Visual Feedback

Focused elements receive the `.active-focus` class with Steam-themed styling:

```css
.active-focus {
    outline: 3px solid #66c0f4 !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 4px rgba(102, 192, 244, 0.3),
                0 0 12px rgba(102, 192, 244, 0.5) !important;
    animation: gamepad-focus-pulse 1.5s ease-in-out infinite;
}
```

The outline pulses with a subtle animation for better visibility.

### 5. Background Blocking

When a LuaTools overlay is active, the system blocks:

**Keyboard events:**
- Arrow keys (↑ ↓ ← →)
- Enter, Escape, Backspace
- Space, Tab

**Mouse events:**
- Clicks outside the overlay
- Mouse down events outside the overlay

**History navigation:**
- `popstate` events (browser back button)
- Automatically pushes state back to prevent navigation

All blocking uses **capture phase** (`addEventListener(..., true)`) to intercept events before Steam processes them.

## Integration in Overlays

Each overlay automatically triggers element scanning after being added to the DOM:

```javascript
document.body.appendChild(overlay);

// Re-scan elements for gamepad navigation
setTimeout(function() {
    if (window.GamepadNav) {
        window.GamepadNav.scanElements();
    }
}, 150);
```

The 150ms delay ensures the DOM is fully rendered before scanning.

## Public API

The system exposes a global `window.GamepadNav` object with these methods:

```javascript
// Manually trigger element scanning
window.GamepadNav.scanElements();

// Set custom back button handler (not currently used)
window.GamepadNav.setBackHandler(function() {
    console.log('Custom back action');
});

// Focus a specific element by index
window.GamepadNav.focusElement(2);

// Get current focused element index
const index = window.GamepadNav.getCurrentIndex();

// Get array of all focusable elements
const elements = window.GamepadNav.getElements();

// Check if gamepad is connected
if (window.GamepadNav.isConnected()) {
    console.log('Gamepad is connected');
}
```

## User Instructions

**Navigation:**
- Use **D-pad** or **Left Stick** to move between buttons
- Press **A button** to click the focused button
- Press **B button** - Does nothing (use Cancel/Back buttons in the modal)

**Big Picture Mode Tip:**
A helpful tip is shown when a gamepad is detected in Big Picture mode:
> 🎮 To use mouse mode in Steam: Guide Button + Right Joystick, click with RB

## Technical Details

### Polling Loop

The system uses `requestAnimationFrame` for efficient polling:

```javascript
function pollGamepad() {
    // Check if overlay is active
    const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

    // Skip input processing if no overlay
    if (!hasActiveOverlay) {
        state.animationFrameId = requestAnimationFrame(pollGamepad);
        return;
    }

    // Process gamepad input...
    state.animationFrameId = requestAnimationFrame(pollGamepad);
}
```

This ensures:
- The loop continues even when no overlay is active
- Input is only processed when needed
- Minimal CPU usage (~60fps polling)

### Debouncing

Navigation has built-in debouncing to prevent rapid repeated inputs:

```javascript
const now = Date.now();
if (now - state.lastNavigationTime >= CONFIG.debounceTime) {
    // Allow navigation
    navigate(direction);
    state.lastNavigationTime = now;
}
```

### Edge Detection

For stick navigation, the system uses edge detection to prevent continuous navigation:

```javascript
// Detect when stick crosses threshold (rising edge)
if (y < -threshold && state.lastAxisValues.y >= -threshold) {
    navigate('up');
}
```

This means you must move the stick back to center before navigating again.

## Browser Compatibility

The Gamepad API is supported in all Chromium-based browsers, including:
- Steam's Chromium Embedded Framework (CEF)
- Steam Big Picture Mode browser
- Steam Deck browser

## Performance

- **Memory**: ~50KB of JavaScript (inline CSS included)
- **CPU**: Minimal (~60fps polling only when gamepad connected)
- **No external dependencies**: Everything is self-contained

## Debugging

To debug gamepad navigation, open DevTools (F12) and look for console messages:

```
[Gamepad] Initializing Gamepad Navigation System...
[Gamepad] Gamepad conectado en Millennium: Xbox 360 Controller
[Gamepad] Scanned 5 focusable elements inside overlay
[Gamepad] Focused element 0: <a class="luatools-btn">
[Gamepad] A button: clicking element
[Gamepad] Blocked Steam navigation key: ArrowDown
```

## Future Enhancements

Possible future improvements:
- Configurable button mappings
- Custom navigation sounds
- Haptic feedback support
- Grid-based navigation for complex layouts
- Navigation history for quick back-tracking

## Credits

Built for LuaTools by the community, with support for:
- Millennium plugin framework
- Steam Big Picture Mode
- Steam Deck
