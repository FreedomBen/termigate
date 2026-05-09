# Manual Test Plan — termigate Web App

End-to-end manual test plan for the termigate browser UI. Exercises every feature, edge case, and error path on both desktop (≥ 1024 px wide) and mobile (≤ 640 px wide). Run the full suite before each release; run the affected sections after touching the relevant code.

## Conventions

- **Desktop viewport** — laptop or external monitor at ≥ 1280×800 unless noted. Test in Chrome, Firefox, and Safari.
- **Mobile viewport** — real iOS Safari and Android Chrome. DevTools device emulation is acceptable for layout checks but **does not** substitute for real-device input/keyboard/gesture verification.
- **Fresh state** unless noted means: tmux server stopped, `~/.config/termigate/config.yaml` deleted, browser cookies and `localStorage` cleared.
- **Authenticated state** unless noted means: setup completed, signed in, at least one tmux session running with one pane in one window.
- Steps are numbered. Expected results are bulleted. Anything unexpected is a defect — file a report with the section number.

---

## 1. Initial Setup From Scratch

This is the **most critical flow** in the entire plan: a brand-new user on a fresh machine must be able to install termigate, reach the setup page, create an account, and land in the session list. Run this section first and verify every step before moving on.

### 1.1 Prerequisites — fresh machine

On the host that will run termigate, confirm each of the following is installed:

| Tool | Min version | Verify with |
|---|---|---|
| Erlang/OTP | 26 | `erl -version` |
| Elixir | 1.16 | `elixir --version` |
| Node.js | 20 | `node --version` |
| tmux | 3.0 | `tmux -V` |
| git | any | `git --version` |

Expected:
- Every command above prints a version meeting the minimum.
- If any is missing, install it before continuing — the rest of the plan assumes a working toolchain.

### 1.2 Clean slate — wipe any prior state

Skip this section if the host has never run termigate. Otherwise, run from the repo root:

```bash
cd server
mix termigate.reset      # Removes config.yaml, password_hash, and persisted state
tmux kill-server || true # Ensures no lingering tmux state from a prior run
```

Also clear:

- The `TERMIGATE_AUTH_TOKEN` environment variable (`unset TERMIGATE_AUTH_TOKEN`).
- Any cookies for the host's origin in your browser (DevTools → Application → Cookies → Clear).
- `localStorage` entries under the same origin (DevTools → Application → Local Storage → Clear).
- Notification permissions for the origin (browser settings → Site settings).

Expected:
- `~/.config/termigate/config.yaml` (or the platform-specific equivalent reported by `Config.config_path()`) does not exist.
- `tmux ls` reports `no server running on /tmp/tmux-*/default`.
- `echo $TERMIGATE_AUTH_TOKEN` prints an empty line.

### 1.3 First-time install of dependencies

From a fresh clone of the repo:

```bash
cd server
mix setup
```

Expected:
- `mix setup` prints `* Getting ...` for each Elixir dep, runs the asset install, and exits with code 0.
- No `==> Compilation error in file ...` lines appear.
- The final lines indicate Tailwind and esbuild artifacts were generated under `priv/static/assets/`.
- Re-running `mix setup` is a no-op and still exits 0 (idempotent).

### 1.4 Start the server

```bash
cd server
mix phx.server
```

Expected:
- Console prints `[info] Running TermigateWeb.Endpoint with ...` and `Access TermigateWeb.Endpoint at http://localhost:8888`.
- No `[warning]` or `[error]` lines appear during boot.
- The process stays in the foreground; Ctrl-C twice exits cleanly.

### 1.5 Reach the setup page — desktop

1. In a desktop browser (Chrome, Firefox, or Safari at ≥ 1280×800), navigate to `http://localhost:8888/`.

Expected:
- You are redirected to `/setup`.
- The page renders the termigate logo, a "Create your account" (or equivalent heading) card, and a form with these fields:
  - Username (text input, autofocus)
  - Password (password input with visibility toggle)
  - Confirm password (password input with visibility toggle)
  - Session duration (dropdown defaulting to **1 week**, with options up to **1 year**)
  - "Create Account" submit button
- Hitting any of `/`, `/login`, `/settings`, `/sessions/foo` while no account exists also redirects to `/setup` — there is no way to bypass setup before creating an account.

