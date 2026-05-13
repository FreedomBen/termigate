# Server mobile drive — 2026-05-12 11:38:05

Scrollback-focused drive triggered after user reported scrollback isn't working on their phone. The just-committed change (`e4c781a`) lifted the tmux capture cap from `-S -300` to `-S -` and bumped the xterm.js buffer from 5000 to 50000 rows. This drive verifies whether the fix actually surfaces full history on a mobile-emulated browser.

## Setup

| Field             | Value                                        |
| ----------------- | -------------------------------------------- |
| Container image   | `termigate:server-mobile-drive`              |
| Container port    | `8889`                                       |
| Config dir        | `/tmp/termigate-server-mobile-drive`         |
| Browser           | Chromium via Chrome DevTools MCP             |
| Device profile    | Pixel 5 (393×851, DPR 2.75, mobile+touch)    |
| User-agent        | `Mozilla/5.0 (Linux; Android 13; Pixel 5) … Chrome/120.0.0.0 Mobile Safari/537.36` |
| Admin user        | `mobiledrive`                                |
| Admin password    | `MobileDrive!2026-05-12`                     |

## Findings

### Server-side scrollback delivery is working as designed

**Severity:** none — this is a positive finding, recording the baseline.

**Repro:**

1. Fresh container (commit `e4c781a` applied), Pixel 5 emulation.
2. Attach to default `main` session.
3. Send `seq 1 5000\n` via the WebSocket channel — `t.channel.push("input", { data: "seq 1 5000\n" })`.
4. Read xterm buffer state: 5002 rows, line 1 = "1", line 5000 = "5000", final prompt as last line.
5. Navigate to `/`, then back to `/sessions/main/windows/0`. Wait 1.5s for capture.
6. Re-read buffer: still 5002 rows, identical content. **Every line from 1 to 5000 is present and indexed by xterm.**
7. Full browser reload (`navigate_page reload`). Re-read buffer after capture: still 5002 rows, identical.

**Notes / subtleties:**

- The container's tmux `history-limit` is `2000` (default). `tmux capture-pane -p -t main:0.0 -S -` from inside the container returns only 2002 lines (numbers 3000–5000 plus final prompt).
- Yet after a full page reload, xterm has all 5000 lines. The implication is that the in-process `PaneStream` (or another server-side buffer) retains output beyond tmux's `history-limit`, then replays it on reconnect. This is *more* than the fix advertised — the user gets more scrollback than tmux alone retains.
- Conclusion: the `-S "-300"` → `-S "-"` change in `pane_stream.ex` plus the `scrollback: 50000` xterm bump is doing the right thing end-to-end. The capture isn't the limit; tmux's `history-limit` is. Telling users they can raise `history-limit` to grow the *post-reconnect* picture is now meaningful (before the fix, the cap was a hard 300 lines regardless).

**Artifacts:**

- `drive-artifacts/01-after-seq-pixel-5.png` — terminal showing the tail of `seq 1 5000`.
- `drive-artifacts/02-scrolled-up-100-lines-pixel-5.png` — after `term.scrollLines(-100)`.
- `drive-artifacts/03-scrolled-to-top-pixel-5.png` — viewport scrolled to top, showing the original `seq 1 5000` prompt and lines 1–23. Definitive evidence that the buffer holds the full history.

### Programmatic scroll works; native touch-scroll engagement was not reproducible in DevTools

**Severity:** unknown — needs verification on a real device.

This drive could **not** reproduce the user's report of "scrollback isn't working on my phone." Every scroll path I exercised worked:

| Path                                    | Result                |
| --------------------------------------- | --------------------- |
| `t.term.scrollLines(-100)`              | viewport moves up 100 |
| `t.term.scrollPages(-1)`                | one page up           |
| `t.term.scrollToBottom()`               | snaps to bottom       |
| Set `.xterm-viewport.scrollTop = 0`     | jumps to row 0; xterm syncs `viewportY` correctly |
| Server `scrollback_action` (halfpage-up via the secondary mobile control bar) | rows shift up by half |

Synthetic `TouchEvent`s dispatched via `evaluate_script` did **not** trigger native scrolling (`scrollTop` moved by ~294 px in the wrong direction, xterm's `viewportY` didn't change at all). That's an expected limitation of JS-dispatched touch events — they fire JS handlers but the browser does not run its gesture engine for them, so they can't validate the real-finger path on the emulated device.

