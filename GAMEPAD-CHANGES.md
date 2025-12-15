# Gamepad Navigation System - Changes

## Branch: `feature/gamepad-navigation`

### Summary

Added complete gamepad navigation support for all LuaTools overlays and menus, allowing users to navigate with game controllers (Xbox, PlayStation, Steam Deck, etc.).

---

## Files Changed

### 1. `public/luatools.js`

**Added** (lines 1-520 approx):
- Complete gamepad navigation system integrated inline
- CSS styles for `.active-focus` visual feedback
- Gamepad polling loop using `requestAnimationFrame`
- Element scanning system (buttons, links, inputs)
- Navigation handlers (D-pad, analog stick)
- Steam navigation blocking (keyboard, mouse, history)
- Public API (`window.GamepadNav`)

**Key Features:**
- Auto-detection of gamepad connection
- Smart element scanning (only inside active overlays)
- Configurable deadzone (0.4) and stick threshold (0.7)
- Debouncing (200ms) to prevent rapid inputs
- Visual feedback with Steam-themed blue outline
- Blocks background Steam navigation when overlay is active
- B button disabled (users must use modal buttons)

**Configuration:**
```javascript
const CONFIG = {
    deadzone: 0.4,
    debounceTime: 200,
    stickThreshold: 0.7
};
```

**Supported Overlays:**
- `.luatools-overlay`
- `.luatools-settings-overlay`
- `.luatools-fixes-results-overlay`
- `.luatools-loading-fixes-overlay`
- `.luatools-unfix-overlay`
- `.luatools-settings-manager-overlay`
- `.luatools-alert-overlay`
- `.luatools-confirm-overlay`
- `.luatools-loadedapps-overlay`

**Modified** (10 locations):
Each overlay's `appendChild(overlay)` call now includes:
```javascript
setTimeout(function() {
    if (window.GamepadNav) {
        window.GamepadNav.scanElements();
    }
}, 150);
```

### 2. `backend/locales/en.json`

**Added** (line 167):
```json
"bigpicture.mouseTip": "To use mouse mode in Steam: Guide Button + Right Joystick, click with RB"
```

This tip is shown when a gamepad is detected in Big Picture mode.

### 3. `backend/locales/es.json`

**Added** (line 167):
```json
"bigpicture.mouseTip": "Para usar el modo mouse en Steam: Botón guía + Joystick derecho, clic con RB"
```

Spanish translation of the Big Picture mode tip.

### 4. `GAMEPAD-SYSTEM.md` (new file)

Complete documentation in English covering:
- Overview and features
- How the system works (detection, scanning, navigation, blocking)
- Integration guide
- Public API reference
- User instructions
- Technical details (polling, debouncing, edge detection)
- Browser compatibility
- Performance notes
- Debugging tips
- Future enhancements

---

## Files Removed

The following files were created initially but removed because the code was integrated inline:

- `public/gamepad-navigation.js` - ❌ Removed (integrated into luatools.js)
- `public/gamepad-navigation.css` - ❌ Removed (CSS integrated into luatools.js)
- `GAMEPAD-GUIDE.md` - ❌ Removed (replaced with GAMEPAD-SYSTEM.md)
- `GAMEPAD-INTEGRATION-EXAMPLE.js` - ❌ Removed (no longer needed)

**Reason for integration:**
Millennium's backend only copies `luatools.js` specifically. Having separate files would require backend changes to copy them. Inline integration ensures everything works out of the box.

---

## Technical Implementation

### 1. Gamepad Detection

Uses native Gamepad API:
```javascript
window.addEventListener('gamepadconnected', onGamepadConnected);
window.addEventListener('gamepaddisconnected', onGamepadDisconnected);
```

### 2. Polling Loop

60fps polling using `requestAnimationFrame`:
```javascript
function pollGamepad() {
    // Check if overlay is active
    const hasActiveOverlay = document.querySelector(OVERLAY_SELECTOR_STRING);

    // Skip if no overlay
    if (!hasActiveOverlay) {
        state.animationFrameId = requestAnimationFrame(pollGamepad);
        return;
    }

    // Process gamepad input...
}
```

### 3. Element Scanning

Scans only visible, interactive elements inside active overlays:
```javascript
const selectors = [
    'button:not([disabled])',
    'a[href]:not([disabled])',
    'input:not([disabled])',
    // ... etc
].join(', ');

const elements = Array.from(activeOverlay.querySelectorAll(selectors));
```

