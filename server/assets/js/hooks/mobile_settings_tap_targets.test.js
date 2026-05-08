import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pin the F2 fix from the 2026-05-06 mobile drive: every interactive
// control on the Settings page must reach a 44 px tap floor on mobile.
// Text inputs and selects grow directly; the 20 × 20 native checkbox
// / radio chips stay native, but their wrapping <label> row gets a
// 44 px min-height so the entire row is a comfortable hit area.

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

// Look across every flat rule inside the mobile media query for one
// whose selector list contains `needle` and whose body sets a 44 px
// (min-)height. Selector matching is substring-based on purpose so
// `.settings-section .input.input-sm` matches inside a longer
// comma-joined selector list.
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

describe("Settings page tap targets on mobile (F2)", () => {
  for (const sel of [
    ".settings-section .input.input-sm",
    ".settings-section .select.select-sm",
    ".settings-section .label.cursor-pointer",
  ]) {
    it(`${sel} reaches a 44 px tap floor inside @media (max-width: 639px)`, () => {
      expect(
        hasMinHeight44(sel),
        `expected a rule containing \`${sel}\` with (min-)height: 44px in the mobile media query`,
      ).toBe(true);
    });
  }
});
