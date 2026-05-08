import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// terminal_hook.js is intentionally too large / DOM-coupled to load
// directly under jsdom (it pulls in xterm, the FitAddon, the Phoenix
// Socket, etc.). Instead, this file pins the *structural* invariant:
// every fit gate in terminal_hook.js must go through shouldAutoFit().
//
// This catches the most likely future regression: someone reads the
// existing `_isMobile` checks, decides to "simplify", and inlines the
// rule again — leaving one of the three call sites out of sync and
// re-introducing the mobile-resize bug we explicitly designed away.

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "terminal_hook.js"), "utf8");

describe("terminal_hook.js fit gates", () => {
  it("imports shouldAutoFit", () => {
    expect(hookSrc).toMatch(/import\s*\{\s*shouldAutoFit\s*\}\s*from\s*["']\.\/should_auto_fit["']/);
  });

  it("calls shouldAutoFit at least three times (window-resize, pane_maximized, prefs-update)", () => {
    const calls = hookSrc.match(/shouldAutoFit\s*\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("does not gate fit decisions directly on this._isMobile (use shouldAutoFit instead)", () => {
    // _isMobile may still be referenced for non-fit concerns (e.g.
    // mobile keyboard handling, toolbar layout). What we forbid is
    // gating a fitAddon.fit() call directly on _isMobile — every fit
    // gate must flow through shouldAutoFit() so the rule lives in one
    // place.
    const lines = hookSrc.split("\n");
    const offenders = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/_isMobile/.test(line)) continue;
      // _isMobile passed as an argument to shouldAutoFit(...) is
      // exactly what we want — skip those lines.
      if (/shouldAutoFit\s*\(/.test(line)) continue;
      // Otherwise, flag if a fitAddon.fit() call appears within a
      // small window of this line — that suggests the _isMobile
      // reference is gating a fit decision directly.
      const window = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 6)).join("\n");
      if (/fitAddon\??\.?fit\s*\(/.test(window)) {
        offenders.push({ line: i + 1, snippet: line.trim() });
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});