### 4. Navigation Blocking

Blocks Steam's navigation using capture phase:
```javascript
document.addEventListener('keydown', blockSteamNavigation, true);
document.addEventListener('click', blockSteamClicks, true);
window.addEventListener('popstate', blockHistoryNavigation, true);
```

### 5. Visual Feedback

Adds `.active-focus` class with Steam-themed styling:
```css
.active-focus {
    outline: 3px solid #66c0f4 !important;
    box-shadow: 0 0 0 4px rgba(102, 192, 244, 0.3),
                0 0 12px rgba(102, 192, 244, 0.5) !important;
    animation: gamepad-focus-pulse 1.5s ease-in-out infinite;
}
```

---

## User Experience

### Controls

- **D-pad / Left Stick**: Navigate between buttons
- **A button**: Click the focused button
- **B button**: Disabled (use Cancel/Back buttons in modal)

### Behavior

1. **Without overlay**: Gamepad does nothing, Steam handles it normally
2. **With LuaTools overlay open**:
   - Elements inside overlay are scannable
   - Navigation works (D-pad/stick + A button)
   - Background Steam navigation is blocked
   - Can only interact with the overlay
3. **When overlay closes**: System returns to inactive state

### Visual Feedback

Focused buttons show:
- Blue glowing outline (#66c0f4)
- Subtle pulsing animation
- Slight scale increase (1.02x or 1.05x depending on element)

---

## Testing Checklist

- [x] Gamepad detection works
- [x] Navigation in all 9 overlay types
- [x] Background blocking (keyboard, mouse, history)
- [x] B button disabled
- [x] Visual feedback (.active-focus)
- [x] Big Picture mode compatibility
- [x] Steam Deck compatibility
- [x] No conflicts with Steam's gamepad handling
- [x] Proper cleanup when overlay closes
- [x] Debouncing prevents rapid inputs
- [x] Deadzone prevents stick drift

---

## Known Limitations

1. **B button disabled**: Users must navigate to Cancel/Back buttons and press A. This is intentional to prevent conflicts with Steam's back navigation.

2. **No grid navigation**: Navigation is sequential (up/down cycles through elements). Left/right uses spatial detection but may not be perfect for complex layouts.

3. **No MutationObserver**: Auto-scanning on DOM changes was disabled to prevent unwanted navigation. Elements are only scanned when overlays are opened.

---

## Performance Impact

- **Memory**: ~50KB additional code (inline CSS + JS)
- **CPU**: Minimal - 60fps polling only when gamepad is connected
- **Network**: Zero - no external dependencies
- **Load time**: Negligible - code is inline in luatools.js

---

## Future Improvements

Potential enhancements for future versions:

1. **Configurable controls**: Allow users to customize button mappings
2. **Grid navigation**: Better spatial navigation for complex layouts
3. **Navigation sounds**: Audible feedback when navigating
4. **Haptic feedback**: Controller vibration support
5. **Navigation history**: Quick back-tracking through navigation
6. **Custom focus styles**: Per-overlay styling options
7. **Keyboard navigation**: Support for keyboard arrow keys + Enter

---

## Migration Notes

No migration needed - this is a new feature with zero breaking changes:
- Existing functionality unchanged
- No API changes
- No dependencies added
- Fully backward compatible

Users without gamepads will see no difference. Users with gamepads will automatically get the new navigation features.

---

## Commit Message Suggestion

```
feat: Add complete gamepad navigation system for all overlays

- Integrated gamepad detection and navigation directly into luatools.js
- Added visual feedback with Steam-themed .active-focus styling
- Implemented background blocking to prevent Steam navigation conflicts
- Added support for D-pad and left analog stick navigation
- Configured debouncing (200ms) and deadzone (0.4) for reliable input
- Added Big Picture mode tip for mouse mode activation
- Disabled B button to prevent history navigation issues
- Supports all 9 overlay types (settings, alerts, confirms, etc.)
- Zero external dependencies, fully self-contained
- Works in normal mode, Big Picture mode, and Steam Deck
- Added comprehensive documentation (GAMEPAD-SYSTEM.md)

Closes #[issue-number]
```

---

## Documentation

See [GAMEPAD-SYSTEM.md](GAMEPAD-SYSTEM.md) for complete technical documentation.
