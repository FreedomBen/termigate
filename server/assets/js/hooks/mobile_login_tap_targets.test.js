import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pin the F6 fix from the 2026-05-06 mobile drive: the login form's
// Username/Password <input>s and the primary "Sign in" <button> were
// rendering at 40 px tall on iPhone-SE-class viewports — under the
// 44 px Apple HIG / WCAG 2.5.5 floor. The setup form shares the same
// .auth-card wrapper, so a single .auth-card-scoped rule fixes both.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../css/app.css");
const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

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

// Substring-match the selector across every flat rule inside the
// mobile media query so a comma-joined list like
// `.auth-card .input, .auth-card .btn` still matches each needle.
function hasMinHeight44(needle) {
  const ruleRe = /([^{}]+?)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(mobileBlock))) {
    const selectors = m[1].split(",").map((s) => s.trim());
    if (!selectors.some((s) => s.includes(needle))) continue;
    const body = m[2];
    if (/(?:^|[\s;])(?:min-)?height:\s*44px/.test(body)) return true;
  }
  return false;
}

describe("Login / setup form tap targets on mobile (F6)", () => {
  for (const sel of [".auth-card .input", ".auth-card .btn"]) {
    it(`${sel} reaches a 44 px tap floor inside @media (max-width: 639px)`, () => {
      expect(
        hasMinHeight44(sel),
        `expected a rule containing \`${sel}\` with (min-)height: 44px in the mobile media query`,
      ).toBe(true);
    });
  }
});
