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
// preserve-scrollback-position behavior adjusts scrollTop every time new
// bytes arrive. While the user is touch-scrolling — including the
// inertial glide that keeps going after the finger lifts — that fights
// momentum scroll and strands them at one-line-per-gesture progress.
// The fix routes incoming `output` through a queue whenever a mobile
// touch is active OR the post-lift momentum is still settling, and
// drains the queue once scrolling stops. If a future edit drops any one
// of these pieces, the one-line-at-a-time scroll regression returns.

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "terminal_hook.js"), "utf8");

describe("terminal_hook.js mobile touch-output-buffer logic", () => {
  it("touchstart sets _touchActive when the pane is mobile", () => {
    // Desktop touches (e.g. touchscreen laptops) don't suffer the mobile
    // momentum-fight, so the buffer is gated on _isMobile to keep the
    // desktop write path latency-free.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchstart["'][\s\S]*?this\._isMobile[\s\S]*?this\._touchActive\s*=\s*true/,
    );
  });

  it("a new touch during the glide cancels the momentum settle", () => {
    // Finger back down mid-glide must keep buffering under _touchActive
    // rather than letting the settle timer drain mid-interaction.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchstart["'][\s\S]*?this\._momentumActive\s*=\s*false[\s\S]*?clearMomentumTimer\(\)/,
    );
  });

  it("channel output is queued while touch OR momentum is active", () => {
    // The defining fix: while a touch is active or the inertial glide is
    // still settling, bytes go into a queue instead of straight to
    // term.write. Drop either guard and xterm resumes adjusting scrollTop
    // mid-gesture (finger down) or mid-glide (after lift-off).
    expect(hookSrc).toMatch(
      /channel\.on\(\s*["']output["'][\s\S]*?if\s*\(\s*this\._touchActive\s*\|\|\s*this\._momentumActive\s*\)[\s\S]*?_touchOutputQueue\.push/,
    );
  });

  it("a scroll lift-off (non-tap touchend on mobile) enters the momentum pause", () => {
    // A drag/scroll that ends without a pending tap must NOT flush
    // immediately — it arms the momentum settle so buffering continues
    // through the inertial glide.
    expect(hookSrc).toMatch(
      /else if\s*\(\s*this\._isMobile\s*\)\s*\{[\s\S]*?this\._momentumActive\s*=\s*true[\s\S]*?armMomentumSettle\(\)/,
    );
  });

  it("xterm onScroll re-arms the settle timer while momentum is active", () => {
    // The inertial glide fires onScroll repeatedly; each tick pushes the
    // settle deadline out so we only drain once scrolling truly stops.
    expect(hookSrc).toMatch(
      /onScroll\(\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(\s*this\._momentumActive\s*\)\s*armMomentumSettle\(\)/,
    );
  });

  it("the settle timer clears _momentumActive and drains the queue", () => {
    // When scrolling stops, the timer ends the pause and flushes — so the
    // pane doesn't stay frozen after the glide.
    expect(hookSrc).toMatch(
      /armMomentumSettle\s*=\s*\(\)\s*=>\s*\{[\s\S]*?setTimeout\([\s\S]*?this\._momentumActive\s*=\s*false[\s\S]*?flushTouchOutput\(\)[\s\S]*?\},\s*MOMENTUM_SETTLE_MS\)/,
    );
  });

  it("tap and touchcancel end the pause immediately via endTouchPause", () => {
    // A confirmed tap has nothing scrolling to wait out, and a
    // system-interrupted gesture (touchcancel) shouldn't strand bytes —
    // both drain now rather than arming the momentum settle.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchend["'][\s\S]*?endTouchPause\(\)/,
    );
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchcancel["'][\s\S]*?endTouchPause/,
    );
  });

  it("endTouchPause clears both flags and drains via flushTouchOutput", () => {
    // The flush helper has to clear both pause flags (so subsequent output
    // bypasses the queue) and drain everything previously buffered.
    expect(hookSrc).toMatch(
      /endTouchPause\s*=\s*\(\)\s*=>\s*\{[\s\S]*?this\._touchActive\s*=\s*false[\s\S]*?this\._momentumActive\s*=\s*false[\s\S]*?flushTouchOutput\(\)/,
    );
  });

  it("destroyed() disposes the onScroll listener and clears the settle timer", () => {
    // Leaking the disposable or the timer past teardown would fire
    // term.write on a disposed terminal.
    expect(hookSrc).toMatch(/clearTimeout\(this\._momentumTimer\)/);
    expect(hookSrc).toMatch(/this\._scrollDisposable\.dispose\(\)/);
  });
});
