import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pin the F10 fix from the 2026-05-06 mobile drive: the terminal top
// bar's `× Close window` (and the adjacent `New window` and
// `Toggle tab and control bar` controls) must be ≥ 44 × 44 CSS px on
// mobile — Apple HIG / WCAG 2.5.5 minimum. A drive-by edit that drops
// any of these back below 44 px should fail here.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../css/app.css");
const cssRaw = readFileSync(cssPath, "utf8");

// Strip /* ... */ comments so they don't interfere with the matchers.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");

// Pull every body of `@media (max-width: 639px) { ... }`, brace-counting
// so nested at-rules don't trip us up. We concatenate them so the
// individual selector lookup below doesn't depend on which @media
// block a rule lives in.
function extractMaxWidth639Bodies(source) {
  const bodies = [];
  const opener = /@media\s*\(\s*max-width:\s*639px\s*\)\s*\{/g;
  let m;
  while ((m = opener.exec(source))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    bodies.push(source.slice(start, i - 1));
  }
  return bodies.join("\n");
}

const mobileBlock = extractMaxWidth639Bodies(css);

// Find the body of `selector { ... }` inside `mobileBlock`, returning
// null if the selector isn't declared inside the mobile media query.
function ruleBody(selector) {
  const escaped = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const re = new RegExp(`(^|[\\s{};,])${escaped}\\s*\\{`, "g");
  const m = re.exec(mobileBlock);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < mobileBlock.length && depth > 0) {
    const c = mobileBlock[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return mobileBlock.slice(start, i - 1);
}

describe("terminal top-bar tap targets on mobile (F10)", () => {
  for (const sel of [
    ".window-close-btn",
    ".bars-toggle-btn",
    ".new-window-btn",
  ]) {
    it(`${sel} is at least 44 × 44 inside @media (max-width: 639px)`, () => {
      const body = ruleBody(sel);
      expect(
        body,
        `expected a ${sel} rule inside @media (max-width: 639px)`,
      ).not.toBeNull();
      const hasWidth = /(?:^|[\s;])(?:min-)?width:\s*44px/.test(body);
      const hasHeight = /(?:^|[\s;])(?:min-)?height:\s*44px/.test(body);
      expect(hasWidth, `${sel} needs width:44px or min-width:44px`).toBe(true);
      expect(hasHeight, `${sel} needs height:44px or min-height:44px`).toBe(
        true,
      );
    });
  }

  it(".window-close-btn is unconditionally visible on mobile (no hover)", () => {
    const body = ruleBody(".window-close-btn");
    expect(body).not.toBeNull();
    // Mobile has no `:hover` state to reveal the desktop close button,
    // so the rule must override the desktop `opacity: 0` default.
    expect(/opacity:\s*1\b/.test(body)).toBe(true);
  });
});
