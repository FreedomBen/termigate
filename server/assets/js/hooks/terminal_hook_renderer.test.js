import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// terminal_hook.js can't be loaded under jsdom (pulls in xterm, FitAddon,
// the Phoenix Socket, etc.), so we pin the *structural* shape of the
// renderer-selection logic the same way the tap/focus, fit, and touch
// buffer gates are pinned.
//
// The user-visible bug we're guarding against: xterm's built-in DOM
// renderer re-renders rows on the main thread on every scroll tick, which
// janks touch scrolling on mobile while output streams — dropped frames,
// one-line-at-a-time steps, and stutter on both axes (the viewport scrolls
// in x and y). The fix prefers the GPU WebGL renderer, falls back to the
// 2D Canvas renderer, then to DOM, and recovers from WebGL context loss
// (mobile caps concurrent contexts) by dropping that pane to Canvas. If a
// future edit drops any one of these pieces, the jank regresses or a lost
// context freezes the pane.

const here = dirname(fileURLToPath(import.meta.url));
const hookSrc = readFileSync(join(here, "terminal_hook.js"), "utf8");

describe("terminal_hook.js renderer selection", () => {
  it("imports the WebGL and Canvas renderer addons", () => {
    expect(hookSrc).toMatch(
      /import\s*\{\s*WebglAddon\s*\}\s*from\s*["']@xterm\/addon-webgl["']/,
    );
    expect(hookSrc).toMatch(
      /import\s*\{\s*CanvasAddon\s*\}\s*from\s*["']@xterm\/addon-canvas["']/,
    );
  });

  it("loads the renderer after term.open() (the render service must exist)", () => {
    const openIdx = hookSrc.indexOf("this.term.open(");
    const webglIdx = hookSrc.indexOf("new WebglAddon()");
    expect(openIdx).toBeGreaterThan(-1);
    expect(webglIdx).toBeGreaterThan(openIdx);
  });

  it("prefers WebGL: constructs it and loads it as an addon", () => {
    expect(hookSrc).toMatch(
      /new WebglAddon\(\)[\s\S]*?this\.term\.loadAddon\(\s*webgl\s*\)/,
    );
  });

  it("falls back to Canvas when WebGL construction/activation throws", () => {
    // The WebGL try must be followed by a catch that calls useCanvas().
    expect(hookSrc).toMatch(
      /new WebglAddon\(\)[\s\S]*?\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?useCanvas\(\)/,
    );
  });

  it("useCanvas loads the Canvas addon and is itself guarded (DOM is the last resort)", () => {
    expect(hookSrc).toMatch(
      /useCanvas\s*=\s*\(\)\s*=>\s*\{[\s\S]*?new CanvasAddon\(\)[\s\S]*?this\.term\.loadAddon\(\s*canvas\s*\)/,
    );
    // The Canvas path has its own try/catch so a missing Canvas renderer
    // leaves xterm's DOM renderer in place rather than throwing.
    expect(hookSrc).toMatch(/new CanvasAddon\(\)[\s\S]*?\}\s*catch/);
  });

  it("recovers from WebGL context loss by disposing and dropping to Canvas", () => {
    expect(hookSrc).toMatch(
      /onContextLoss\(\s*\(\)\s*=>\s*\{[\s\S]*?webgl\.dispose\(\)[\s\S]*?useCanvas\(\)/,
    );
  });

  it("destroyed() disposes the active renderer to release the GPU/canvas context", () => {
    expect(hookSrc).toMatch(
      /if\s*\(\s*this\._renderer\s*\)\s*\{[\s\S]*?this\._renderer\.dispose\(\)/,
    );
  });
});