### 1.6 Setup form validation

Try each of the following submissions one by one:

1. Submit an empty form.
2. Submit username only (passwords blank).
3. Submit username + a 1-character password.
4. Submit username + password but a different "Confirm password".
5. Submit a username with whitespace or special characters not in `^[a-zA-Z0-9_-]+$` (e.g. `bad name!`).

Expected for each:
- An inline error message appears explaining what is wrong.
- No `config.yaml` is created on disk (verify by checking the file path printed in server logs at boot).
- You remain on `/setup`.
- The username field's value is preserved across re-renders; password fields are cleared after a failed submit (verify against current behavior).

### 1.7 Successful setup — happy path

1. Submit a valid form: username `admin`, a strong password (≥ 12 chars, mixed case + digit + symbol), confirmed correctly, session duration **1 week**.

Expected:
- The form submits, the page redirects to `/post-setup` and then to `/` (session list).
- A flash confirms account creation OR the page silently lands on `/` already authenticated — verify against the current AuthController behavior.
- `~/.config/termigate/config.yaml` now exists, contains an `auth:` section with `username: admin`, `password_hash:` (a non-empty PBKDF2 hash string starting with the version prefix), and `session_ttl_hours: 168`.
- The plaintext password does **not** appear anywhere in `config.yaml` or in server logs.
- Session list page renders with the empty state ("No sessions yet") since tmux has no sessions yet.
- The browser cookie `_termigate_key` is set, marked `HttpOnly`, `SameSite=Lax`, and (under HTTPS) `Secure`.

### 1.8 Setup is unreachable after setup

1. While authenticated, navigate to `/setup` directly.
2. Sign out, then navigate to `/setup`.

Expected:
- Authenticated visit to `/setup` redirects to `/`.
- Unauthenticated visit to `/setup` redirects to `/login` (since an account already exists). No second account can be created through this route.

### 1.9 Restart persists the setup

1. Stop the server (Ctrl-C twice).
2. Start it again with `mix phx.server`.
3. Navigate to `http://localhost:8888/`.

Expected:
- You are NOT redirected to `/setup` again.
- If the cookie is still valid, you land on `/`. Otherwise, you land on `/login` and can sign in with the credentials from 1.7.

### 1.10 Setup with `TERMIGATE_AUTH_TOKEN` set

1. From a clean slate (run 1.2), set `export TERMIGATE_AUTH_TOKEN=test-token-1234567890`.
2. Start the server.
3. Visit `/`.

Expected:
- You are still redirected to `/setup` — the token does not bypass account creation for the web UI.
- After running through 1.7 to create an account, both the token (via `POST /api/login`) and the username/password (via `/login`) work as authenticators.

### 1.11 Setup — mobile viewport

1. From a clean slate (run 1.2), bring the server back up.
2. On a real iOS Safari and a real Android Chrome device, navigate to the server's URL.

Expected:
- Logo, card, all four inputs, and the "Create Account" button are fully visible without horizontal scroll.
- All inputs have ≥ 44×44 px tap targets.
- Soft keyboard appears on input focus and does not permanently obscure the submit button — the page scrolls as needed so the focused field stays visible.
- `autocomplete="username"` and `new-password` hints prompt the OS password manager to offer to save the new credentials.
- Submitting a valid form (username + matching passwords + TTL) lands you on `/` exactly like the desktop flow.

### 1.12 Setup error recovery

1. While on `/setup`, kill the server mid-submit (Ctrl-C twice in another terminal during the submit).

Expected:
- Browser shows a connection-failed page from Phoenix or the OS.
- Restart the server; reload the page; you are back on `/setup` with no half-written `config.yaml`.
- If `config.yaml` exists but is partially written or syntactically broken, the server should fail fast at boot with a clear error pointing at the file path. Operator action: run `mix termigate.reset` and re-run setup.

---

## 2. Authentication

### 2.1 Login — happy path

1. Sign out, then visit `/`.
2. Submit valid credentials.

Expected:
- Redirect from `/` → `/login` when unauthenticated.
- After submit, redirect to `/` and the session list renders.
- Browser cookie `_termigate_key` is set, marked `HttpOnly`, `Secure` (in HTTPS), `SameSite=Lax`.

### 2.2 Login — wrong credentials

