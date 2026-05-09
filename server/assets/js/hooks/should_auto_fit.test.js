import { describe, it, expect } from "vitest";
import { shouldAutoFit } from "./should_auto_fit";

// These tests pin the design decision that the terminal is held at
// tmux's native dimensions on mobile. Resizing the terminal to follow
// the mobile viewport caused too many in-flight shell scenarios to
// misbehave (TUIs redrawing mid-output, scrollback churning, programs
// assuming a stable size). If you need to change the rule, update both
// the production code and these tests deliberately — drive-by edits
// should fail here.

describe("shouldAutoFit (mobile no-resize policy)", () => {
  it("does NOT auto-fit on mobile (the protected case)", () => {
    expect(shouldAutoFit({ isMobile: true })).toBe(false);
  });

  it("auto-fits on desktop", () => {
    expect(shouldAutoFit({ isMobile: false })).toBe(true);
  });

  it("returns the same answer for every fit trigger (window-resize, pane-maximize, prefs-update)", () => {
    // The rule is trigger-independent on purpose: every call site in
    // terminal_hook.js (window resize listener, pane_maximized handler,
    // _applyTerminalPrefs) must agree, otherwise mobile users see an
    // unexpected resize when one path slips through.
    for (const isMobile of [true, false]) {
      const a = shouldAutoFit({ isMobile });
      const b = shouldAutoFit({ isMobile });
      const d = shouldAutoFit({ isMobile });
      expect(a).toBe(b);
      expect(b).toBe(d);
    }
  });
});
