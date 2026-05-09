import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  THEMES,
  FONT_FAMILIES,
  serverToLocal,
  localToServer,
  resolveTheme,
} from "./preferences.js";

// preferences.js is the single source of truth for the snake_case ↔
// camelCase shape mapping that ferries terminal prefs between the
// LiveView server and the browser. These tests pin the contract so a
// drive-by rename or a `??` → `||` swap can't silently strip a setting
// (the kind of regression that surfaces as "my dark theme came back
// after switching to light" or "cursor blink turned itself on").

describe("serverToLocal", () => {
  it("maps every snake_case key to its camelCase counterpart", () => {
    const server = {
      font_size: 18,
      font_family: "'JetBrains Mono', monospace",
      theme: "light",
      custom_theme: { foreground: "#abcdef" },
      cursor_style: "bar",
      cursor_blink: false,
      show_toolbar: false,
      mobile_keyboard_enabled: false,
      toolbar_buttons: ["esc", "tab"],
    };
    expect(serverToLocal(server)).toEqual({
      fontSize: 18,
      fontFamily: "'JetBrains Mono', monospace",
      theme: "light",
      customTheme: { foreground: "#abcdef" },
      cursorStyle: "bar",
      cursorBlink: false,
      showToolbar: false,
      mobileKeyboardEnabled: false,
      toolbarButtons: ["esc", "tab"],
    });
  });

  it("falls back to DEFAULTS for every missing key", () => {
    expect(serverToLocal({})).toEqual({
      fontSize: DEFAULTS.fontSize,
      fontFamily: DEFAULTS.fontFamily,
      theme: DEFAULTS.theme,
      customTheme: DEFAULTS.customTheme,
      cursorStyle: DEFAULTS.cursorStyle,
      cursorBlink: DEFAULTS.cursorBlink,
      showToolbar: DEFAULTS.showToolbar,
      mobileKeyboardEnabled: DEFAULTS.mobileKeyboardEnabled,
      toolbarButtons: DEFAULTS.toolbarButtons,
    });
  });

  it("distinguishes false from undefined (?? vs || trap)", () => {
    // DEFAULTS.cursorBlink is true; an explicit false on the server
    // must survive. If the impl ever switches `??` for `||`, the false
    // gets clobbered to true and this test fails — that's the bug we
    // are pinning against.
    const local = serverToLocal({ cursor_blink: false, show_toolbar: false });
    expect(local.cursorBlink).toBe(false);
    expect(local.showToolbar).toBe(false);
  });
});

describe("localToServer", () => {
  it("round-trips a fully-populated payload", () => {
    const server = {
      font_size: 16,
      font_family: "'Fira Code', monospace",
      theme: "custom",
      custom_theme: { foreground: "#112233", background: "#445566" },
      cursor_style: "underline",
      cursor_blink: true,
      show_toolbar: true,
      mobile_keyboard_enabled: true,
      toolbar_buttons: ["ctrl", "alt"],
    };
    expect(localToServer(serverToLocal(server))).toEqual(server);
  });

  it("emits custom_theme: {} when local prefs omit it", () => {
    // The server contract is that custom_theme is always an object —
    // pinning the {} fallback so removing customTheme from the local
    // shape can't push `undefined` over the wire.
    const out = localToServer({
      fontSize: 14,
      fontFamily: "monospace",
      theme: "dark",
      customTheme: undefined,
      cursorStyle: "block",
      cursorBlink: true,
      showToolbar: true,
      mobileKeyboardEnabled: true,
    });
    expect(out.custom_theme).toEqual({});
  });

  it("omits toolbar_buttons when local prefs don't set it", () => {
    // toolbar_buttons is the one optional key — null/undefined means
    // "use the server default" and must not be sent at all.
    const out = localToServer({
      fontSize: 14,
      fontFamily: "monospace",
      theme: "dark",
      customTheme: {},
      cursorStyle: "block",
      cursorBlink: true,
      showToolbar: true,
      mobileKeyboardEnabled: true,
      toolbarButtons: null,
    });
    expect(out).not.toHaveProperty("toolbar_buttons");
  });
});

describe("resolveTheme", () => {
  it("returns an empty object for theme=dark (xterm default palette)", () => {
    expect(resolveTheme({ theme: "dark" })).toEqual({});
  });

  it("returns the light palette verbatim for theme=light", () => {
    expect(resolveTheme({ theme: "light" })).toBe(THEMES.light);
    expect(resolveTheme({ theme: "light" }).background).toBe("#ffffff");
  });

  it("returns customTheme directly when theme=custom", () => {
    // Current behavior: custom replaces the palette outright; it is
    // NOT overlaid on the dark/light base. Pin this so a future
    // "merge with base" refactor is a deliberate decision, not a
    // drive-by change.
    const customTheme = { foreground: "#abcdef", background: "#123456" };
    expect(resolveTheme({ theme: "custom", customTheme })).toEqual(customTheme);
  });

  it("falls back to {} when customTheme is missing on a custom theme", () => {
    expect(resolveTheme({ theme: "custom" })).toEqual({});
  });

  it("falls back to {} for an unknown theme name", () => {
    expect(resolveTheme({ theme: "solarized-galaxy" })).toEqual({});
  });

  it("treats a missing theme name as dark", () => {
    expect(resolveTheme({})).toEqual({});
  });
});

describe("THEMES", () => {
  it("contains at least dark and light keys", () => {
    expect(THEMES).toHaveProperty("dark");
    expect(THEMES).toHaveProperty("light");
  });
});

describe("FONT_FAMILIES", () => {
  it("is a non-empty array of {label, value} records with non-empty CSS stacks", () => {
    expect(Array.isArray(FONT_FAMILIES)).toBe(true);
    expect(FONT_FAMILIES.length).toBeGreaterThan(0);
    for (const f of FONT_FAMILIES) {
      expect(typeof f.label).toBe("string");
      expect(f.label.length).toBeGreaterThan(0);
      expect(typeof f.value).toBe("string");
      expect(f.value.length).toBeGreaterThan(0);
    }
  });
});