1. Submit a wrong username, correct password.
2. Submit a correct username, wrong password.
3. Submit empty credentials.

Expected:
- Each attempt stays on `/login`, displays a generic "Invalid username or password" flash (no leak of which field was wrong), and logs an info-level failure server-side.

### 2.3 Login rate limiting

1. From a single IP, submit 6 wrong logins within 60 seconds.

Expected:
- The 6th attempt redirects back to `/login` with a flash "Too many login attempts. Please wait N seconds and try again."
- Response includes a `retry-after` header.
- After the cooldown elapses, valid credentials succeed.

### 2.4 Token-based login (API)

1. Set `TERMIGATE_AUTH_TOKEN=<random>` and restart the server.
2. `curl -X POST http://localhost:8888/api/login -d '{"username":"any","password":"<token>"}' -H 'content-type: application/json'`.

Expected:
- Returns `{"token": "...", "expires_in": <seconds>}`.
- Server log records `Login success: <token> from <ip>` (sentinel, not the supplied username).

### 2.5 Token-based login — wrong token

1. POST to `/api/login` with an invalid password.

Expected:
- Returns `401 {"error":"invalid_credentials"}`.

### 2.6 Logout

1. While authenticated, navigate to `/logout`.

Expected:
- Cookie session is cleared and you land on `/login`.
- Hitting back-button → `/` redirects to `/login`.

### 2.7 Session expiry / TTL

1. From `/settings`, set session duration to 1 hour, then reload.
2. Manually expire by modifying `_termigate_key` cookie age in DevTools, or wait the TTL.

Expected:
- After expiry, any LiveView navigation forces redirect to `/login`.
- WebSocket also disconnects on expiry; existing tab does not stay attached.

### 2.8 Auth version invalidation

1. Sign in, leave the tab open, then change password from a separate session (or `mix termigate.change_password`).
2. Interact with the original tab.

Expected:
- The original tab's bearer/cookie auth_version no longer matches; LiveView reconnect forces redirect to `/login`.

### 2.9 Login — mobile

1. Repeat 2.1 and 2.2 on iOS Safari and Android Chrome.

Expected:
- Logo, form, "Sign in" button all fit on screen without horizontal scroll.
- All buttons are ≥ 44×44 px.
- Password visibility toggle (eye icon) works and the icon swaps between show/hide states.
- Saved-password autofill works.

---

## 3. Session List (`/`)

### 3.1 Empty state — no sessions

1. Authenticate with tmux running but zero sessions.

Expected:
- Page shows "No sessions yet" empty state with a "New Session" call-to-action.
- Top-right shows Settings cog and Logout.

### 3.2 tmux server not running

1. Stop the tmux server (`tmux kill-server`) and refresh `/`.

Expected:
- Top of page shows a banner: "tmux is not running" (or similar `tmux_status` indicator).
- "New Session" button is shown but creating a session must still work — it should start tmux.

### 3.3 Listing existing sessions

1. With three tmux sessions (`alpha`, `beta-2`, `gamma_3`) running, refresh `/`.

Expected:
- Three rows are listed with name, attached/detached state, window count, last-active timestamp.
- Rows are sorted in a consistent order (by name or recency — verify it matches the spec in `APPLICATION_DESIGN.md`).

### 3.4 Live updates via PubSub

1. Open `/` in browser tab A.
2. From a terminal, run `tmux new -d -s live-test`.

Expected:
- Tab A updates within ~2 seconds without a manual refresh; the new session appears.
- Killing the session externally also removes the row live.

### 3.5 Create new session

1. Click "New Session". Type `proj_one`. Submit.

Expected:
- Form validates name as `^[a-zA-Z0-9_-]+$` only.
- On submit, session is created, you are navigated to `/sessions/proj_one`, and the WindowLive page renders with one pane.

### 3.6 Create session — invalid names

Try each: `with space`, `proj!`, empty string, `..`, an existing name.

Expected:
- Each shows an inline validation error and does not create the session.
- For an existing name: "A session with that name already exists."

### 3.7 Rename session

1. Click "rename" on `proj_one`. Edit to `proj_one_renamed`. Submit.

Expected:
- Inline validation matches 3.6.
- On success: flash `Session renamed to "proj_one_renamed"`, the row updates live.
- Any open WindowLive tab attached to the old name redirects/updates without dropping the WebSocket.

