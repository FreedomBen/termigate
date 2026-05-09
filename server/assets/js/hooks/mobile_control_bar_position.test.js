import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pins the bottom-anchored mobile control bar from the 2026-05-09 work.
// The `Ctrl+C / Tab / arrow keys` row sits at the bottom of the flex
// column on mobile so it lands just above the soft keyboard (thumb
// zone). A drive-by edit that puts it back at the top — re-introducing
// `border-bottom`, dropping the safe-area inset, or nesting it inside
// `bars-group` — should fail here.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../css/app.css");
const heexPath = resolve(
  __dirname,
  "../../../lib/termigate_web/live/multi_pane_live.ex",
);

const cssRaw = readFileSync(cssPath, "utf8");
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const heex = readFileSync(heexPath, "utf8");

function ruleBody(source, selector) {
  const escaped = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const re = new RegExp(`(^|[\\s{};,])${escaped}\\s*\\{`, "g");
  const m = re.exec(source);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

describe(".control-signal-bar pins to the bottom on mobile", () => {
  it("uses border-top, not border-bottom (it's at the bottom edge now)", () => {
    const body = ruleBody(css, ".control-signal-bar");
    expect(body, "expected a .control-signal-bar rule").not.toBeNull();
    expect(/border-top:\s*\d/.test(body)).toBe(true);
    expect(/border-bottom:\s*\d/.test(body)).toBe(false);
  });

  it("includes safe-area-inset-bottom in its padding so iOS home indicator clears", () => {
    const body = ruleBody(css, ".control-signal-bar");
    expect(body).not.toBeNull();
    expect(/env\(safe-area-inset-bottom/.test(body)).toBe(true);
  });

  it("is rendered as a sibling of #multi-pane-grid, not nested inside #bars-group", () => {
    const barsGroupIdx = heex.indexOf('id="bars-group"');
    const ctlIdx = heex.indexOf('class="control-signal-bar"');
    expect(barsGroupIdx, "bars-group not found in template").toBeGreaterThan(0);
    expect(ctlIdx, "control-signal-bar not found in template").toBeGreaterThan(
      0,
    );
    // The control-signal-bar must appear AFTER bars-group's opening tag
    // and AFTER the multi-pane-grid block — i.e., later in the document
    // than where bars-group lives. Use #multi-pane-grid as a sentinel
    // that we're past the top-of-page bars region.
    const gridIdx = heex.indexOf('id="multi-pane-grid"');
    expect(gridIdx).toBeGreaterThan(0);
    expect(ctlIdx).toBeGreaterThan(gridIdx);
  });
});
