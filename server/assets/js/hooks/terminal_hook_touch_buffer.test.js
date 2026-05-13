import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// terminal_hook.js can't be loaded under jsdom (pulls in xterm, FitAddon,
// the Phoenix Socket, etc.), so we pin the *structural* shape of the
// mobile touch-output-buffer logic the same way the tap/focus and fit
// gates are pinned.
//
// The user-visible bug we're guarding against: on mobile, xterm.js's
// preserve-scrollback-position behavior adjusts scrollTop every time
// new bytes arrive. While the user is touch-scrolling, that fights
// momentum scroll and strands them at one-line-per-gesture progress.
// The fix routes incoming `output` through a queue whenever a mobile
// touch is active, and flushes the queue in one shot on touchend or
// touchcancel. If a future edit drops any one of these pieces, the
// one-line-at-a-time scroll regression returns.

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "terminal_hook.js"), "utf8");

describe("terminal_hook.js mobile touch-output-buffer logic", () => {
  it("touchstart sets _touchActive when the pane is mobile", () => {
    // Desktop touches (e.g. touchscreen laptops) don't suffer the
    // mobile momentum-fight, so the buffer is gated on _isMobile to
    // keep the desktop write path latency-free.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchstart["'][\s\S]*?this\._isMobile[\s\S]*?this\._touchActive\s*=\s*true/,
    );
  });

  it("channel output handler routes bytes to the queue while _touchActive", () => {
    // The defining fix: while a touch is active, bytes go into a queue
    // instead of straight to term.write. If this path disappears,
    // xterm resumes adjusting scrollTop mid-gesture.
    expect(hookSrc).toMatch(
      /channel\.on\(\s*["']output["'][\s\S]*?if\s*\(\s*this\._touchActive\s*\)[\s\S]*?_touchOutputQueue\.push/,
    );
  });

  it("touchend flushes the queue", () => {
    // Without flushing on touchend, buffered output is held until the
    // next gesture — looks like the pane has frozen.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchend["'][\s\S]*?endTouchPause\(\)/,
    );
  });

  it("touchcancel also flushes (system-interrupted gestures don't strand bytes)", () => {
    // touchcancel fires on system gestures like notification pulldown.
    // Skipping it would leak the queue across gestures.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchcancel["'][\s\S]*?endTouchPause/,
    );
  });

  it("flush clears _touchActive and drains the queue via term.write", () => {
    // The flush helper has to clear the flag (so subsequent output
    // bypasses the queue) and drain everything previously buffered.
    expect(hookSrc).toMatch(
      /endTouchPause\s*=\s*\(\)\s*=>\s*\{[\s\S]*?this\._touchActive\s*=\s*false[\s\S]*?this\.term\.write\(/,
    );
  });
});