### 3.8 Rename — same name

Submit a rename with the same value as the current name.

Expected:
- No-op, modal closes silently, no error.

### 3.9 Kill session

1. Click "kill" on a session. Cancel the confirmation. Try again, confirm.

Expected:
- Cancel: nothing happens.
- Confirm: row disappears, attached WindowLive tabs (if any) get a "session no longer exists" empty state and a link back to `/`.

### 3.10 Attach to a session

1. Click a session row.

Expected:
- Navigate to `/sessions/<name>` and WindowLive renders the active window.
- All panes in that window appear in a CSS Grid mirroring tmux's geometry.

### 3.11 Session list — mobile

1. Repeat 3.1 through 3.10 on a phone.

Expected:
- Rows wrap cleanly; no horizontal scroll.
- Tap targets ≥ 44 px.
- Confirmation dialogs are reachable and dismissable without zooming.
- Logo/header bar does not overlap the first row.

### 3.12 Settings cog navigation from sessions list

Click the cog icon.

Expected:
- Navigate to `/settings`.

---

## 4. Window / Terminal View (`/sessions/:session/windows/:window`)

### 4.1 Single-pane window — basic streaming

1. Attach to a session with one pane in one window.
2. Wait for terminal to render.

Expected:
- xterm renders the pane's existing scrollback.
- Cursor is visible; cursor style matches the configured `cursor_style`.
- Page title is `<session> · termigate` (or similar — match implementation).
- The pane container fits the visible terminal area.

### 4.2 Keyboard input → tmux output

1. Click the terminal area. Type `echo hello`, press Enter.

Expected:
- Characters appear as you type (echoed by the shell).
- After Enter, `hello` appears on the next line.
- Input round-trip latency is sub-second on localhost.

### 4.3 Control characters

Type each: Ctrl-C, Ctrl-D (in a non-shell context, e.g. `cat`), Ctrl-Z, Ctrl-L, Ctrl-A/E/U, arrow keys, Tab.

Expected:
- Each control character is delivered to the pane:
  - Ctrl-C interrupts a running command.
  - Ctrl-L clears the screen.
  - Arrows move the shell cursor or scroll history.
  - Tab triggers shell completion.

### 4.4 Unicode and multibyte input

Paste/type: `日本語`, emoji `🚀`, accented `café`, RTL `שלום`.

Expected:
- All characters are rendered correctly in the terminal and the underlying shell variable receives the right bytes (verify with `printf '%s' "$VAR" | xxd`).

### 4.5 Paste — clipboard

1. Copy a multi-line snippet from outside the browser. Right-click → paste (or Ctrl/Cmd-V) into the terminal.

Expected:
- All lines are pasted; bracketed paste mode (if active in the shell) is honored.
- Newlines do not execute prematurely if bracketed paste is active.

### 4.6 Scrollback

1. Run a command producing > 1 screen of output. Scroll up via mousewheel/trackpad.

Expected:
- Scrolls through tmux's history (not just xterm's). All historical lines that existed before attach are visible, plus everything since.

### 4.7 Window tabs

1. From the WindowLive page, run `tmux new-window` in a connected pane.

Expected:
- A second window tab appears in the tab bar live (within a couple of seconds).
- Click it → page navigates to `/sessions/<name>/windows/<index>` and renders the new window's pane.
- The active tab is visually distinct.

### 4.8 Close window from tab

1. Click the close (×) on a window tab. Cancel; then confirm.

Expected:
- Cancel: nothing changes.
- Confirm: window is killed in tmux; tab disappears.
- If you close the last window, the session is killed and you are redirected to `/`.

### 4.9 New window button

1. Click the "+" / new-window control.

Expected:
- A new tmux window is created and the new tab becomes active.

### 4.10 Multi-pane layout — split horizontally

1. With one pane visible, run `tmux split-window -h` from inside that pane.

Expected:
- A second pane appears side-by-side, the CSS Grid template adjusts to the new geometry within ~1 s.
- Both panes stream independently.

### 4.11 Split vertically

1. Run `tmux split-window -v`.

Expected:
- Pane stacks vertically below the source pane.
- Geometry mirrors tmux's split.

### 4.12 Resize via divider

1. With ≥ 2 panes, drag the divider between them.

