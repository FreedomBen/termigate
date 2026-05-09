import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as Panel from "./preferences_panel.js";
import { THEMES, FONT_FAMILIES, localToServer } from "./preferences.js";

// Pin the slide-out preferences panel: that opening builds a form
// from the current prefs, that changes are pushed to the server and
// applied to the live xterm options (with the right re-fit policy),
// and that closing fully tears down so a subsequent open works on a
// fresh stub.

function buildHook(prefs) {
  return {
    getLocalPrefs: () => prefs,
    pushEvent: vi.fn(),
  };
}

function buildTerminal() {
  return { options: {} };
}

function buildFitAddon() {
  return { fit: vi.fn() };
}

function dispatchInput(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function dispatchChange(el) {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const DEFAULT_PREFS = {
  fontSize: 14,
  fontFamily: "monospace",
  theme: "dark",
  customTheme: {},
  cursorStyle: "block",
  cursorBlink: true,
  showToolbar: true,
  mobileKeyboardEnabled: true,
};

describe("preferences_panel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    // Make sure the panel is closed so module-level refs don't leak
    // between tests — close() runs a 200ms timeout before clearing.
    Panel.close();
    vi.runAllTimers();
    vi.useRealTimers();
  });

  describe("open()", () => {
    it("appends a .prefs-backdrop and .prefs-panel to document.body", () => {
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(buildTerminal(), buildFitAddon(), null, hook);
      expect(document.querySelectorAll(".prefs-backdrop")).toHaveLength(1);
      expect(document.querySelectorAll(".prefs-panel")).toHaveLength(1);
    });

    it("is idempotent — a second open() is a no-op", () => {
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(buildTerminal(), buildFitAddon(), null, hook);
      Panel.open(buildTerminal(), buildFitAddon(), null, hook);
      expect(document.querySelectorAll(".prefs-panel")).toHaveLength(1);
      expect(document.querySelectorAll(".prefs-backdrop")).toHaveLength(1);
    });

    it("font-family <select> lists every FONT_FAMILIES entry, with prefs.fontFamily selected", () => {
      const prefs = { ...DEFAULT_PREFS, fontFamily: "'Fira Code', monospace" };
      Panel.open(buildTerminal(), buildFitAddon(), null, buildHook(prefs));

      const select = document.getElementById("pref-font-family");
      expect(select.options).toHaveLength(FONT_FAMILIES.length);
      const values = [...select.options].map((o) => o.value);
      for (const f of FONT_FAMILIES) {
        expect(values).toContain(f.value);
      }
      expect(select.value).toBe("'Fira Code', monospace");
    });

    it("theme <select> lists every THEMES key plus a 'custom' option, with prefs.theme selected", () => {
      const prefs = { ...DEFAULT_PREFS, theme: "light" };
      Panel.open(buildTerminal(), buildFitAddon(), null, buildHook(prefs));

      const select = document.getElementById("pref-theme");
      const values = [...select.options].map((o) => o.value);
      for (const key of Object.keys(THEMES)) {
        expect(values).toContain(key);
      }
      expect(values).toContain("custom");
      expect(select.value).toBe("light");
    });
  });

  describe("live edits", () => {
    it("changing fontSize updates terminal.options.fontSize and calls fitAddon.fit()", () => {
      const term = buildTerminal();
      const fitAddon = buildFitAddon();
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(term, fitAddon, null, hook);

      const slider = document.getElementById("pref-font-size");
      slider.value = "18";
      dispatchInput(slider);

      expect(term.options.fontSize).toBe(18);
      expect(fitAddon.fit).toHaveBeenCalled();
      expect(hook.pushEvent).toHaveBeenLastCalledWith(
        "update_terminal_prefs",
        expect.objectContaining({ font_size: 18 }),
      );
    });

    it("changing fontFamily updates terminal.options.fontFamily and calls fitAddon.fit()", () => {
      const term = buildTerminal();
      const fitAddon = buildFitAddon();
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(term, fitAddon, null, hook);

      const select = document.getElementById("pref-font-family");
      select.value = "'JetBrains Mono', monospace";
      dispatchChange(select);

      expect(term.options.fontFamily).toBe("'JetBrains Mono', monospace");
      expect(fitAddon.fit).toHaveBeenCalled();
    });

    it("changing theme updates terminal.options.theme but does NOT re-fit", () => {
      const term = buildTerminal();
      const fitAddon = buildFitAddon();
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(term, fitAddon, null, hook);

      const select = document.getElementById("pref-theme");
      select.value = "light";
      dispatchChange(select);

      expect(term.options.theme).toEqual(THEMES.light);
      expect(fitAddon.fit).not.toHaveBeenCalled();
    });

    it("changing cursorStyle updates the xterm option without re-fitting", () => {
      const term = buildTerminal();
      const fitAddon = buildFitAddon();
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(term, fitAddon, null, hook);

      const radios = document.querySelectorAll('input[name="cursorStyle"]');
      const bar = [...radios].find((r) => r.value === "bar");
      bar.checked = true;
      dispatchChange(bar);

      expect(term.options.cursorStyle).toBe("bar");
      expect(fitAddon.fit).not.toHaveBeenCalled();
    });

    it("changing cursorBlink updates the xterm option without re-fitting", () => {
      const term = buildTerminal();
      const fitAddon = buildFitAddon();
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(term, fitAddon, null, hook);

      const cb = document.getElementById("pref-cursor-blink");
      cb.checked = false;
      dispatchChange(cb);

      expect(term.options.cursorBlink).toBe(false);
      expect(fitAddon.fit).not.toHaveBeenCalled();
    });

    it("each change pushes update_terminal_prefs with a server-shaped (localToServer) payload", () => {
      const hook = buildHook({ ...DEFAULT_PREFS });
      Panel.open(buildTerminal(), buildFitAddon(), null, hook);

      const slider = document.getElementById("pref-font-size");
      slider.value = "20";
      dispatchInput(slider);

      const expected = localToServer({ ...DEFAULT_PREFS, fontSize: 20 });
      expect(hook.pushEvent).toHaveBeenLastCalledWith(
        "update_terminal_prefs",
        expected,
      );
    });
  });

  describe("theme preview", () => {
    it("writes resolved fg/bg onto #pref-theme-preview and the prompt text", () => {
      const hook = buildHook({ ...DEFAULT_PREFS, theme: "light" });
      Panel.open(buildTerminal(), buildFitAddon(), null, hook);

      const preview = document.getElementById("pref-theme-preview");
      // jsdom normalizes hex → rgb(...) on assignment, so compare via
      // a probe element rather than against the literal hex.
      const probe = document.createElement("div");
      probe.style.background = THEMES.light.background;
      probe.style.color = THEMES.light.foreground;

      expect(preview.style.background).toBe(probe.style.background);
      expect(preview.style.color).toBe(probe.style.color);
      expect(preview.textContent).toBe(`$ echo "Hello, World!"`);
    });
  });

  describe("close()", () => {
    it("backdrop click → panel removed from DOM after the 200ms close animation", () => {
      Panel.open(buildTerminal(), buildFitAddon(), null, buildHook({ ...DEFAULT_PREFS }));
      const backdrop = document.querySelector(".prefs-backdrop");

      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // Still present mid-animation.
      expect(document.querySelectorAll(".prefs-panel")).toHaveLength(1);

      vi.advanceTimersByTime(200);
      expect(document.querySelectorAll(".prefs-panel")).toHaveLength(0);
      expect(document.querySelectorAll(".prefs-backdrop")).toHaveLength(0);
    });

    it("close() clears module-level refs so the next open works on a fresh hook", () => {
      const term1 = buildTerminal();
      const hook1 = buildHook({ ...DEFAULT_PREFS });
      Panel.open(term1, buildFitAddon(), null, hook1);
      Panel.close();
      vi.advanceTimersByTime(200);

      const term2 = buildTerminal();
      const hook2 = buildHook({ ...DEFAULT_PREFS, fontSize: 12 });
      Panel.open(term2, buildFitAddon(), null, hook2);

      const slider = document.getElementById("pref-font-size");
      slider.value = "22";
      dispatchInput(slider);

      // The new hook is the one receiving events; the closed-out hook
      // must not.
      expect(hook2.pushEvent).toHaveBeenCalled();
      expect(hook1.pushEvent).not.toHaveBeenCalled();
      expect(term2.options.fontSize).toBe(22);
      expect(term1.options.fontSize).toBeUndefined();
    });
  });
});
