import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PaneResizeHook, getPointer } from "./pane_resize_hook.js";

// Pin the lifecycle and divider-creation contract for the multi-pane
// drag-resize hook. The pixel math (deltaCols / deltaRows rounding) is
// genuinely complex and is exercised end-to-end by the chrome-devtools
// drive script — here we cover only the parts that are easy and
// high-value to drive in jsdom: mount/unmount cleanup, divider
// creation from data attributes, the drag-start visual state, and the
// "delta rounds to 0 → no resize event" branch.

function mockRect(el, rect) {
  el.getBoundingClientRect = () => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  });
}

function mountHook(el) {
  const hook = Object.create(PaneResizeHook);
  hook.el = el;
  hook.pushEvent = vi.fn();
  hook.mounted();
  return hook;
}

function buildTwoPaneGrid() {
  // Two panes side-by-side with a 1-col tmux separator between them.
  // colBounds: 0 → 87 (pane A), 87 → 88 (separator track), 88 → 175 (pane B)
  // #pane-dividers lives inside #grid so mousedown on a divider bubbles
  // up to the grid where the drag listeners are attached (matches the
  // production multi-pane template).
  document.body.innerHTML = `
    <div id="grid"
         data-panes='${JSON.stringify([
           { target: "p1", left: 0, top: 0, width: 87, height: 50 },
           { target: "p2", left: 88, top: 0, width: 87, height: 50 },
         ])}'
         data-col-bounds='[0, 87, 88, 175]'
         data-row-bounds='[0, 50]'
         style="grid-template-columns: 100px 4px 100px; grid-template-rows: 200px;">
      <div id="pane-wrapper-p1"></div>
      <div id="pane-wrapper-p2"></div>
      <div id="pane-dividers"></div>
    </div>
  `;
  const grid = document.getElementById("grid");
  mockRect(grid, { left: 0, top: 0, right: 204, bottom: 200 });
  mockRect(document.getElementById("pane-wrapper-p1"), {
    left: 0, top: 0, right: 100, bottom: 200,
  });
  mockRect(document.getElementById("pane-wrapper-p2"), {
    left: 104, top: 0, right: 204, bottom: 200,
  });
  return grid;
}