Expected:
- Cursor changes to col-resize / row-resize on hover.
- Drag updates pane sizes live; the underlying tmux pane is resized via `tmux resize-pane`.
- Release applies the size; the change persists across reload.

### 4.13 Maximize / restore a pane

1. Click the maximize control on a pane (or use the tmux-style toggle if one is shown).

Expected:
- That pane fills the grid; other panes are visually hidden but still streaming.
- Click restore → grid returns to multi-pane layout.

### 4.14 Active pane indicator

1. Click each pane in turn.

Expected:
- The clicked pane gains a visual "active" indicator (border/glow).
- Quick-action buttons and the control-signal bar light up (no longer `disabled`) once a pane is active.
- Keyboard input only goes to the active pane.

### 4.15 Kill pane

1. Type `exit` (or Ctrl-D) in a pane to end its shell, OR use the kill-pane control if exposed.

Expected:
- That pane disappears from the grid; remaining panes re-fit.
- Killing the last pane in the last window destroys the session and redirects to `/`.

### 4.16 Empty window state

1. Force a window with zero panes (rare; usually impossible — verify by killing all panes faster than the LayoutPoller refresh).

Expected:
- The empty-state UI shows: "No panes in this window" with a Back-to-Sessions button.

### 4.17 Quick action bar — desktop

1. With at least one quick action configured (default config has Clear, Disk Usage, etc.), click "Clear" while a pane is active.

Expected:
- The command (`clear\n`) is sent to the active pane and the screen clears.

### 4.18 Quick action with confirm

1. Configure a quick action with `confirm: true`. Click it.

Expected:
- A "Run X on pane?" confirm bar appears.
- Confirm runs the command; Cancel dismisses without sending.

### 4.19 Quick action with no active pane

1. Reload the page so no pane is active. Try clicking a quick action.

Expected:
- Buttons are visually disabled (`btn-disabled opacity-40`) and clicks are no-ops.
- Hint text "click a pane to activate" is visible (desktop).

### 4.20 Quick action bar — collapsed/expanded

1. Click the chevron on the quick action bar to collapse/expand.

Expected:
- Bar collapses to a thin chevron strip when hidden; clicks expand it again.
- State persists across reload via `localStorage`.

### 4.21 Control signal bar (mobile/tablet)

1. On a mobile viewport, attach to a pane. Tap each control chip in turn (Esc, Tab, Ctrl, Alt, ↑/↓/←/→, etc.).

Expected:
- Each chip sends the corresponding key to the active pane.
- Bar is fixed near the bottom (above the soft keyboard area).
- When the bar is too narrow, low-priority chips collapse into a `…` overflow popover that mirrors them.

### 4.22 Toolbar disabled

1. From `/settings`, turn off "Show toolbar" (terminal.show_toolbar = false). Reload.

Expected:
- The control signal bar is gone on all viewports.

### 4.23 Bars-group toggle

1. Click the `bars-toggle-btn` chevron at the top of the WindowLive page.

Expected:
- Tabs and control bar collapse together; clicking again expands them.

### 4.24 Mobile keyboard toggle

1. On a phone (or with `window.innerWidth < 640`), tap the on-screen-keyboard icon in the top bar.

Expected:
- Toggling OFF: the soft keyboard does not appear when you tap the terminal; the icon shows a red "no" overlay.
- Toggling ON: tapping the terminal opens the soft keyboard normally.
- State persists across navigation/reload.

### 4.25 Mobile pane switch via tabs

1. With ≥ 2 panes on mobile, only one pane is visible. Tap a different pane's tab.

Expected:
- The grid swaps to show the tapped pane (`data-mobile-visible` attribute updates).
- Soft keyboard does not open on switch (programmatic focus is suppressed).
- Real direct tap on the visible terminal still focuses and opens the keyboard.

### 4.26 Edge swipe back

1. On mobile, from inside `/sessions/...`, swipe right from the left screen edge.

Expected:
- Page navigates back to `/` (matching `EdgeSwipeBackHook` behavior).
- Swipe from non-edge does nothing.

### 4.27 Pane fits viewport on resize

1. Rotate the phone from portrait to landscape.
2. On desktop, drag the browser window narrower then wider.

Expected:
- The xterm fit re-runs and the pane fills the available area cleanly with no scrollbars or clipped lines.
- tmux pane is resized to match (`tmux list-panes` shows new dimensions).

