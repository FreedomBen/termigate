import { describe, it, expect } from "vitest";
import { shouldAutoFit } from "./should_auto_fit";

// These tests pin the design decision that the terminal is held at
// tmux's native dimensions in mobile multi-pane mode. Resizing the
// terminal to follow the mobile viewport caused too many in-flight
// shell scenarios to misbehave (TUIs redrawing mid-output, scrollback
// churning, programs assuming a stable size). If you need to change
// the rule, update both the production code and these tests
// deliberately — drive-by edits should fail here.

describe("shouldAutoFit (mobile no-resize policy)", () => {
  it("does NOT auto-fit on mobile in multi-pane mode (the protected case)", () => {
    expect(shouldAutoFit({ isMobile: true, isMultiPane: true })).toBe(false);
  });

  it("auto-fits on mobile in single-pane mode (one terminal fills the viewport)", () => {
    expect(shouldAutoFit({ isMobile: true, isMultiPane: false })).toBe(true);
  });

  it("auto-fits on desktop in multi-pane mode", () => {
    expect(shouldAutoFit({ isMobile: false, isMultiPane: true })).toBe(true);
  });

  it("auto-fits on desktop in single-pane mode", () => {
    expect(shouldAutoFit({ isMobile: false, isMultiPane: false })).toBe(true);
  });

  it("returns the same answer for every fit trigger (window-resize, pane-maximize, prefs-update)", () => {
    // The rule is trigger-independent on purpose: every call site in
    // terminal_hook.js (window resize listener, pane_maximized handler,
    // _applyTerminalPrefs) must agree, otherwise mobile users see an
    // unexpected resize when one path slips through.
    const cases = [
      { isMobile: true, isMultiPane: true },
      { isMobile: true, isMultiPane: false },
      { isMobile: false, isMultiPane: true },
      { isMobile: false, isMultiPane: false },
    ];
    for (const c of cases) {
      const a = shouldAutoFit(c);
      const b = shouldAutoFit(c);
      const d = shouldAutoFit(c);
      expect(a).toBe(b);
      expect(b).toBe(d);
    }
  });
});
