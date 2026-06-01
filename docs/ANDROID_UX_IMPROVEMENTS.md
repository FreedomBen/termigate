# Android UX Improvements — Backlog

Mobile UX work landed on the **web client** since the Android app was last
touched, but was never ported to the native Android app. This document lists
every such change as a checklist so the Android app can catch up.

## Context

| Item | Value |
| --- | --- |
| Android baseline (last commit touching `android/`) | `4c54147` — *Default Android server URL to HTTPS and confirm cleartext* (2026-05-02) |
| Web HEAD at time of writing | `8770745` — *Render xterm panes with WebGL…* |
| Commits in range | 102 total · ~50 user-facing UX changes · rest are security/test/refactor/docs |

### Important: the Android app is a *native* client

The Android app (`android/app/`) is **not** a WebView wrapper. It is a native
Jetpack Compose UI talking to the server over a Phoenix WebSocket
(`PhoenixSocket.kt` / `PhoenixChannel.kt`) and rendering output with the Termux
`terminal-lib` emulator. **No web UX change reaches Android for free** — each
must be re-implemented in the corresponding Compose surface. The likely native
home for each theme is noted in its heading.

Existing native surfaces that mirror the web (natural homes for these ports):
`ui/login/LoginScreen.kt`, `ui/sessions/SessionListScreen.kt`,
`ui/settings/SettingsScreen.kt`, `ui/terminal/TerminalScreen.kt`,
`ui/terminal/QuickActionBar.kt`, `ui/terminal/SpecialKeyToolbar.kt`,
`ui/terminal/TerminalViewModel.kt`, and `terminal-lib/.../view/TerminalView.java`.

> **How to read this:** Each `- [ ]` is one web change to evaluate for Android.
> Tick it once the equivalent native behavior exists (or you've decided it does
> not apply). Web-only items that almost certainly **don't** apply to a native
> client are marked _(web-only — likely N/A)_ so you can skip them quickly.
> The Android equivalent of the web's 44 px tap-target target is **48 dp**
> (Material minimum touch target).

---

## 1. Touch-target sizing (44 px → use 48 dp on Android)

_Android home: every `ui/**/*Screen.kt` Compose surface; use `Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)` / `minimumInteractiveComponentSize`._

- [x] Grow terminal top-bar tap targets to 44×44 on mobile — `3102d61` — _(native: top bar uses Material3 `IconButton`s, already 48 dp)_
- [x] Raise Settings page tap targets to 44 px on mobile — `e1d05e2` — _(native: Add-Quick-Action and Logout buttons now `heightIn(min = 48.dp)`; edit/delete are 48 dp `IconButton`s)_
- [x] Raise login form tap targets to 44 px on mobile — `1b792cb` — _(native: Connect button now `heightIn(min = 48.dp)`; text fields are 56 dp, password toggle is a 48 dp `IconButton`)_
- [x] Lift control-bar and pane-close tap targets to 44 px on mobile — `68a0d66` — _(native: `ToolbarKey` now 48 dp via `defaultMinSize`; pane-close is N/A, app is single-pane)_
- [x] Enlarge login password-visibility toggle button to 44×44 — `5bda4e1` — _(native: it is a Material3 `IconButton`, already 48 dp)_
- [x] Enlarge setup password toggle buttons to 44×44 — `b3c56ef` _(setup is web-first-run; verify relevance)_ — _(N/A: native has no `/setup` screen; it connects to a configured server)_
- [x] Give the session-duration select a 44 px (`min-h-11`) touch height — `0987a75` _(setup screen)_ — _(N/A: setup-only, no native equivalent)_
- [x] Enlarge the flash/snackbar close button to 44×44 — `538df3c` — _(N/A: native shows transient errors via Material3 `Snackbar` / inline `Text`, neither has a custom close button to enlarge)_
- [x] Wrap settings checkboxes and radios in 44×44 hit areas — `1cbfff5` — _(native settings has no checkboxes/radios; toggles are 48 dp `Switch`es. Enlarged the closest analog — the Edit-Quick-Action color swatches — from 36 dp to 48 dp.)_
- [x] Match pane-tab close-X size to window-tab close-X — `7605812` — _(N/A: single-pane native app has no pane tabs; revisit with §5 if multi-pane lands)_