describe("PaneResizeHook lifecycle", () => {
  let rafCallbacks;
  let originalRaf;

  beforeEach(() => {
    document.body.innerHTML = "";
    rafCallbacks = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    vi.restoreAllMocks();
  });

  it("mounted() registers a window resize listener and runs _setupDividers on the next animation frame", () => {
    const grid = buildTwoPaneGrid();
    const addSpy = vi.spyOn(window, "addEventListener");
    mountHook(grid);

    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(rafCallbacks).toHaveLength(1);

    // No dividers yet — rAF hasn't fired.
    expect(document.querySelectorAll(".pane-divider")).toHaveLength(0);
    rafCallbacks[0]();
    expect(document.querySelectorAll(".pane-divider")).toHaveLength(1);
  });

  it("_setupDividers creates one .pane-divider per separator track with correct data attributes", () => {
    const grid = buildTwoPaneGrid();
    const hook = mountHook(grid);
    rafCallbacks[0]();

    const dividers = document.querySelectorAll(".pane-divider");
    expect(dividers).toHaveLength(1);
    expect(dividers[0].dataset.axis).toBe("col");
    expect(dividers[0].dataset.sepTrack).toBe("1");
    expect(dividers[0].dataset.target).toBe("p1");
    expect(dividers[0].classList.contains("pane-divider-v")).toBe(true);

    // updated() while not dragging re-runs setup — and is idempotent
    // (one divider, not two).
    hook.updated();
    expect(document.querySelectorAll(".pane-divider")).toHaveLength(1);
  });

  it("_setupDividers bails out when this.el.dataset.maximized is set", () => {
    const grid = buildTwoPaneGrid();
    grid.dataset.maximized = "true";
    mountHook(grid);
    rafCallbacks[0]();
    expect(document.querySelectorAll(".pane-divider")).toHaveLength(0);
  });

  it("_setupDividers bails out when only one pane is visible", () => {
    document.body.innerHTML = `
      <div id="pane-dividers"></div>
      <div id="grid"
           data-panes='[{"target":"p1","left":0,"top":0,"width":80,"height":24}]'
           data-col-bounds='[0,80]'
           data-row-bounds='[0,24]'></div>
    `;
    const grid = document.getElementById("grid");
    mockRect(grid, { left: 0, top: 0, right: 100, bottom: 100 });
    mountHook(grid);
    rafCallbacks[0]();
    expect(document.querySelectorAll(".pane-divider")).toHaveLength(0);
  });

  it("updated() while dragging defers re-setup (sets _pendingUpdate)", () => {
    const grid = buildTwoPaneGrid();
    const hook = mountHook(grid);
    rafCallbacks[0]();

    hook._isDragging = true;
    hook._pendingUpdate = false;
    // Mutate the data so a real re-setup would change divider count.
    grid.dataset.panes = JSON.stringify([
      { target: "p1", left: 0, top: 0, width: 87, height: 50 },
      { target: "p2", left: 88, top: 0, width: 87, height: 50 },
    ]);

    hook.updated();
    expect(hook._pendingUpdate).toBe(true);
    // Divider count unchanged because re-setup was deferred.
    expect(document.querySelectorAll(".pane-divider")).toHaveLength(1);
  });

  it("destroyed() removes the resize listener and clears the pending timer", () => {
    const grid = buildTwoPaneGrid();
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const hook = mountHook(grid);
    rafCallbacks[0]();

    // Prime a pending resize timer so we can observe clearTimeout being called on it.
    hook._resizeTimer = setTimeout(() => {}, 1000);

    hook.destroyed();
    expect(removeSpy).toHaveBeenCalledWith("resize", hook._onResize);
    expect(clearSpy).toHaveBeenCalledWith(hook._resizeTimer);
  });
});

describe("PaneResizeHook drag visuals", () => {
  let rafCallbacks;
  let originalRaf;

  beforeEach(() => {
    document.body.innerHTML = "";
    rafCallbacks = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    vi.restoreAllMocks();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  });

  it("mousedown on a divider sets body cursor and adds the active class; mouseup with no delta clears them and does NOT push resize_pane_drag", () => {
    const grid = buildTwoPaneGrid();
    const hook = mountHook(grid);
    rafCallbacks[0]();

    const divider = document.querySelector(".pane-divider");

    const start = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 50,
    });
    divider.dispatchEvent(start);

    expect(divider.classList.contains("pane-divider-active")).toBe(true);
    expect(document.body.style.cursor).toBe("col-resize");
    expect(hook._isDragging).toBe(true);

    // End at the same coordinates → delta rounds to 0 → no event.
    const end = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 50,
    });
    document.dispatchEvent(end);

    expect(divider.classList.contains("pane-divider-active")).toBe(false);
    expect(document.body.style.cursor).toBe("");
    expect(hook._isDragging).toBe(false);
    expect(hook.pushEvent).not.toHaveBeenCalled();
  });
});

describe("getPointer", () => {
  it("returns clientX/Y for mouse events", () => {
    const e = { type: "mousedown", clientX: 12, clientY: 34 };
    expect(getPointer(e)).toEqual({ x: 12, y: 34 });
  });

  it("returns touches[0] coords for touchstart / touchmove", () => {
    const e = {
      type: "touchstart",
      touches: [{ clientX: 50, clientY: 60 }],
      changedTouches: [{ clientX: 999, clientY: 999 }],
    };
    expect(getPointer(e)).toEqual({ x: 50, y: 60 });
  });

  it("returns changedTouches[0] coords for touchend (when isEnd=true)", () => {
    const e = {
      type: "touchend",
      touches: [],
      changedTouches: [{ clientX: 70, clientY: 80 }],
    };
    expect(getPointer(e, true)).toEqual({ x: 70, y: 80 });
  });
});
