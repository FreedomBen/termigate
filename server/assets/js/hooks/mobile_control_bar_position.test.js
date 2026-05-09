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
  "../../../lib/termigate_web/live/window_live.ex",
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

// Pull every body of `@media (max-width: 639px) { ... }` so we can
// look up rules that only apply on phones.
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

  it("fits on a single row on mobile (nowrap + flex-1 buttons, no horizontal scroll)", () => {
    // The 10 control buttons (5 control keys + Tab + 4 arrows) need
    // to share one row without overflow. That requires `flex-wrap:
    // nowrap` on the bar and `flex: 1` on the buttons so they can
    // shrink to share available width. A regression to `flex-wrap:
    // wrap` (the original behavior) breaks the bottom-keyboard
    // experience the way it was designed.
    const bar = ruleBody(mobileBlock, ".control-signal-bar");
    const btn = ruleBody(mobileBlock, ".ctl-btn");
    expect(bar, "expected mobile .control-signal-bar rule").not.toBeNull();
    expect(btn, "expected mobile .ctl-btn rule").not.toBeNull();
    expect(/flex-wrap:\s*nowrap/.test(bar)).toBe(true);
    expect(/flex-wrap:\s*wrap/.test(bar)).toBe(false);
    expect(/flex:\s*1/.test(btn)).toBe(true);
    expect(/min-width:\s*0/.test(btn)).toBe(true);
  });

  it("declares a container query context so chips can adapt to the bar's own width", () => {
    // The bar must opt in to container queries (container-type +
    // container-name) so the @container rule below can match against
    // its width. Without this, hiding priority-2 chips when the bar
    // narrows simply doesn't fire.
    const body = ruleBody(css, ".control-signal-bar");
    expect(body).not.toBeNull();
    expect(/container-type:\s*inline-size/.test(body)).toBe(true);
    expect(/container-name:\s*ctl-bar/.test(body)).toBe(true);
  });

  it("hides priority=2 chips and reveals the overflow popover when narrow", () => {
    // Pin the @container rule that drives the responsive overflow.
    // Don't strip out comments here — but we already strip them at the
    // top, so this matches against the cleaned source.
    const m = css.match(
      /@container\s+ctl-bar\s*\(\s*max-width:\s*360px\s*\)\s*\{([\s\S]*?)\}\s*\}/,
    );
    expect(m, "expected @container ctl-bar (max-width: 360px) rule").not.toBe(
      null,
    );
    const body = m[1];
    expect(/\.ctl-btn\[data-priority="2"\]\s*\{[^}]*display:\s*none/.test(body))
      .toBe(true);
    expect(/\.ctl-overflow\s*\{[^}]*display:\s*block/.test(body)).toBe(true);
  });

  it("the heex template tags rare control keys with data-priority=2 and renders the overflow popover", () => {
    // ^Z / ^L / ^\ are the priority-2 keys (rare). ^C and ^D are
    // priority-1 (always visible). The overflow popover mirrors the
    // priority-2 list inside a <details> so the user can still reach
    // them when the inline copy is hidden.
    expect(/\{"\^Z",\s*"z",\s*"2"\}/.test(heex)).toBe(true);
    expect(/\{"\^L",\s*"l",\s*"2"\}/.test(heex)).toBe(true);
    expect(/\{"\^\\\\",\s*"\\\\",\s*"2"\}/.test(heex)).toBe(true);
    expect(/\{"\^C",\s*"c",\s*"1"\}/.test(heex)).toBe(true);
    expect(/\{"\^D",\s*"d",\s*"1"\}/.test(heex)).toBe(true);
    expect(/<details\s+class="ctl-overflow"/.test(heex)).toBe(true);
    expect(/class="ctl-overflow-menu"/.test(heex)).toBe(true);
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
