# Server mobile drive — 2026-05-11 07:34:50

## Run metadata

| Field | Value |
| ----- | ----- |
| Drive date/time | 2026-05-11 07:34:50 (local) |
| Container image | `termigate:server-mobile-drive` |
| Host port | `8889` |
| Host bind | `127.0.0.1:8889` |
| Config dir (host) | `/tmp/termigate-server-mobile-drive` |
| `SECRET_KEY_BASE` | `gdy5MvEKEvqxlWC1DiPv764Leev952Y7qU/eYWqr8qecvJB46eX1mpDrBcjVleRd` |
| Admin credentials | `admin` / `DriveTest!Mobile-2026` |
| Browser | Chromium (via Chrome DevTools MCP) |
| Primary emulated device | Pixel 5 — 393×851, DPR 2.75, mobile=true, touch=true |
| Primary user-agent | `Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36` |
| Secondary profiles | Small Android (360×640), Large Android (412×915), Pixel 5 landscape (851×393) |

## Progress

- [x] **F1** — Setup show/hide password toggles 40×40 → 44×44 (commit `b3c56ef`)
- [x] **F2** — Setup session-duration select 40 px → `min-h-11` (commit `0987a75`)
- [x] **F3** — Login show/hide password toggle 40×40 → 44×44 (commit `5bda4e1`)
- [x] **F4** — Flash close button (login error alert) → 44×44 (commit `19e2ebc`)
- [x] **F5** — Login form preserves username after wrong-password submit (commit `6a0f1b0`)
- [x] **F6** — On-screen quick-key strip controls below 44 px (modifier keys 35–44×40, tab close 28×28)
- [x] **F7** — `/settings` 275 px horizontal overflow at 393 width (commit `ac18ebb`)
- [x] **F8** — `/settings` native checkboxes and radios 20×20 (commit `1cbfff5`)
- [x] **F9** — `/settings` overflow at 360 & 412 widths — same root cause as F7 (commit `ac18ebb`)

## Findings

### F1 — Password show/hide toggle buttons are 40×40 on the setup form (minor)

- Viewport: Pixel 5 393×851 (touch profile).
- Repro:
  1. Open `/setup?token=<token>` on a 393 px touch viewport.
  2. Inspect the two "Show password" buttons next to the Password and Confirm Password fields.
- Expected: touch targets ≥ 44×44 CSS px (Apple HIG, Material Design, WCAG 2.5.5).
- Actual: both buttons measure 40×40 CSS px.
- Evidence: `drive-artifacts/setup-pixel-5.png`. Audit JS returned
  `[{tag:"BUTTON", w:40, h:40}, {tag:"BUTTON", w:40, h:40}]`.

### F2 — Session-duration `<select>` on setup is 40 px tall (nit)

- Viewport: Pixel 5 393×851.
- Repro:
  1. Open `/setup?token=<token>`.
  2. Inspect the "Session Duration" select.
- Expected: ≥ 44 px tall to match the touch-target standard. Width is
  fine (312 px), but height is short for a touch primary control.
- Actual: 312×40 CSS px. The native picker opens correctly, so this is
  cosmetic.
- Evidence: audit JS, `drive-artifacts/setup-pixel-5.png`.

### F3 — Login show/hide-password toggle is 40×40 (minor)

- Viewport: Pixel 5 393×851.
- Repro:
  1. Open `/login`.
  2. Inspect the "Show password" button next to the password field.
- Expected: ≥ 44×44 CSS px.
- Actual: 40×40 CSS px. State toggles correctly between password and
  text — only the tap target is the issue.
- Evidence: `drive-artifacts/login-pixel-5.png`, audit JS returned
  `[{tag:"BUTTON", text:"Show password", w:40, h:40}]`.

### F4 — Login error-alert close (✕) is 20×21 (minor)

- Viewport: Pixel 5 393×851.
- Repro:
  1. Open `/login`, submit with a wrong password.
  2. Inspect the close button inside the resulting "Invalid username or
     password." alert.
- Expected: ≥ 44×44 CSS px so a user can dismiss the alert without
  fat-fingering nearby form controls.
- Actual: 20×21 CSS px. The error message itself is clearly displayed
  above the form and not pushed off-screen — only the dismiss target
  is undersized.
- Evidence: `drive-artifacts/login-error-pixel-5.png`.

### F5 — Login form clears both fields after a wrong-password submit (minor)

