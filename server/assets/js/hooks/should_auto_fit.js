// shouldAutoFit({ isMobile, isMultiPane }) — single source of truth for
// whether the terminal should be auto-fitted to its container.
//
// DESIGN DECISION (2026-05-06): on mobile (viewport < 640 px) we DO NOT
// auto-resize the terminal in multi-pane mode. We tried following the
// viewport on mobile and it broke too many in-flight shell scenarios
// (TUIs redrawing mid-output, scrollback churning, long-running
// programs that assume a stable cols×rows). The terminal is held at
// tmux's native dimensions and the visible-region clipping is
// accepted. See drive report
// `archived-docs/SERVER_MOBILE_DRIVE_2026-05-06_*.md` (findings F3 / F9)
// for the trade-off discussion.
//
// Single-pane mode always fits — there's only one terminal and it
// already fills the viewport, so resizing it can't fight with another
// pane's layout.
//
// All three terminal_hook.js fit gates (window-resize listener,
// `pane_maximized` handler, preferences-update handler) flow through
// this function so the rule lives in one place and is unit-tested.
export function shouldAutoFit({ isMobile, isMultiPane }) {
  return !(isMobile && isMultiPane);
}
