import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pins the secondary "keyboard-down" control bar — left group is
// Enter / Space / Backspace / Esc; right group exposes scroll mode
// (Scroll / Exit Scroll toggle + ^U / ^D / Bottom nav) so history is
// reachable without a hardware keyboard or tmux copy-mode. Three things
// matter and any one of them regressing breaks the feature:
//
//   1. Visibility — the bar must collapse when `body.kbd-open` is
//      set, otherwise it overlaps the soft keyboard.
//   2. Bottom-safe-area handoff — when the secondary bar is visible
//      it owns `env(safe-area-inset-bottom)`; the primary must drop
//      that padding so it doesn't carry useless space mid-screen.
//   3. Template wiring — the heex must render both groups of buttons
//      and mount the KeyboardVisibility hook so step (1)'s class ever
//      gets toggled in the first place.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "../../css/app.css");
const heexPath = resolve(
  __dirname,
  "../../../lib/termigate_web/live/window_live.ex",
);

const css = readFileSync(cssPath, "utf8")
  // Strip comments so /* ... */ don't show up in regex hits.
  .replace(/\/\*[\s\S]*?\*\//g, "");
const heex = readFileSync(heexPath, "utf8");

function ruleBody(source, selector) {
  // Match the *exact* selector at a rule boundary (so `.foo` doesn't
  // also match `.foo-bar`). Selectors may be followed by whitespace
  // or `{`.
  const pattern = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`,
  );
  const m = source.match(pattern);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

describe("CSS: secondary kbd-down control bar", () => {
  it("declares a .control-signal-bar-kbd-down rule", () => {
    expect(
      ruleBody(css, ".control-signal-bar-kbd-down"),
      "expected a .control-signal-bar-kbd-down rule",
    ).not.toBeNull();
  });

  it("hides the secondary bar whenever body.kbd-open is set", () => {
    const body = ruleBody(css, "body.kbd-open .control-signal-bar-kbd-down");
    expect(
      body,
      "expected `body.kbd-open .control-signal-bar-kbd-down` rule",
    ).not.toBeNull();
    expect(/display:\s*none/.test(body)).toBe(true);
  });

  it("strips the primary bar's safe-area padding when the secondary is showing", () => {
    // Inside the mobile breakpoint there must be a rule that resets
    // padding-bottom on the *primary* bar (not -kbd-down) when body
    // is NOT in kbd-open. Otherwise the primary keeps a useless
    // ~30px pad mid-screen.
    const m = css.match(
      /@media\s*\(\s*max-width:\s*639px\s*\)\s*\{([\s\S]*?)\n\}/g,
    );
    expect(m, "expected an `@media (max-width: 639px)` block").not.toBeNull();
    const joined = (m || []).join("\n");
    expect(
      /body:not\(\.kbd-open\)\s+\.control-signal-bar:not\(\.control-signal-bar-kbd-down\)/.test(
        joined,
      ),
      "expected a body:not(.kbd-open) .control-signal-bar:not(...) reset rule inside the mobile @media block",
    ).toBe(true);
  });

  it("inherits desktop-hidden behavior from the primary bar's media rule", () => {
    // Both bars share the .control-signal-bar class, so the existing
    // `@media (min-width: 640px) { .control-signal-bar { display:none } }`
    // hides them together. This test guards that assumption: if a
    // future edit drops .control-signal-bar from the secondary's
    // class list, the secondary would leak onto desktop.
    expect(
      heex.includes("control-signal-bar control-signal-bar-kbd-down"),
      "secondary bar must keep the .control-signal-bar class so the desktop-hide rule applies",
    ).toBe(true);
  });
});

describe("HEEx: secondary kbd-down control bar template wiring", () => {
  it("renders the secondary bar gated on the same show_toolbar flag as the primary", () => {
    expect(
      /control-signal-bar-kbd-down/.test(heex),
      "expected the secondary bar class in the template",
    ).toBe(true);
    // The same `show_toolbar != false` guard the primary uses.
    const occurrences = (
      heex.match(/@terminal_prefs\["show_toolbar"\]\s*!=\s*false/g) || []
    ).length;
    expect(
      occurrences,
      "expected show_toolbar guard on both the primary and the secondary bar",
    ).toBeGreaterThanOrEqual(2);
  });

  it("includes Enter / Esc / Backspace as send_special_key buttons", () => {
    // Each of these maps to a sequence in @special_keys on the
    // server side. Removing one here without removing the @special_keys
    // entry leaves dead code; removing it from @special_keys without
    // removing it here gives the user a button that does nothing.
    expect(/\{"Enter",\s*"enter"\}/.test(heex)).toBe(true);
    expect(/\{"Esc",\s*"esc"\}/.test(heex)).toBe(true);
    // Backspace renders as the ⌫ glyph (U+232B).
    expect(/raw\("&#x232b;"\),\s*"backspace"/.test(heex)).toBe(true);
  });

  it("includes Space as a send_text button", () => {
    // Space is the only literal character on this bar — it routes
    // through send_text rather than @special_keys (which is reserved
    // for escape sequences) with phx-value-text=" ".
    expect(
      /phx-click=\{if key == "space", do: "send_text"/.test(heex),
    ).toBe(true);
    expect(/phx-value-text=\{if key == "space"/.test(heex)).toBe(true);
  });

  it("renders the Scroll / Exit Scroll toggle with the right phx-click branches", () => {
    // Clicking Scroll fires `enter_scroll_mode` server-side; clicking
    // Exit Scroll fires `exit_scroll_mode`. The label and event flip
    // based on whether the active pane is currently a member of
    // @scroll_mode_panes. Both branches must be present in the template
    // so the toggle works regardless of starting state.
    expect(/phx-click=\{[\s\S]*?"exit_scroll_mode"[\s\S]*?"enter_scroll_mode"/.test(heex)).toBe(
      true,
    );
    expect(/"Exit Scroll"/.test(heex)).toBe(true);
    // The non-active-scroll label is just "Scroll". It sits on the
    // else: side of the if/else label expression, so anchor on
    // `else: "Scroll"` to avoid matching the larger "Exit Scroll".
    expect(/else:\s*"Scroll"/.test(heex)).toBe(true);
  });

  it("renders the scrollback nav controls (^U / ^D / Bottom)", () => {
    // Each of these maps to an entry in @scrollback_actions on the
    // server side, which in turn drives a push_event consumed by the
    // terminal hook's `scrollback_action` handler. Mismatch between
    // this list and the server's allowlist (or the JS handler's
    // switch cases) gives the user a button that does nothing. The
    // old "Copy → page-up" entry is gone (the Scroll button took its
    // place); ^U / ^D / Bottom remain for paging through the snapshot.
    expect(/phx-click="scrollback_action"/.test(heex)).toBe(true);
    expect(/\{"\^U",\s*"halfpage-up"\}/.test(heex)).toBe(true);
    expect(/\{"\^D",\s*"halfpage-down"\}/.test(heex)).toBe(true);
    expect(/\{"Bottom",\s*"bottom"\}/.test(heex)).toBe(true);
  });

  it("mounts the KeyboardVisibility hook so body.kbd-open ever flips", () => {
    expect(/phx-hook="KeyboardVisibilityHook"/.test(heex)).toBe(true);
  });
});