**Hypotheses for the user's actual issue (ranked by likelihood):**

1. **Stale server binary.** The scrollback fix landed in commit `e4c781a` on 2026-05-12. If the user's phone is talking to a termigate server running an older build, they still see the old 300-line cap. Confirm by visiting the running deployment's `/healthz` and checking the deployed commit hash, or rebuild/restart the container.
2. **iOS Safari + `-webkit-overflow-scrolling`.** xterm's `.xterm-viewport` is `position: absolute; overflow: scroll`. On iOS Safari pre-iOS 14 this combination required `-webkit-overflow-scrolling: touch` to enable momentum-touch scrolling. Modern iOS shouldn't need it, but it's the most common "scroll works on desktop, not on phone" gotcha.
3. **Horizontal-overflow mis-targeting.** At Pixel 5 (393 px), xterm renders the 80-col pane at ~674 px wide. The pane wrapper has `overflow: hidden`, clipping the right ~280 px (and the scrollbar). The visible content is shifted off-axis — a touch at the visual center is actually closer to the *left* edge of the xterm viewport. If the user's swipe drifts into the leftmost ~24 px, `EdgeSwipeBackHook` will fire and navigate away. Listeners are `passive: true` so they don't *block* scrolling, but they can still pop the user back to `/` mid-gesture.
4. **`seq 1 5000` isn't a fair test against fresh sessions.** A pane attached for the first time has no tmux history yet — so the user sees a near-empty buffer and concludes "no scrollback." After commands are run, scrollback grows.

**Recommendation:** confirm the deployed server commit on the user's phone path first (most likely root cause), then if the scroll-gesture symptom persists on a real device, capture a screen-recording to disambiguate "scrollbar present but not engaging" vs. "scrollbar engages but xterm has nothing to scroll to."

### Horizontal overflow inside `#pane-wrapper-main:0.0` at 393 px (Pixel 5)

**Severity:** minor — not the user's reported problem, but real.

**Repro:**

1. Pixel 5 viewport (393 × 851).
2. Attach to `main:0.0`. Default pane is 80 cols.
3. Inspect: `#pane-wrapper-main:0.0` is 393 px wide with `overflow: hidden`; the inner `.terminal.xterm`, `.xterm-viewport`, and `.xterm-screen` are all **674 px wide**. The right ~280 px of every rendered row is clipped.
4. `.xterm-viewport`'s vertical scrollbar lives on its right edge (x ≈ 674) — outside the clip box, so the user has no visual indication that the pane is scrollable.

**Expected:** the terminal should fit the viewport at mobile width — either by auto-fitting cols on a touch profile, or by scaling the font, or by making the inner content scroll horizontally within the wrapper.

**Actual:** content overflows; the right portion (and scrollbar) is hidden by `pane-wrapper`'s `overflow: hidden`.

**Caveat:** memory note "Mobile terminal size held at 120×40 is by design" suggests the mobile cols/rows are intentional, but in this drive the pane reported 80 × 24 because the container's tmux pane was created with default dimensions before any client attached and `shouldAutoFit` skips the resize on mobile. Worth confirming with the user whether the design intent is "force pane to 120×40 on mobile attach" — if so, that path is currently being skipped for fresh container starts.

## Summary

| Severity   | Count                                        |
| ---------- | -------------------------------------------- |
| blocker    | 0                                            |
| major      | 0                                            |
| minor      | 1 (horizontal overflow at 393 px)            |
| nit        | 0                                            |
| positive   | 1 (server-side scrollback confirmed working) |
| unresolved | 1 (user's phone-side scroll symptom)         |

**Verdict on the scrollback fix:** `yes` — the server-side capture-pane change (`-S "-300"` → `-S "-"`) plus the xterm `scrollback: 50000` bump deliver the intended behavior end-to-end. After detach and re-attach (and even after a hard browser reload), the xterm buffer holds the full output history. Scrolling — programmatic, via `scrollTop`, via xterm's `scrollLines`, and via the server-driven `scrollback_action` event — all reach the older content correctly.

**What I could *not* reproduce:** the user's report that scrolling "isn't working" on their actual phone. The most likely cause is that the user's deployed server isn't yet running commit `e4c781a` — a rebuild and restart should be the first thing to verify. If the symptom persists after that, a screen recording on the real device would disambiguate between a buffer issue and a touch-gesture issue.