### 4.28 Multiple viewers on the same pane

1. Open the same WindowLive URL in two browsers (or one normal + one incognito).
2. Type in one.

Expected:
- Both browsers show the same output simultaneously.
- Either browser can send input; both receive the echo.

### 4.29 Reattach captures scrollback

1. Reload a WindowLive page that already has output on screen.

Expected:
- All visible scrollback is captured from tmux on reattach (initial render shows past output, not blank).

### 4.30 Resilience — temporary network loss

1. While streaming output, disable network for ~10 seconds, then re-enable.

Expected:
- Top progress bar (`topbar`) shows reconnecting.
- Once reconnected, output resumes; recent output produced during the gap is replayed from the ring buffer.
- No duplicate lines appear.

### 4.31 Long idle → channel scope refresh

1. Leave a WindowLive tab idle for > 5 minutes.
2. Type something.

Expected:
- Channel scope token has been refreshed in the background (every ~4 minutes).
- Input still flows; no "invalid scope token" error.

### 4.32 Direct URL — non-existent session

1. While authenticated, visit `/sessions/does-not-exist`.

Expected:
- Page shows "Session not found" empty state OR redirects to `/`. Verify against current behavior.

### 4.33 Direct URL — non-existent window

1. Visit `/sessions/<existing>/windows/9999`.

Expected:
- Empty state or fallback to the first window — match the current spec.

### 4.34 Notification — idle pane

1. Set `notifications.mode = activity`, threshold 5s. Run a command that prints output, then leaves the pane idle.

Expected:
- After 5 seconds of no output, browser shows a desktop notification (if notification permission granted).
- Sound plays if `sound = true`.

### 4.35 Notification — shell mode (requires bash ≥ 4)

1. Set `notifications.mode = shell`. Source the provided snippet in the pane's shell.
2. Run a long command and let it complete.

Expected:
- A notification fires when the command completes (not on idle).
- Settings page reports bash version and shell-integration status.

### 4.36 Notification permission gate

1. With browser notification permission denied or default, set notifications to activity.

Expected:
- App prompts for permission via `NotificationPermission` hook.
- If denied, nothing fires (no error spam).

---

## 5. Settings (`/settings`)

### 5.1 Page renders

1. Navigate to `/settings`.

Expected:
- Sections are visible: Account / Password, Session duration, Quick actions, Terminal preferences, Notifications, Config file location, Reset.
- "Run inside container" notice is shown if `Config.container?()` is true.

### 5.2 Change password — happy path

1. Enter current password, new password (≥ minimum length), confirm new password. Submit.

Expected:
- Flash: "Password changed. Please log in again with your new password."
- Redirects to `/logout`.
- Re-login with the old password fails; new password succeeds.

### 5.3 Change password — wrong current

Expected:
- Flash: "Current password is incorrect."
- Form retains entered values (or clears, depending on UX).

### 5.4 Change password — mismatch / weak

Expected:
- Inline validation; submit button does not invoke `change_password`.

### 5.5 Update session TTL

1. Change dropdown from 1 week to 1 day. Submit.

Expected:
- Flash: "Session duration updated."
- New cookies issued from this point have the new max-age.

### 5.6 Quick actions — list

1. With default config, observe the actions list.

Expected:
- Five default actions visible: Clear, Disk Usage, Top, Git Status, etc.
- Each row shows label, command preview, color, icon, confirm-required indicator, move-up/move-down/edit/delete.

### 5.7 Add quick action

1. Click "Add". Fill label `Hello`, command `echo hello`, color blue, icon terminal, confirm off. Save.

Expected:
- New action appears at the end of the list.
- Visiting WindowLive shows the new button in the quick-action bar.

### 5.8 Add quick action — validation

Empty label, empty command, command > 4096 chars, invalid color, invalid icon.

Expected:
- Each fails with a clear inline error. Save button does nothing for invalid forms.

### 5.9 Edit quick action

1. Click edit on `Hello`. Change command to `echo updated`. Save.

Expected:
- Action updates; WindowLive button reflects the new command.

### 5.10 Delete quick action

1. Click delete on `Hello`. Confirm.

Expected:
- Action vanishes; flash "Quick action deleted."

### 5.11 Reorder

