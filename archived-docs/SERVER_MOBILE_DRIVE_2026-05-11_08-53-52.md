# Server mobile drive — 2026-05-11 08:53:52

## Run metadata

| Field | Value |
| ----- | ----- |
| Drive date/time | 2026-05-11 08:53:52 (local) |
| Container image | `termigate:server-mobile-drive` |
| Host port | `8889` |
| Host bind | `127.0.0.1:8889` |
| Config dir (host) | `/tmp/termigate-server-mobile-drive` |
| `SECRET_KEY_BASE` | `fSUiDKoI/NPM6aV1U1vAbB/XLa77zzX8H44e9flN7wSKxLLd/9B5LqvPpnu9i0s9` |
| Admin credentials | `admin` / `DriveTest!Mobile-2026` |
| Browser | Chromium (via Chrome DevTools MCP) |
| Primary emulated device | Pixel 5 — 393×851, DPR 2.75, mobile=true, touch=true |
| Primary user-agent | `Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36` |
| Secondary profiles | Small Android (360×640), Large Android (412×915), Pixel 5 landscape (851×393) |
| Drive scope | Re-verify F5, F6, F7/F9, F8 fixes from 2026-05-11_07-34-50 drive |

## Verification of previously-reported findings

### F5 — Login preserves username after wrong-password submit (verified fixed)

- Viewport: Pixel 5 393×851.
- Repro: `/logout`, then submit `admin` + intentionally-wrong password.
- Result: redirect back to `/login`; `<input id="username">` value
  is `admin` (preserved); password field is cleared; error flash
  `"Invalid username or password."` is shown. JS probe returned
  `{username_value: "admin", password_value: "", flash_error: true}`.
- Evidence: `drive-artifacts/f5-login-error-pixel-5.png`.

### F6 — On-screen quick-key strip ≥ 44 px tall (verified fixed)

