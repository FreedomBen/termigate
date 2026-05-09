# Vitest Frontend Test Plan

Audit + roadmap for filling the front-end test gap in `server/assets/`. Write
new tests under `server/assets/js/` and keep colocation with sources (existing
convention). Run with `npm test` from `server/assets/`.

## Toolchain (already in place)

- Runner: **vitest 2.1** (`npm test` → `vitest run`)
- DOM shim: **jsdom 25** (set as `environment` in `vitest.config.js`)
- Discovery glob: `js/**/*.test.js`
- Globals **off** — every test imports `describe / it / expect` explicitly
- Phoenix `phoenix_live_view` is not on the npm dep list, so hooks are
  exercised by stubbing the hook context (`Object.create(Hook)`, set `el`,
  `pushEvent`, `handleEvent`, …) rather than by booting a real `LiveSocket`

## Established testing patterns

| Pattern | When to use | Example |
| --- | --- | --- |
| **Pure-logic unit** (import → assert) | Module exports a side-effect-free function | `should_auto_fit.test.js` |
| **DOM-hook lifecycle** (stub the hook ctx, drive jsdom events) | Hook touches the DOM but not xterm/Phoenix sockets | `password_toggle_hook.test.js` |
| **Structural / source-string** (`readFileSync` + regex assertions) | File is too DOM/network-coupled to import (xterm, FitAddon, Phoenix Socket) | `terminal_hook_fit_gates.test.js` |
| **CSS regression** (parse `app.css`, assert rule body) | Pinning a visual / a11y fix in CSS | `mobile_*_tap_targets.test.js` |

Use the **lightest pattern that covers the behavior**. Reach for the structural
pattern only when an import is genuinely impractical.

## Coverage map (today)

| Source | Tested by | Notes |
| --- | --- | --- |
| `js/hooks/should_auto_fit.js` | `should_auto_fit.test.js` | Full matrix (4 cases) |
| `js/hooks/password_toggle_hook.js` | `password_toggle_hook.test.js` | Lifecycle + a11y |
| `js/hooks/terminal_hook.js` | `terminal_hook_fit_gates.test.js` | **Structural only** — pins that every fit gate flows through `shouldAutoFit`. No behavioral coverage. |
| `js/hooks/notification_hook.js` | — | **Gap** |
| `js/hooks/pane_resize_hook.js` | — | **Gap** |
| `js/hooks/quick_action_bar_hook.js` | — | **Gap** |
| `js/hooks/restore_or_fit_hook.js` | — | **Gap** |
| `js/preferences.js` | — | **Gap** (pure logic, easy win) |
| `js/preferences_panel.js` | — | **Gap** (DOM-heavy but importable) |
| `js/app.js` | — | Entry-point glue; no test value beyond imports |
| `css/app.css` (mobile media queries) | `mobile_login_tap_targets.test.js`, `mobile_settings_tap_targets.test.js`, `mobile_top_bar_tap_targets.test.js` | Already pinned |

## Proposed new test files

Each bullet under a heading is one test case. Group as `describe(...)` per
source. Cite the user-visible behavior, not the implementation.

### 1. `js/preferences.test.js` — pure-logic unit

Exports under test: `serverToLocal`, `localToServer`, `resolveTheme`, `THEMES`,
`FONT_FAMILIES`.

- `serverToLocal` maps every snake_case key to its camelCase counterpart for a
  fully-populated server payload.
- `serverToLocal` falls back to `DEFAULTS` for each missing key (drive every
  default at least once: `fontSize`, `fontFamily`, `theme`, `customTheme`,
  `cursorStyle`, `cursorBlink`, `showToolbar`, `mobileKeyboardEnabled`,
  `toolbarButtons`).