## 2. Mobile control bar / special-key toolbar

_Android home: `ui/terminal/SpecialKeyToolbar.kt` (+ defaults that mirror `config.ex`)._

- [ ] Move the control bar to the bottom of the screen, above the soft keyboard — `28ad19b`
- [ ] Pack the control bar onto a single row — `50e92d6`
- [ ] Move rare control keys to a `…` overflow popover when the bar is narrow — `b0705eb`
- [x] Add a **secondary** control bar shown when the soft keyboard is **down** — `0822875` — _(native: new `KeyboardDownBar` with Enter/Space/Backspace/Esc, shown via `AnimatedVisibility` when `!isKeyboardVisible`; tested in `KeyboardDownBarTest`)_
- [ ] On the secondary bar, replace y/n buttons with tmux copy-mode controls — `49f9a93`
- [ ] Hide the control bar entirely when the toolbar setting is off — `ea742a7`
- [x] Reorder arrow keys to ←, ↓, ↑, → and group all four together in toolbar defaults — `ec2b123` — _(native: reordered the four arrow `ToolbarKey`s in `SpecialKeyToolbar`)_
- [ ] Drop the removed `toolbar_buttons` config / legacy virtual toolbar (don't port the dead path) — `40771e3`

## 3. Quick Action bar

_Android home: `ui/terminal/QuickActionBar.kt`._

- [ ] Collapse the quick-action bar to a thin sliver instead of a full row — `cd43619`
- [ ] Fade the bar's edges to signal more pills are off-screen (scroll affordance) — `d1cd028`

## 4. Soft-keyboard behavior

_Android home: `ui/terminal/TerminalScreen.kt` / `TerminalViewModel.kt` (existing `RaiseSoftKeyboardTest.kt`)._

- [ ] Only open the soft keyboard on a tap — not on a scroll/drag — `904d16c`
- [ ] Don't open the keyboard when switching panes via a tab tap — `7e0237e`
- [ ] Block all non-tap focus that would raise the keyboard — `d7eb255`
- [ ] _(web-only — likely N/A)_ Detect the keyboard via a viewport baseline for Android browsers — `0853a41` _(native uses `WindowInsets`/IME insets instead)_

## 5. Pane navigation & multi-pane layout

_Android home: `ui/terminal/TerminalScreen.kt`, `TerminalViewModel.kt`._

- [ ] Add a mobile pane-tabs row for switching panes in multi-pane view — `de7558d`
- [ ] Render the terminal full-bleed on mobile when there is only one pane — `c758494`
- [ ] Hide the pane-resize divider overlay on mobile — `1ea82c4`
- [ ] Drop the active-pane border on mobile — `d26afb6`
- [ ] Restore horizontal scroll on the mobile active pane — `486730e`
- [ ] Hide pane overlay buttons on mobile; add a `+` split menu next to the pane tabs — `1d3bb9b`
- [ ] Make the new-pane `+` menu mirror the window-bar `+` placement — `22050e3`
- [ ] Add a close (X) button to each pane chip — `52cd4fb`
- [ ] Label each pane's input target with its pane number (a11y) — `40dc29f`

## 6. Gestures & navigation

_Android home: `ui/terminal/TerminalScreen.kt` / `ui/navigation/AppNavigation.kt`._

- [ ] Left-edge swipe gesture to navigate from a window back to the session list — `633e483`

## 7. Terminal rendering & touch-scroll performance

_Android home: `terminal-lib/.../view/TerminalView.java`, `ui/terminal/RemoteTerminalSession.kt`, `TerminalViewModel.kt`._

- [ ] Buffer pane output during an active touch (don't repaint mid-gesture) — `2ab76e0`
- [ ] Extend the output pause through momentum/inertial scroll — `5beaa76`
- [ ] Avoid resize listeners firing during a touch — `a2e7179`
- [ ] Pin the "no terminal resize on mobile" policy (mobile stays at fixed cols/rows) — `b630e3a` · see also `[[feedback_mobile_terminal_size]]`
- [ ] Defer the pane-focus change until `touchend` confirms a tap (not a scroll) — `15cf1f2`
- [ ] Skip pane-focus pushes that can't change the active pane — `d420fc8`
- [ ] _(web-only — likely N/A)_ Render panes with WebGL, falling back to Canvas then DOM — `8770745` _(native `TerminalRenderer` already draws to a Canvas/View)_

## 8. Scrollback

_Android home: `terminal-lib` scrollback + `ui/terminal/TerminalViewModel.kt`._

- [ ] Capture full tmux scrollback on pane attach — `e4c781a`
- [ ] Replace the Copy button with a Scroll / Exit-Scroll toggle — `84654fd`
- [ ] _(web-impl detail)_ Drive scrollback via the terminal emulator instead of tmux copy-mode — `0da0a49` _(native already has its own scrollback buffer; adopt the same UX, not the xterm.js mechanism)_

## 9. Login form

_Android home: `ui/login/LoginScreen.kt`, `ui/login/LoginViewModel.kt`._

- [ ] Add a password-visibility toggle to the login form — `435d5e8`
- [ ] Preserve the entered username after a failed login submit — `6a0f1b0`

## 10. Settings screen

_Android home: `ui/settings/SettingsScreen.kt`, `ui/settings/SettingsViewModel.kt`._

- [ ] Promote the mobile control-bar toggle to its own settings section — `7fbda47`
- [ ] Make the control-bar toggle apply on change (not only on submit) — `486ea05`
- [ ] Add explicit Save buttons to the Notifications and Mobile Control Bar sections — `fda0f97`
- [ ] Constrain Detection Mode descriptions so they wrap cleanly — `ab4eaad`
- [ ] Don't truncate notification descriptions (allow wrapping) — `ac18ebb`
- [ ] _(server-display)_ Label the config path as "in-container" when containerized — `d8e90ef` _(verify the native settings screen even shows a config path)_

## 11. Modals / confirmations _(web-only — likely N/A)_

The native client uses Compose dialogs, so the web's `<dialog>`-vs-assigns
mechanics don't transfer. Listed for completeness; only the *UX intent*
(server-confirmed destructive actions) matters.

- [ ] Drive confirm modals from server assigns instead of native `<dialog open>` — `49d2e81`
- [ ] Remove a closed confirm modal from the DOM instead of hiding it — `ac3a6c0`

## 12. First-run / setup landing _(web-only — verify relevance)_

The `/setup` flow is the server's first-run experience. A native client
connects to an already-configured server, so these likely don't apply.

- [ ] Render a first-run landing page on `/setup` instead of a bare 404 — `50add0e`

---

## Appendix A — Auth / transport changes that affect the native client

Not UX, but the native Phoenix client (`PhoenixSocket.kt`, `PhoenixChannel.kt`,
`AuthInterceptor.kt`, `AuthRepository.kt`) may **break or need updates** because
of these server-side auth changes. Review before/while porting UX.

- [ ] Sessions and bearer tokens are now bound to current credentials via an `auth_version` claim — tokens are invalidated when credentials change — `095573f`
- [ ] Channel-scope tokens are refreshed periodically so long-idle connections can rejoin — confirm the native client refreshes too — `a8444e3`
- [ ] Password hashing switched to `pbkdf2_elixir` with self-identifying hash strings (server-side; verify native login still authenticates) — `cbad11a`
- [ ] `/api/config` no longer returns `auth.password_hash` — don't depend on it — `6a77eb6`
- [ ] Session cookie `Secure` flag now resolved at runtime — `ba3ac95`
- [ ] _(web-only)_ `_csrf_token` is now sent on the `/socket` WebSocket upgrade for cookie auth — native uses bearer tokens, not cookies — `01a415c`
- [ ] `/metrics` restricted to loopback; `/setup` loopback gate dropped in favor of the one-shot token — `c7f0359`, `1aa12f9`

## Appendix B — Explicitly excluded (no Android impact)

Web-internal refactors, tests, docs, CI, container/deploy, and drive-test
artifacts in the range were excluded as not user-facing. Notable refactors:
rename `MultiPaneLive` → `WindowLive` (`4e4c0d3`) and removal of dead
single-pane code paths (`482dd23`).