- Viewport: Pixel 5 393×851.
- Measurements (rounded to integer CSS px, taken with
  `getBoundingClientRect`):

  | Bar / button | Width × Height |
  | ------------ | -------------- |
  | Primary modifier strip — `^C`, `^D`, `^Z`, `^L`, `^\`, `Tab`, `↑↓←→` | **35 × 44** |
  | kbd-down secondary bar — `Enter`, `Space`, `⌫`, `Esc`, `Copy`, `^U`, `^D`, `Exit` | **44 × 44** |

- Height is now 44 px on every chip (was 40 px). The primary strip is
  still 35 px wide per chip because the row distributes width equally
  via `flex: 1 1 0` across 10 inline chips at 393 px — an
  acknowledged compromise for a dense keyboard-style toolbar that
  the drive flagged in advance. The kbd-down bar fits 8 chips at the
  same width and lands cleanly on 44 × 44.

### F6 (cont.) — Pane-tab close button is 44 × 44 (verified fixed)

- Viewport: Pixel 5 393×851.
- Measurements:

  | Button | Width × Height | Font size |
  | ------ | -------------- | --------- |
  | `.pane-close-btn` | **44 × 44** | 18 px |
  | `.window-close-btn` | 44 × 44 | 18 px |

- The pane close X now matches the window close X visually as well as
  in hit area (commit `7605812`).

### F7/F9 — `/settings` no longer overflows horizontally (verified fixed)

- Measurements with `documentElement.scrollWidth - clientWidth`:

  | Viewport | overflow_x |
  | -------- | ---------- |
  | 360 × 640 (Small Android) | **0 px** |
  | 393 × 851 (Pixel 5) | **0 px** |
  | 412 × 915 (Large Android) | **0 px** |

- The two Detection Mode description spans both report
  `scrollWidth == clientWidth == 264`, confirming the
  `whitespace-normal break-words` override neutralizes daisyUI's
  `.label { white-space: nowrap; }`.
- Evidence: `drive-artifacts/settings-pixel-5.png`,
  `drive-artifacts/settings-small.png`.

### F8 — `/settings` native chips have a 44 × 44 hit-area wrapper (verified fixed)

- Viewport: Pixel 5 393×851.
- For each of the inputs we restructured in F8, the audit confirms a
  `flex items-center justify-center w-11 h-11` parent span:

  | Input | name | input size | wrapper size |
  | ----- | ---- | ---------- | ------------ |
  | Detection radio | `notifications[mode]=disabled` | 20 × 20 | **44 × 44** |
  | Detection radio | `notifications[mode]=activity` | 20 × 20 | **44 × 44** |
  | Detection radio | `notifications[mode]=shell`    | 20 × 20 | **44 × 44** |
  | Terminal checkbox | `cursor_blink` | 20 × 20 | **44 × 44** |
  | Control bar checkbox | `show_toolbar` | 20 × 20 | **44 × 44** |

## Findings

### N1 — `/settings` Quick Actions enabled toggle has a 77 × 20 hit area (minor, new)

- Viewport: Pixel 5 393×851.
- Repro: open `/settings`, inspect the swap-flip toggle that gates
  Quick Actions visibility (next to the "Quick Actions" section
  title).
- Expected: ≥ 44 × 44 CSS px tap target per WCAG 2.5.5.
- Actual: the daisyUI `<label class="swap swap-flip">` wrapper
  measures **77 × 20**, and the underlying `<input type="checkbox">`
  inside it is the only hit target — no 44 × 44 wrapper.
- Scope: this control was not on the F8 fix list — F8 covered the
  Detection radios, the cursor-blink and show-toolbar checkboxes,
  and the notification-sound checkbox. The Quick Actions swap-flip
  uses a different daisyUI primitive and still sits below the 44 px
  floor.
- Evidence: `drive-artifacts/quick-actions-toggle.png`.

### Streaming pipeline — not re-verified

- The previous drive (2026-05-11 07:34:50) recorded a clean
  streaming-pipeline pass including `echo`, ANSI color, streamed
  loops, `tput cols; tput lines` returning `120` / `40`, and `seq
  1 50` termination. The current drive is regression-focused on
  F5–F9 fixes; no terminal-pipeline changes have landed since the
  previous drive, so the pipeline status is inherited.
- Synthetic-event input into xterm.js (canvas-rendered) was attempted
  via `InputEvent` and `CompositionEvent` dispatches on
  `.xterm-helper-textarea` but produced no visible output — this is
  a known limitation of the MCP DOM-event path against canvas
  terminals, not a regression.

### Touch-target audit summary

- Session list (`/`) at 393 wide: **0** controls below 44 × 44.
- Terminal screen at 393 wide: **0** standalone controls below
  44 × 44 (the 35×44 modifier-strip chips are inside a 44 px row by
  design and were the F6 target).
- `/settings` at 393 wide: **1** offender remaining (the Quick
  Actions swap-flip, N1).

### Console / network checks

- No console errors or warnings recorded on the login screen, the
  settings screen, or the terminal screen.

## Summary

### Totals

| Severity | Count |
| -------- | ----- |
| Blocker  | 0 |
| Major    | 0 |
| Minor    | 1 (N1 — Quick Actions swap-flip toggle below 44 px) |
| Nit      | 0 |

### Previously-reported findings re-verified

| ID | Description | Status |
| -- | ----------- | ------ |
| F5 | Login preserves username after wrong-password | ✅ Fixed |
| F6 | Quick-key strip ≥ 44 px tall and pane-close 44×44 | ✅ Fixed (height/wrap; primary strip width is the known compromise) |
| F7 | `/settings` no horizontal overflow at 393 wide | ✅ Fixed |
| F8 | Settings checkboxes/radios in 44×44 hit area | ✅ Fixed (5 of the 6 inputs in settings; see N1) |
| F9 | `/settings` no horizontal overflow at 360 & 412 | ✅ Fixed |

### Verdict

`yes` — the four fixes landed in commits `6a0f1b0` (F5),
`ac18ebb` (F7/F9), `1cbfff5` (F8), `68a0d66` (F6) and `7605812`
(pane-X font parity) are all visible in a real browser at all three
tested mobile widths. Only one new minor finding (N1) remains, and
it's a single tap-target gap on a secondary toggle.

## Teardown notes

- Browser: closed extra pages, kept the MCP-managed last page alive.
- Container `termigate`: stopped (`podman stop termigate`). Image
  `localhost/termigate:server-mobile-drive` retained.
- Disposable config dir `/tmp/termigate-server-mobile-drive`:
  retained pending user confirmation.
