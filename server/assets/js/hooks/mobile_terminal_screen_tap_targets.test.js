import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pin the F6 fix from the 2026-05-11 mobile drive: the on-screen
// quick-key strip (.ctl-btn) and the per-pane close button
// (.pane-close-btn) must reach a 44 px tap floor on mobile so they
// satisfy Apple HIG / WCAG 2.5.5. The mobile drive measured
// modifier-strip buttons at 35–44 × 40 and the pane tab-close at 28 × 28.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../css/app.css");
const cssRaw = readFileSync(cssPath, "utf8");
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");

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

describe("terminal screen tap targets on mobile (F6)", () => {
  it(".ctl-btn is at least 44 px tall inside @media (max-width: 639px)", () => {
    // The modifier-key strip buttons (^C, ^D, Tab, arrows, Enter, etc.)
    // share equal width within their group on mobile via `flex: 1 1 0`,
    // so per-button width depends on viewport. Height, however, must
    // hit the 44 px tap floor unconditionally.
    const body = ruleBody(".ctl-btn");
    expect(
      body,
      "expected a .ctl-btn rule inside @media (max-width: 639px)",
    ).not.toBeNull();
    const hasHeight = /(?:^|[\s;])(?:min-)?height:\s*44px/.test(body);
    expect(
      hasHeight,
      ".ctl-btn needs height:44px or min-height:44px on mobile",
    ).toBe(true);
  });

  it(".pane-close-btn is at least 44 × 44 inside @media (max-width: 639px)", () => {
    const body = ruleBody(".pane-close-btn");
    expect(
      body,
      "expected a .pane-close-btn rule inside @media (max-width: 639px)",
    ).not.toBeNull();
    const hasWidth = /(?:^|[\s;])(?:min-)?width:\s*44px/.test(body);
    const hasHeight = /(?:^|[\s;])(?:min-)?height:\s*44px/.test(body);
    expect(
      hasWidth,
      ".pane-close-btn needs width:44px or min-width:44px on mobile",
    ).toBe(true);
    expect(
      hasHeight,
      ".pane-close-btn needs height:44px or min-height:44px on mobile",
    ).toBe(true);
  });

  it(".pane-close-btn glyph matches .window-close-btn glyph size on mobile", () => {
    // The 44×44 hit area is right, but the X character inside still
    // renders smaller on pane tabs because the mobile rule sets a
    // smaller font-size (16px) than the equivalent window-tab rule
    // (18px). Match them so the two close buttons read at the same
    // visual weight on a phone.
    const paneBody = ruleBody(".pane-close-btn");
    const windowBody = ruleBody(".window-close-btn");
    expect(paneBody).not.toBeNull();
    expect(windowBody).not.toBeNull();

    const fontSize = (body) => {
      const m = /font-size:\s*(\d+)px/.exec(body);
      return m ? Number(m[1]) : null;
    };

    expect(fontSize(paneBody)).toBe(fontSize(windowBody));
  });
});
