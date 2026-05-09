import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EdgeSwipeBackHook,
  evaluateSwipe,
  EDGE_ZONE_PX,
  MIN_DISTANCE_PX,
  MAX_DURATION_MS,
} from "./edge_swipe_back_hook.js";

// Pin the left-edge swipe-to-back gesture: it must fire only when the
// touch starts at the very edge, travels far enough horizontally, and
// stays mostly horizontal. Anything else (deep starts, vertical drags,
// pinches, slow trickles) must be ignored so we don't yank users out
// of a pane mid-interaction.

function mountHook(el) {
  const hook = Object.create(EdgeSwipeBackHook);
  hook.el = el;
  hook.pushEvent = vi.fn();
  hook.mounted();
  return hook;
}

function touch(x, y) {
  return { clientX: x, clientY: y };
}

function fireTouch(el, type, touches, changedTouches = touches, target = el) {
  const ev = new Event(type, { bubbles: true });
  Object.defineProperty(ev, "touches", { value: touches });
  Object.defineProperty(ev, "changedTouches", { value: changedTouches });
  Object.defineProperty(ev, "target", { value: target });
  el.dispatchEvent(ev);
}

describe("evaluateSwipe", () => {
  const base = { x: 5, y: 100, t: 0 };

  it("accepts an edge-anchored horizontal swipe past the threshold", () => {
    const end = { x: 5 + MIN_DISTANCE_PX + 5, y: 110, t: 200 };
    expect(evaluateSwipe(base, end)).toBe(true);
  });

  it("rejects swipes that start past the edge zone", () => {
    const start = { x: EDGE_ZONE_PX + 1, y: 100, t: 0 };
    const end = { x: start.x + MIN_DISTANCE_PX + 50, y: 110, t: 200 };
    expect(evaluateSwipe(start, end)).toBe(false);
  });

  it("rejects swipes shorter than the distance threshold", () => {
    const end = { x: base.x + MIN_DISTANCE_PX - 5, y: 105, t: 200 };
    expect(evaluateSwipe(base, end)).toBe(false);
  });

  it("rejects swipes that drift more vertically than horizontally", () => {
    const end = { x: base.x + MIN_DISTANCE_PX + 5, y: base.y + 200, t: 200 };
    expect(evaluateSwipe(base, end)).toBe(false);
  });

  it("rejects swipes that take longer than the max duration", () => {
    const end = {
      x: base.x + MIN_DISTANCE_PX + 5,
      y: 110,
      t: MAX_DURATION_MS + 50,
    };
    expect(evaluateSwipe(base, end)).toBe(false);
  });

  it("returns false when start or end is missing", () => {
    expect(evaluateSwipe(null, base)).toBe(false);
    expect(evaluateSwipe(base, null)).toBe(false);
  });
});

describe("EdgeSwipeBackHook", () => {
  let el;
  let hook;

  beforeEach(() => {
    document.body.innerHTML = '<div id="window-root"></div>';
    el = document.getElementById("window-root");
    hook = mountHook(el);
  });

  it("fires swipe_back for an edge-anchored horizontal swipe", () => {
    fireTouch(el, "touchstart", [touch(5, 200)]);
    fireTouch(el, "touchmove", [touch(60, 205)]);
    fireTouch(el, "touchend", [], [touch(120, 210)]);
    expect(hook.pushEvent).toHaveBeenCalledWith("swipe_back");
  });

  it("ignores touches that start past the edge zone", () => {
    fireTouch(el, "touchstart", [touch(EDGE_ZONE_PX + 10, 200)]);
    fireTouch(el, "touchend", [], [touch(EDGE_ZONE_PX + 200, 210)]);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });

  it("ignores predominantly vertical drags", () => {
    fireTouch(el, "touchstart", [touch(5, 200)]);
    fireTouch(el, "touchend", [], [touch(95, 500)]);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });

  it("ignores swipes shorter than the distance threshold", () => {
    fireTouch(el, "touchstart", [touch(5, 200)]);
    fireTouch(el, "touchend", [], [touch(40, 205)]);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });

  it("ignores multi-touch gestures (pinch/zoom)", () => {
    fireTouch(el, "touchstart", [touch(5, 200), touch(100, 200)]);
    fireTouch(el, "touchend", [], [touch(120, 210)]);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });

  it("cancels when a second finger lands mid-drag", () => {
    fireTouch(el, "touchstart", [touch(5, 200)]);
    fireTouch(el, "touchmove", [touch(40, 205), touch(200, 200)]);
    fireTouch(el, "touchend", [], [touch(120, 210)]);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });

  it("ignores swipes that begin on a pane resize divider", () => {
    document.body.innerHTML = `
      <div id="window-root">
        <div class="pane-resize-divider" id="divider"></div>
      </div>
    `;
    el = document.getElementById("window-root");
    hook = mountHook(el);
    const divider = document.getElementById("divider");
    fireTouch(el, "touchstart", [touch(5, 200)], [touch(5, 200)], divider);
    fireTouch(el, "touchend", [], [touch(120, 210)], divider);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });

  it("removes listeners on destroy", () => {
    hook.destroyed();
    fireTouch(el, "touchstart", [touch(5, 200)]);
    fireTouch(el, "touchend", [], [touch(120, 210)]);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });
});
