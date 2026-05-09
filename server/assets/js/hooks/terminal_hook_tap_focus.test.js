import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// terminal_hook.js can't be loaded under jsdom (pulls in xterm, FitAddon,
// the Phoenix Socket, etc.), so we pin the *structural* shape of the
// mobile tap-vs-scroll keyboard logic the same way fit gates are pinned.
//
// The user-visible bug we're guarding against: on mobile, the soft
// keyboard pops up while the user is just trying to scroll the pane.
// The fix routes every focus path through a `_tapPending` flag so that:
//   - xterm's focus-on-touchstart is blocked until we confirm a tap
//   - touchmove clears the flag (a drag/scroll never opens the keyboard)
//   - touchend with the flag still set explicitly focuses (a tap does)
// If a future edit drops any one of these pieces, the keyboard regresses
// — either popping up on every scroll (lost block) or never popping up
// at all on tap (lost focus call).

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "terminal_hook.js"), "utf8");

describe("terminal_hook.js mobile tap-vs-scroll keyboard logic", () => {
  it("textarea focus listener blurs while a tap is pending", () => {
    // The focus listener must consult _tapPending and blur if a tap is
    // mid-flight; this is what stops xterm's bubble-phase touchstart
    // handler from opening the keyboard before we know whether the
    // gesture is a tap or a drag.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']focus["'][\s\S]*?if\s*\(\s*this\._tapPending\s*\)[\s\S]*?\.blur\(\)/,
    );
  });

  it("registers touchstart in capture phase so _tapPending is set before xterm focuses", () => {
    // xterm registers its bubble-phase touchstart handler first (during
    // term.open()). Without capture: true, our handler runs after xterm
    // has already focused the textarea, and the focus listener's check
    // of _tapPending is too late.
    const captureTouchstarts = hookSrc.match(
      /addEventListener\(\s*["']touchstart["'][\s\S]*?capture:\s*true/g,
    ) || [];
    expect(captureTouchstarts.length).toBeGreaterThanOrEqual(1);
  });

  it("touchmove clears _tapPending so a drag never opens the keyboard", () => {
    // The defining fix: scrolling/dragging must clear the pending flag
    // before touchend runs, so touchend's focus() call is skipped.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchmove["'][\s\S]*?this\._tapPending\s*=\s*false/,
    );
  });

  it("touchend focuses only if _tapPending is still set (a confirmed tap)", () => {
    // touchend must guard the focus call on _tapPending, otherwise a
    // scroll would still pop the keyboard.
    expect(hookSrc).toMatch(
      /addEventListener\(\s*["']touchend["'][\s\S]*?if\s*\(\s*this\._tapPending\s*\)[\s\S]*?\.focus\(\)/,
    );
  });

  it("touchend clears _tapPending before calling focus() (so the focus listener doesn't blur it)", () => {
    // Order matters: if we called focus() with _tapPending still true,
    // the textarea focus listener would immediately blur — and the
    // keyboard would never open even on a real tap. The clear must
    // happen before the focus.
    const touchendBlocks = [
      ...hookSrc.matchAll(
        /addEventListener\(\s*["']touchend["']\s*,\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,/g,
      ),
    ];
    expect(touchendBlocks.length).toBeGreaterThanOrEqual(1);
    for (const [, body] of touchendBlocks) {
      if (!/this\._tapPending/.test(body) || !/\.focus\(\)/.test(body)) continue;
      const clearIdx = body.indexOf("this._tapPending = false");
      const focusIdx = body.indexOf(".focus()");
      expect(clearIdx).toBeGreaterThan(-1);
      expect(focusIdx).toBeGreaterThan(-1);
      expect(clearIdx).toBeLessThan(focusIdx);
    }
  });
});