- Viewport: Pixel 5 393×851 (likely applies to desktop too).
- Repro:
  1. Open `/login`, type a username and an intentionally wrong password.
  2. Submit.
  3. Observe both inputs are blanked.
- Expected: at minimum, preserve the username so the user only has to
  retype the password. Common UX; particularly important on mobile
  where re-typing is awkward.
- Actual: both username and password are cleared, focus moves back to
  the username field.

### Streaming-pipeline verification (positive)

- Profile: Pixel 5 393×851, touch.
- Drive sequence: `echo hello-termigate` → expected output, `pwd` →
  `/home/termigate`, `printf '\\033[31mRED\\033[0m\\n'` → red `RED`,
  `for i in 1..5; do echo $i; sleep 0.2; done` → streamed `1 2 3 4 5`,
  `tput cols; tput lines` → **`120` / `40`** (fixed mobile size, by
  design — see memory note), `seq 1 50` → terminated at `50`.
- Screenshot: `drive-artifacts/terminal-streaming-pixel-5.png`.
- Console errors: none. XHR/fetch failures: none observed.

### F7 — `/settings` has 275 px of horizontal overflow at 393 width (major)

- Viewport: Pixel 5 393×851.
- Repro:
  1. Log in, navigate to `/settings`.
  2. Run
     `document.documentElement.scrollWidth > document.documentElement.clientWidth`
     in the console.
- Expected: no horizontal overflow on a primary screen.
- Actual: `scrollWidth=668, clientWidth=393` → 275 px of horizontal
  scroll. Walking the tree, the offender is the "Detection Mode"
  radio descriptions in the **NOTIFICATIONS** section. The descriptive
  text under "Activity-based" and "Shell integration" is rendered in
  a span (`text-xs text-base-content/40 block`) whose `scrollWidth`
  reaches 600 px because the long sentence
  "Precise command detection with name, exit code, and duration.
  Requires shell setup." is not wrapping inside a `min-w-0` flex item.
  The overflow propagates up through `<form class="space-y-4">` →
  `<div class="settings-section">` → `<html>` (all
  `overflow-x: visible`).
- Likely fix: add `break-words` (or `wrap-anywhere`) on those
  description spans, OR remove the implicit `nowrap` ancestor (the
  flex item already has `min-w-0`).
- Evidence: `drive-artifacts/settings-pixel-5.png`, JS audit results
  inline above.

### F8 — `/settings` checkboxes and radios are 20×20 (minor)

- Viewport: Pixel 5 393×851.
- Repro: Open `/settings`, inspect any `<input type=checkbox>` or
  `<input type=radio>`.
- Expected: tap target ≥ 44×44 CSS px. Even if the visual indicator is
  smaller, the hit-test area (via padded label or `::before`) should
  cover 44 px.
- Actual: native input elements are 20×20 with no enlarged hit
  region. The radios in "Detection Mode" and the checkboxes
  ("Cursor blink", "Show the control bar", "Enabled/Disabled") are
  all in this category.
- Note: tapping the *label text* might still toggle, but the input
  itself fails the touch-target check.

### F6 — On-screen quick-key strip controls are below 44 px (minor)

- Viewport: Pixel 5 393×851.
- Repro: Attach to any session, inspect the modifier-key row
  (^C ^D ^Z ^L ^\ Tab ↑ ↓ ← → Enter Space ⌫ Esc Copy ^U ^D Exit).
- Expected: ≥ 44×44 CSS px for primary touch controls.
- Actual: each modifier key is 35×40 (arrow / control keys) or 44×40
  (Enter / Space / ⌫ / Esc / Copy). The "Close 0 bash" tab-close X is
  28×28. Audit returned 22 sub-44 controls on this screen overall.
- Note: a dense keyboard-style strip is an understood compromise, but
  the height of 40 is consistently below WCAG 2.5.5's 44 px guideline.
  Worth a single pass to bump to 44.

### Lifecycle / quick-action bar (positive)

- Re-attach to `drive-test` after navigating away preserved all
  scrollback (`seq` output through `df -h` output, 40 rows) and the
  prompt position — Pixel 5 portrait.
- Quick-action pill **Disk Usage** correctly executed `df -h` and
  rendered the result.
