import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  KeyboardVisibilityHook,
  evaluateKeyboardOpen,
  KEYBOARD_OPEN_THRESHOLD_PX,
  KBD_OPEN_CLASS,
} from "./keyboard_visibility_hook.js";

// Pin the soft-keyboard detection used by the secondary "kbd-down"
// control bar (Enter/Space/Backspace/Esc/y/n). The bar must hide
// while the keyboard is up (the user can already tap those keys
// directly) and reappear when it closes. A drive-by edit that drops
// the visualViewport listener, swaps in a ratio threshold without
// thinking through address-bar collapse, or forgets to remove the
// body class on destroy will fail here.

describe("evaluateKeyboardOpen", () => {
  it("returns true when the viewport shrinks well past the threshold", () => {
    expect(
      evaluateKeyboardOpen({
        viewportHeight: 400,
        windowHeight: 400 + KEYBOARD_OPEN_THRESHOLD_PX + 50,
      }),
    ).toBe(true);
  });

  it("returns false for the address-bar collapse (~100px)", () => {
    // A typical mobile address bar is ~50–100px. We must NOT mistake
    // that for the soft keyboard, otherwise the secondary bar would
    // flicker every time the user scrolls.
    expect(
      evaluateKeyboardOpen({ viewportHeight: 700, windowHeight: 800 }),
    ).toBe(false);
  });

  it("returns false when viewport == window (desktop / kb closed)", () => {
    expect(
      evaluateKeyboardOpen({ viewportHeight: 900, windowHeight: 900 }),
    ).toBe(false);
  });

  it("returns false when either dimension is missing or non-numeric", () => {
    expect(evaluateKeyboardOpen({})).toBe(false);
    expect(evaluateKeyboardOpen({ viewportHeight: 400 })).toBe(false);
    expect(evaluateKeyboardOpen({ windowHeight: 800 })).toBe(false);
    expect(
      evaluateKeyboardOpen({ viewportHeight: "400", windowHeight: 800 }),
    ).toBe(false);
  });

  it("respects an explicit threshold override", () => {
    expect(
      evaluateKeyboardOpen({
        viewportHeight: 700,
        windowHeight: 800,
        threshold: 50,
      }),
    ).toBe(true);
  });
});

function makeFakeViewport(initialHeight) {
  const listeners = new Map();
  return {
    height: initialHeight,
    addEventListener: vi.fn((type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    }),
    removeEventListener: vi.fn((type, fn) => {
      listeners.get(type)?.delete(fn);
    }),
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    listeners,
  };
}

function mountHook(el) {
  const hook = Object.create(KeyboardVisibilityHook);
  hook.el = el;
  hook.mounted();
  return hook;
}

describe("KeyboardVisibilityHook", () => {
  let originalViewport;
  let originalInnerHeight;
  let fakeViewport;
  let el;

  beforeEach(() => {
    originalViewport = window.visualViewport;
    originalInnerHeight = window.innerHeight;
    document.body.className = "";
    document.body.innerHTML = '<div id="kb-hook"></div>';
    el = document.getElementById("kb-hook");

    fakeViewport = makeFakeViewport(800);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: fakeViewport,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  function restoreViewport() {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalViewport,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  }

  it("does not add kbd-open on mount when keyboard is down", () => {
    mountHook(el);
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(false);
    restoreViewport();
  });

  it("adds kbd-open when the viewport shrinks past the threshold", () => {
    mountHook(el);
    fakeViewport.height = 400; // 400px shrink, well past 150
    fakeViewport.fire("resize");
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(true);
    restoreViewport();
  });

  it("removes kbd-open when the viewport restores", () => {
    mountHook(el);
    fakeViewport.height = 400;
    fakeViewport.fire("resize");
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(true);

    fakeViewport.height = 800;
    fakeViewport.fire("resize");
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(false);
    restoreViewport();
  });

  it("listens to visualViewport resize, scroll, and orientation changes", () => {
    mountHook(el);
    expect(fakeViewport.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(fakeViewport.addEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    restoreViewport();
  });

  it("removes listeners and the body class on destroy", () => {
    const hook = mountHook(el);
    fakeViewport.height = 400;
    fakeViewport.fire("resize");
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(true);

    hook.destroyed();
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(false);
    expect(fakeViewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    restoreViewport();
  });

  it("is a graceful no-op when visualViewport is unavailable", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    const hook = mountHook(el);
    expect(document.body.classList.contains(KBD_OPEN_CLASS)).toBe(false);
    expect(() => hook.destroyed()).not.toThrow();
    restoreViewport();
  });
});