1. Click move-down on the first action.

Expected:
- Order persists in `config.yaml`.

### 5.12 Toggle quick actions globally

1. Toggle "Quick actions enabled" off.

Expected:
- WindowLive no longer renders the quick-action bar.

### 5.13 Terminal — font size

1. Change font size slider from 14 to 20.

Expected:
- Live preview updates if shown.
- Reload WindowLive → text renders at the new size; pane re-fits.
- Out-of-range values (< 8 or > 32) are clamped.

### 5.14 Terminal — font family

1. Change to e.g. `"Fira Code", monospace`.

Expected:
- WindowLive reflects the change after reload.
- Empty value falls back to `monospace`.

### 5.15 Terminal — theme

1. Cycle through dark, light, solarizedDark, solarizedLight, custom.

Expected:
- Each theme applies on reload of WindowLive.
- For `custom`, the custom-theme color pickers are revealed and applied.

### 5.16 Terminal — cursor style and blink

1. Toggle cursor style (block / underline / bar) and blink on/off.

Expected:
- WindowLive cursor reflects each change after reload.

### 5.17 Show toolbar

1. Toggle off.

Expected:
- The control signal bar is removed from WindowLive.

### 5.18 Mobile keyboard enabled

1. Toggle off.

Expected:
- On a mobile viewport, tapping the terminal does not open the soft keyboard.
- Setting persists across reload.

### 5.19 Notifications — disabled (default)

Expected:
- Mode dropdown shows Disabled. No threshold/min-duration inputs are interactive (or hidden).

### 5.20 Notifications — activity mode

1. Set mode = Activity. Adjust idle threshold and min duration.

Expected:
- Inputs are validated as positive integers.
- Settings persist; PaneStream behavior changes (see 4.34).

### 5.21 Notifications — shell mode + bash check

1. Set mode = Shell.

Expected:
- Bash version is detected and shown.
- If bash < 4, an "unsupported" warning appears with a link to upgrade.
- Snippet for bash/zsh/fish is shown for copy.

### 5.22 Reset settings

1. Scroll to "Reset" section. Click reset, confirm.

Expected:
- Quick actions, terminal prefs, notifications return to defaults.
- Account credentials are NOT touched.
- Flash confirms reset.

### 5.23 Config file path / container note

1. Verify the displayed config path matches `Config.config_path()` on the host.
2. If running in a container, confirm the container notice is shown.

### 5.24 Live config reload

1. While `/settings` is open in tab A, edit `config.yaml` directly (e.g. change `font_size`).

Expected:
- Within ~2 s, tab A's form fields update (no reload required).

### 5.25 Settings — mobile

1. Repeat 5.1 through 5.23 on a phone.

Expected:
- All form rows wrap; tap targets ≥ 44 px.
- Sliders / dropdowns are usable with thumb input.
- Color pickers (custom theme) render and respond to touch.

---

## 6. Mobile-Specific Behaviors

### 6.1 Tap-to-focus rules

1. On a phone, with multiple panes, tap the inactive pane's tab.

Expected:
- Pane swap happens, but soft keyboard does NOT open. (Programmatic focus is blocked unless the user directly taps the terminal cells.)

2. Then directly tap the visible terminal cells.

Expected:
- Soft keyboard opens.

### 6.2 Tap targets — top bar

1. Inspect "Sessions" link, on-screen-keyboard toggle, settings cog.

Expected:
- Each is ≥ 44×44 px hit area (matches `mobile_top_bar_tap_targets.test.js`).

### 6.3 Tap targets — login

Expected:
- Username, password, eye toggle, sign-in button all ≥ 44×44 px.

### 6.4 Tap targets — settings

Expected:
- Every interactive element on `/settings` ≥ 44×44 px.

### 6.5 Mobile control bar position

1. Open the soft keyboard on a phone.

Expected:
- Control signal bar repositions to sit above the keyboard, not behind it.

### 6.6 Viewport sizing

1. Verify `meta name="viewport"` includes `viewport-fit=cover` and the iOS safe-area insets are respected (no clipping behind the notch).

### 6.7 Pinch-zoom

1. Try pinch-zoom on the terminal.

Expected:
- Disabled — the terminal stays at native font scale (the page should not double-zoom xterm).

### 6.8 Fixed terminal size on mobile