- Quick-action pill sizes at 393 width:
  Disk Usage 101×44, System Info 108×44, Top 55×44, Git Status 101×44.
  The bar scrolls horizontally (overflow on the *bar*, not the
  page) — that's correct; the rightmost pill is clipped by ~70 px as
  the affordance hint.
- "Kill Session" from the session-list disclosure menu fired a
  confirmation modal, and the list updated within one second of the
  Confirm (PubSub `{:sessions_changed}` path works).
- Orientation rotate to 851×393 landscape kept the session attached
  and the terminal rendered cleanly. The modifier-key strip is
  *hidden* in landscape on the touch profile — the layout assumes
  the system keyboard is no longer needed.

### F9 — `/settings` overflow reproduces at every tested mobile width (major, same root cause as F7)

- Viewports tested:
  - Small Android 360×640 → `scrollWidth=668, clientWidth=360` → **308 px overflow**.
  - Pixel 5 393×851 → **275 px overflow** (F7 above).
  - Large Android 412×915 → `scrollWidth=668, clientWidth=412` → **256 px overflow**.
- All three carry the same offender (NOTIFICATIONS radio descriptions
  forcing the form to 632 px wide). Fixing F7 should resolve overflow
  at every mobile width; the absolute layout never collapses below
  ~668 px.
- Evidence: `drive-artifacts/settings-{small,pixel-5,large}.png`.

### Responsive design at 360 width (positive)

- The modifier-key strip on the session screen at 360 width
  intelligently collapses: it hides the secondary control keys
  (`^Z ^L ^\\`) and exposes them behind a "More control keys"
  disclosure. The visible row stays single-line at 360 px.
- Session list, terminal, and (after the F7 fix) login/setup all
  render cleanly at 360 with no horizontal scroll.

## Summary

### Totals

| Severity | Count |
| -------- | ----- |
| Blocker  | 0     |
| Major    | 2 (F7, F9 — same root cause: `/settings` overflow) |
| Minor    | 5 (F1, F3, F4, F5, F6, F8) |
| Nit      | 1 (F2) |

(F9 is listed separately because it documents reproduction at the
other two tested viewports, but it shares its fix with F7.)

### Mobile-specific finding breakdown

- **Touch targets < 44 px:** F1 (setup show-password 40×40),
  F3 (login show-password 40×40), F4 (login error close 20×21),
  F6 (terminal modifier strip 35–44×40, tab close 28×28),
  F8 (`/settings` native checkboxes / radios 20×20).
- **Horizontal overflow:** F7/F9 — `/settings` overflows by
  256–308 px across all three mobile viewports tested.
- **Layout / form ergonomics:** F2 (setup duration select 40 px tall),
  F5 (wrong-password login clears username too).
- **Soft-keyboard / virtual-keyboard interaction:** none observed —
  the body `kbd-open` class shows the soft-keyboard detector fires
  (commit `0853a41`), and the secondary control bar (commit `0822875`)
  appears with the OSK as designed. The "Toggle on-screen keyboard"
  control is present at every tested viewport.
- **Orientation:** rotation to landscape preserves session state and
  doesn't break the terminal; the modifier strip's portrait-only
  visibility is plausibly intentional.

### Top 3 user-impacting issues on mobile

1. **F7/F9 — `/settings` horizontal overflow.** A primary
   configuration screen forces a horizontal scrollbar on every
   common Android width because the NOTIFICATIONS radio descriptions
   don't wrap. Visible immediately; high-impact for first-time setup.
2. **F4 — Login-error close button is 20×21.** Smallest tap target on
   any auth screen, placed near other form controls — easy to
   mis-tap.
3. **F1 / F3 — Show-password toggle buttons are 40×40 on both setup
   and login.** Borderline-too-small on the only password fields the
   user ever sees.

### Verdict

`yes-with-caveats`. The streaming pipeline, auth flow, session
lifecycle, and quick-action bar all work cleanly on Android-sized
viewports. However, the `/settings` overflow (F7/F9) is a visible
defect on a primary surface, and a one-line wrap fix should land
before promoting this build to mobile users.

## Teardown notes

- Browser: closed all but the last page (the MCP server keeps one
  page alive).
- Container `termigate`: stopped (`podman stop termigate`). Image
  `localhost/termigate:server-mobile-drive` retained for cache reuse.
- Disposable config dir `/tmp/termigate-server-mobile-drive`: removed
  (`rm -rf`) after user confirmation. Temp secret-key file and run
  log under `/tmp/` also cleaned up.



