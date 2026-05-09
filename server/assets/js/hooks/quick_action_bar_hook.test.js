import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QuickActionBarHook } from "./quick_action_bar_hook.js";

// Pin the fade-mask logic for the Quick Action Bar pill scroller.
// `data-fade-left` / `data-fade-right` drive a CSS mask that hides the
// fade gradient on whichever side has nothing more to scroll into. If
// the math here drifts, mobile users see a fade gradient cut off the
// last pill (or no fade at all) — purely visual, but caught here
// before it reaches a drive report.

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnect = vi.fn();
    this.observe = vi.fn();
    FakeResizeObserver.instances.push(this);
  }
}
FakeResizeObserver.instances = [];

let originalResizeObserver;

function build({ scrollLeft, clientWidth, scrollWidth }) {
  document.body.innerHTML = `<div id="bar"></div>`;
  const el = document.getElementById("bar");
  Object.defineProperty(el, "scrollLeft", {
    value: scrollLeft,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
  Object.defineProperty(el, "scrollWidth", {
    value: scrollWidth,
    configurable: true,
  });
  return el;
}

function mountHook(el) {
  const hook = Object.create(QuickActionBarHook);
  hook.el = el;
  hook.mounted();
  return hook;
}

describe("QuickActionBarHook", () => {
  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver;
    FakeResizeObserver.instances = [];
    document.body.innerHTML = "";
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("mounted() sets fadeLeft=false / fadeRight=true when scrolled to start with overflow", () => {
    const el = build({ scrollLeft: 0, clientWidth: 200, scrollWidth: 600 });
    mountHook(el);
    expect(el.dataset.fadeLeft).toBe("false");
    expect(el.dataset.fadeRight).toBe("true");
  });

  it("sets both fades true in the middle", () => {
    const el = build({ scrollLeft: 100, clientWidth: 200, scrollWidth: 600 });
    mountHook(el);
    expect(el.dataset.fadeLeft).toBe("true");
    expect(el.dataset.fadeRight).toBe("true");
  });

  it("sets fadeLeft=true / fadeRight=false at the end", () => {
    // scrollLeft + clientWidth >= scrollWidth - 1 → no more right
    const el = build({ scrollLeft: 400, clientWidth: 200, scrollWidth: 600 });
    mountHook(el);
    expect(el.dataset.fadeLeft).toBe("true");
    expect(el.dataset.fadeRight).toBe("false");
  });

  it("sets both fades false when content fits without overflow", () => {
    const el = build({ scrollLeft: 0, clientWidth: 600, scrollWidth: 600 });
    mountHook(el);
    expect(el.dataset.fadeLeft).toBe("false");
    expect(el.dataset.fadeRight).toBe("false");
  });

  it("re-runs the update on a scroll event", () => {
    const el = build({ scrollLeft: 0, clientWidth: 200, scrollWidth: 600 });
    mountHook(el);
    expect(el.dataset.fadeLeft).toBe("false");

    Object.defineProperty(el, "scrollLeft", {
      value: 50,
      writable: true,
      configurable: true,
    });
    el.dispatchEvent(new Event("scroll"));
    expect(el.dataset.fadeLeft).toBe("true");
  });

  it("updated() re-runs the update", () => {
    const el = build({ scrollLeft: 0, clientWidth: 600, scrollWidth: 600 });
    const hook = mountHook(el);
    expect(el.dataset.fadeRight).toBe("false");

    Object.defineProperty(el, "scrollWidth", { value: 1200, configurable: true });
    hook.updated();
    expect(el.dataset.fadeRight).toBe("true");
  });

  it("observes the element with a ResizeObserver on mount", () => {
    const el = build({ scrollLeft: 0, clientWidth: 200, scrollWidth: 600 });
    mountHook(el);
    expect(FakeResizeObserver.instances).toHaveLength(1);
    expect(FakeResizeObserver.instances[0].observe).toHaveBeenCalledWith(el);
  });

  it("destroyed() disconnects the ResizeObserver and removes the scroll listener", () => {
    const el = build({ scrollLeft: 0, clientWidth: 200, scrollWidth: 600 });
    const removeSpy = vi.spyOn(el, "removeEventListener");
    const hook = mountHook(el);

    hook.destroyed();
    expect(FakeResizeObserver.instances[0].disconnect).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith("scroll", hook._update);
  });
});