Expected:
- On mobile, the pane is held at 120×40 cols/rows (this is intentional, not a bug).

### 6.9 Edge swipe back from WindowLive → SessionList

See 4.26.

### 6.10 PWA / standalone mode (if installable)

1. If a manifest exists, "Add to Home Screen" on iOS/Android. Launch from icon.

Expected:
- App opens in standalone mode without the browser chrome.
- All flows still work.

---

## 7. API Endpoints (smoke tests)

| Endpoint | Method | Auth | Test |
|---|---|---|---|
| `/healthz` | GET | none | Returns `200 ok` |
| `/metrics` | GET | optional `TERMIGATE_METRICS_TOKEN` | Returns Prometheus exposition text; 401 if token configured and missing |
| `/api/login` | POST | none, rate-limited | See 2.4, 2.5 |
| `/api/sessions` | GET | bearer token | Returns JSON list of sessions |
| `/api/sessions` | POST | bearer token | Creates session; rejects invalid name |
| `/api/sessions/:name` | DELETE | bearer token | Kills session; 404 for unknown |
| `/mcp/*` | various | bearer token, rate-limited | MCP StreamableHTTP endpoint accepts MCP client; 401 without token |

For each authenticated endpoint, also verify:
- Missing/invalid bearer token returns 401.
- Rate limit returns 429 with `retry-after` header.

---

## 8. Error Handling and Recovery

### 8.1 Server restart while connected

1. With a WindowLive tab open, restart `mix phx.server`.

Expected:
- Topbar shows reconnecting.
- After server is back, WebSocket reconnects, scrollback re-captures, you remain authenticated.

### 8.2 tmux killed while connected

1. With WindowLive open, run `tmux kill-server` on the host.

Expected:
- The pane shows "session no longer exists" (or empty-state); navigating back to `/` works.
- Session list shows tmux-down banner.

### 8.3 Pane crashes externally

1. From a separate terminal, kill the pane's underlying process group.

Expected:
- The pane disappears from the grid in the browser within ~2 s.

### 8.4 LiveView crash recovery

1. Force a server-side crash (e.g. through a bug or unsupported route).

Expected:
- LiveView reconnect is automatic; no white-screen of death; user lands either on the same page or `/login` if auth was lost.

### 8.5 Browser back/forward navigation

1. From `/sessions/<name>` press browser back.

Expected:
- Returns to `/`; sessions list is up-to-date.
- Forward returns to `/sessions/<name>` with the same active window.

### 8.6 Browser refresh on every page

1. Hard-refresh `/`, `/login`, `/setup`, `/settings`, `/sessions/<name>`, `/sessions/<name>/windows/<n>`.

Expected:
- No 500s; auth state is preserved (or redirected appropriately).

### 8.7 404 pages

1. Visit a non-route like `/nonsense`.

Expected:
- 404 status + plain-text "Not Found" message (matches `ErrorHTML`).

### 8.8 CSRF protection on web login

1. Try `curl -X POST /login` without the CSRF token.

Expected:
- Phoenix rejects the request with a CSRF error.

### 8.9 Long-poll fallback

1. Block WebSockets in DevTools (set `WebSocket` to throttle/disable).

Expected:
- LiveSocket falls back to long-poll within `longPollFallbackMs` (2500 ms) and continues working.

### 8.10 Multiple tabs of same WindowLive

See 4.28 — both tabs stay in sync, neither breaks the other on disconnect.

---

## 9. Cross-Browser

Run the full plan once on each, with at least Sections 2, 3, 4, 5, 6 fully covered:

| Browser | Desktop | Mobile |
|---|---|---|
| Chrome / Chromium |  Yes |  Yes (Android) |
| Firefox |  Yes | Spot-check |
| Safari |  Yes |  Yes (iOS) |
| Edge | Spot-check | — |

Note browser-specific defects (font rendering, keyboard handling, clipboard quirks) per row.

---

## 10. Sign-Off Checklist

- [ ] All sections above pass on the latest `main`.
- [ ] No console errors during any flow (open DevTools, watch network and console).
- [ ] No unexpected server logs above `:warning` level during a normal run.
- [ ] `mix precommit` passes locally.
- [ ] `mix test` passes locally.
- [ ] One real-device pass on iOS Safari and one on Android Chrome.