- `serverToLocal` distinguishes `false` from `undefined` (e.g. an explicit
  `cursor_blink: false` survives, doesn't get clobbered by the `true` default).
  This is the `??` vs `||` trap and worth pinning.
- `localToServer` round-trips: `localToServer(serverToLocal(x))` equals `x` for
  a canonical fully-populated payload.
- `localToServer` emits `custom_theme: {}` when local prefs omit it (pin the
  fallback so the server always sees an object).
- `resolveTheme("dark")` returns an empty object (xterm default).
- `resolveTheme("light")` returns the light-palette object verbatim.
- `resolveTheme("custom")` overlays `customTheme` on top of the base palette.
- `resolveTheme` for an unknown theme name falls back gracefully (document the
  current behavior; pick whichever it is and pin it).
- `THEMES` contains at least `dark` and `light` keys (catches accidental
  removal that would break the panel select).
- `FONT_FAMILIES` is a non-empty array of `{label, value}` records, and every
  `value` is a non-empty CSS font stack.

### 2. `js/hooks/quick_action_bar_hook.test.js` — DOM-hook lifecycle

Build a scrollable container in jsdom. jsdom returns `0` for layout metrics by
default, so override `scrollLeft / clientWidth / scrollWidth` via
`Object.defineProperty` per case.

- `mounted()` sets `data-fade-left=false / data-fade-right=true` when the bar
  is scrolled all the way to the start with overflow on the right.
- Sets both fades to `true` when scrolled into the middle.
- Sets `data-fade-left=true / data-fade-right=false` at the end.
- Both fades `false` when content fits without overflow.
- A scroll event on `el` re-runs the update.
- `updated()` re-runs the update (mock by calling it directly after changing
  metrics).
- `destroyed()` disconnects the `ResizeObserver` and removes the scroll
  listener (assert via a stubbed `ResizeObserver` whose `disconnect` is spied;
  `removeEventListener` via `vi.spyOn`).

### 3. `js/hooks/restore_or_fit_hook.test.js` — DOM-hook lifecycle

Stub `pushEvent` as a `vi.fn()` and toggle `window.innerWidth` per test
(jsdom lets you write to it directly).

- Desktop (`innerWidth >= 640`): clicking the button pushes `restore_pane`
  with no payload, regardless of `data-target`.
- Mobile + the matching `pane-${target}` element exposes a `_termHook` with a
  numeric `viewportFitCols()` → pushes `fit_pane_width` with `{target, cols}`.
- Mobile but `viewportFitCols()` returns `null` (renderer not ready) → falls
  through to `restore_pane`.
- Mobile but no `pane-${target}` element → falls through to `restore_pane`.
- `e.preventDefault()` is called on the click (assert via a synthetic event
  with a spy).
- `destroyed()` removes the click listener (spy on `removeEventListener`).

### 4. `js/hooks/notification_hook.test.js` — DOM-hook lifecycle

Stub the global `Notification` constructor as a `vi.fn()` that records its
arguments and returns an object with an `onclick` setter and `close()`. Stub
`document.hasFocus`, `Notification.permission`, and the hook's `pushEvent` /
`handleEvent` methods.

`NotificationHook`:
- Stores config received via the `notification_config` push.
- `notify_command_done` is a no-op when `mode !== "shell"`.
- `notify_command_done` is a no-op when `duration_seconds < min_duration`.
- Fires a `Notification` with the command + exit code in the title/body when
  the command meets the threshold and the tab is unfocused.
- Suppresses notifications when `document.hasFocus()` is true.
- Suppresses when `Notification.permission !== "granted"`.
- Activity-mode (`mode === "activity"`) respects the per-pane 30 s cooldown
  (advance time via `vi.useFakeTimers()` and `vi.setSystemTime()` to verify a
  second event within the window is suppressed and one after is allowed).
- Clicking the rendered notification calls `window.focus()`, pushes
  `focus_pane` with the pane id, and calls `notification.close()`.
- `silent` flag mirrors `_config.sound`.

`NotificationPermission`:
- Calls `_updateStatus()` on mount.
- Click triggers `Notification.requestPermission()` and re-runs status.
- `test_notification` push fires a `Notification` when permission is granted;
  no-ops when `Notification` is undefined or denied.

### 5. `js/hooks/pane_resize_hook.test.js` — DOM-hook lifecycle

The drag math is genuinely complex; cover the parts that are easy to drive in
jsdom and leave the pixel-accurate drag rendering for the existing browser
drive script.

- `mounted()` registers a window `resize` listener and runs `_setupDividers()`
  on the next animation frame (use `vi.useFakeTimers()` +
  `requestAnimationFrame` flush, or stub `requestAnimationFrame` to invoke
  synchronously).
- `_setupDividers` reads layout from `data-*` attributes and creates one
  `.pane-divider` per separator track, with correct `data-axis` /
  `data-sep-track` / `data-target`.
- `updated()` while dragging defers re-setup (`_pendingUpdate=true`); not
  dragging → re-runs setup.
- `destroyed()` removes the resize listener and clears any pending timer.
- `getPointer` (export it for testability if needed) returns
  `{x: clientX, y: clientY}` for mouse events and the touch coords for
  `touchstart` / `touchend` (use the changedTouches branch for end events).
- Drag start sets `body.style.cursor` and the active class, drag end clears
  them. Skip pixel math; pin only "no negative-delta event is pushed when
  delta rounds to 0" (the `else { reset gridTemplate }` branch).

### 6. `js/preferences_panel.test.js` — DOM integration

The module imports cleanly (no xterm/socket deps) but mutates DOM and a
provided `terminal` object. Pass a stub terminal (`{ options: {} }`) and a
stub fitAddon (`{ fit: vi.fn() }`).

- `open()` appends a `.prefs-backdrop` and `.prefs-panel` to `document.body`,
  builds the form from `prefs`, and is idempotent (second `open` is a no-op).
- The font-family `<select>` lists every `FONT_FAMILIES` entry, with the
  current `prefs.fontFamily` selected.
- The theme `<select>` lists every `THEMES` key, with the current selected.
- Changing `fontSize` updates `terminal.options.fontSize` and calls
  `fitAddon.fit()`.
- Changing `theme` updates `terminal.options.theme` from `resolveTheme(prefs)`
  but does **not** re-fit (only fontSize/fontFamily refit).
- Changing `cursorStyle` / `cursorBlink` updates the matching xterm option
  without re-fitting.
- Each change calls `hook.pushEvent("update_terminal_prefs", …)` with the
  server-shaped (`localToServer`) payload.
- `updateThemePreview` writes resolved fg/bg onto `#pref-theme-preview` and
  sets the `$ echo "Hello, World!"` text.
- Backdrop click → panel removed from DOM after the 200 ms close animation
  (use fake timers and advance).
- `close()` clears the module-level `currentTerminal / currentHook` refs (next
  `open` accepts a fresh stub without stale state).

### 7. Extending `terminal_hook_fit_gates.test.js` (or a sibling file)

Keep `terminal_hook.js` un-imported (still too coupled). Add structural pins
that catch high-impact regressions cheaply:

- Source contains `setupResizeHandler`-style `resize` listener registration
  and the matching `removeEventListener` in `destroyed()` (catches a leak
  regression).
- Every `handleEvent("…")` call has a matching server-side push site (cross-
  check by listing event names — purely a smoke test).
- `viewportFitCols()` exists and is exported on the hook surface (referenced
  by `RestoreOrFitHook`).

These are cheap and catch the kind of refactor mistake that ends up in a
mobile drive report.

## Out of scope (deliberate)

- **Booting the real `LiveSocket`** — needs Phoenix JS in the dep tree and a
  running channel; the drive scripts already exercise this end-to-end.
- **Importing `terminal_hook.js`** — pulls in xterm + addons + Phoenix Socket
  under jsdom; the structural test plus the server/Android drive scripts cover
  this surface.
- **Snapshot testing of preferences-panel HTML** — too brittle; assert by
  query selector on the rendered DOM.
- **Visual / pixel tests** — handled by the chrome-devtools drive scripts.

## Conventions for new tests

- Colocate next to source: `foo.js` → `foo.test.js`.
- Open with a one-paragraph comment naming the user-visible behavior being
  pinned and (where relevant) the drive-report finding ID.
- `beforeEach(() => { document.body.innerHTML = ""; })` to reset jsdom.
- Stub Phoenix hook context with `Object.create(Hook)` + assigned
  `el / pushEvent / handleEvent / pushEventTo`. Don't mock the entire LiveView
  client.
- Use `vi.fn()` for `pushEvent`; assert by `toHaveBeenCalledWith(...)`.
- Use `vi.useFakeTimers()` only for timer-driven branches; restore in
  `afterEach`.

## Progress checklist

- [x] `js/preferences.test.js`
- [x] `js/hooks/quick_action_bar_hook.test.js`
- [x] `js/hooks/restore_or_fit_hook.test.js`
- [x] `js/hooks/notification_hook.test.js`
- [x] `js/hooks/pane_resize_hook.test.js`
- [x] `js/preferences_panel.test.js`
- [x] Structural additions to (or beside) `terminal_hook_fit_gates.test.js`
- [x] All new tests green under `npm test`
- [x] `mix precommit` clean (asset build + Elixir suite still pass)
