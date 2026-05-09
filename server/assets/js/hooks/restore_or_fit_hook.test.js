import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RestoreOrFitHook } from "./restore_or_fit_hook.js";

// Pin the desktop-vs-mobile branch on the maximized-pane "Restore"
// button. The button's job changes by viewport: on desktop it returns
// the pane to its grid spot (`restore_pane`); on mobile it shrinks the
// pane to viewport-width via `fit_pane_width`. If this branch ever
// regresses, mobile users tap "Restore" and the pane explodes back to
// its original (off-screen) size.

function build({ target = "p1" } = {}) {
  document.body.innerHTML = `
    <button id="restore" data-target="${target}"></button>
  `;
  return document.getElementById("restore");
}

function mountHook(button) {
  const hook = Object.create(RestoreOrFitHook);
  hook.el = button;
  hook.pushEvent = vi.fn();
  hook.mounted();
  return hook;
}

const ORIGINAL_INNER_WIDTH = window.innerWidth;

describe("RestoreOrFitHook", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.innerWidth = ORIGINAL_INNER_WIDTH;
  });

  afterEach(() => {
    window.innerWidth = ORIGINAL_INNER_WIDTH;
  });

  it("desktop (>= 640): pushes restore_pane regardless of data-target", () => {
    window.innerWidth = 1024;
    const button = build({ target: "session:0.0" });
    const hook = mountHook(button);

    button.click();
    expect(hook.pushEvent).toHaveBeenCalledTimes(1);
    expect(hook.pushEvent).toHaveBeenCalledWith("restore_pane", {});
  });

  it("mobile + matching pane with numeric viewportFitCols(): pushes fit_pane_width", () => {
    window.innerWidth = 375;
    const button = build({ target: "p1" });
    const paneEl = document.createElement("div");
    paneEl.id = "pane-p1";
    paneEl._termHook = { viewportFitCols: () => 80 };
    document.body.appendChild(paneEl);

    const hook = mountHook(button);
    button.click();

    expect(hook.pushEvent).toHaveBeenCalledTimes(1);
    expect(hook.pushEvent).toHaveBeenCalledWith("fit_pane_width", {
      target: "p1",
      cols: 80,
    });
  });

  it("mobile + viewportFitCols() returns null (renderer not ready): falls through to restore_pane", () => {
    window.innerWidth = 375;
    const button = build({ target: "p1" });
    const paneEl = document.createElement("div");
    paneEl.id = "pane-p1";
    paneEl._termHook = { viewportFitCols: () => null };
    document.body.appendChild(paneEl);

    const hook = mountHook(button);
    button.click();

    expect(hook.pushEvent).toHaveBeenCalledWith("restore_pane", {});
  });

  it("mobile + no pane-${target} element: falls through to restore_pane", () => {
    window.innerWidth = 375;
    const button = build({ target: "p1" });
    const hook = mountHook(button);
    button.click();
    expect(hook.pushEvent).toHaveBeenCalledWith("restore_pane", {});
  });

  it("calls preventDefault() on the click", () => {
    window.innerWidth = 1024;
    const button = build();
    mountHook(button);

    const event = new Event("click", { cancelable: true });
    const preventSpy = vi.spyOn(event, "preventDefault");
    button.dispatchEvent(event);
    expect(preventSpy).toHaveBeenCalled();
  });

  it("destroyed() removes the click listener", () => {
    const button = build();
    const removeSpy = vi.spyOn(button, "removeEventListener");
    const hook = mountHook(button);

    hook.destroyed();
    expect(removeSpy).toHaveBeenCalledWith("click", hook._onClick);
  });
});
