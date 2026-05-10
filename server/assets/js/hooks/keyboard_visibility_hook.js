// KeyboardVisibilityHook — toggles `body.kbd-open` whenever the
// soft keyboard is up so CSS can hide the secondary "kbd-down"
// control bar (Enter/Space/Backspace/Esc/y/n). Those keys would be
// directly tappable on the soft keyboard anyway, so the row is just
// noise while the keyboard is visible.
//
// Detection: visualViewport.height shrinks when the soft keyboard
// pushes content up. A pixel-delta threshold (rather than a ratio)
// avoids false positives from the address-bar collapse, which moves
// the viewport ~50–100px on mobile browsers — well below typical
// keyboard heights of 250–400px.
//
// Browsers without VisualViewport (older / non-mobile) fall through:
// the body class is never set and the secondary bar stays visible.

export const KEYBOARD_OPEN_THRESHOLD_PX = 150;
export const KBD_OPEN_CLASS = "kbd-open";

export function evaluateKeyboardOpen({
  viewportHeight,
  windowHeight,
  threshold = KEYBOARD_OPEN_THRESHOLD_PX,
} = {}) {
  if (typeof viewportHeight !== "number" || typeof windowHeight !== "number") {
    return false;
  }
  return windowHeight - viewportHeight > threshold;
}

export const KeyboardVisibilityHook = {
  mounted() {
    this._vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!this._vv) return;

    this._update = () => {
      const open = evaluateKeyboardOpen({
        viewportHeight: this._vv.height,
        windowHeight: window.innerHeight,
      });
      document.body.classList.toggle(KBD_OPEN_CLASS, open);
    };

    this._vv.addEventListener("resize", this._update);
    this._vv.addEventListener("scroll", this._update);
    window.addEventListener("orientationchange", this._update);

    this._update();
  },

  destroyed() {
    if (this._vv && this._update) {
      this._vv.removeEventListener("resize", this._update);
      this._vv.removeEventListener("scroll", this._update);
      window.removeEventListener("orientationchange", this._update);
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.remove(KBD_OPEN_CLASS);
    }
  },
};
