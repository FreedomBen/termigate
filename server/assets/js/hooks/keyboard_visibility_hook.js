// KeyboardVisibilityHook — toggles `body.kbd-open` whenever the
// soft keyboard is up so CSS can hide the secondary "kbd-down"
// control bar (Enter/Space/Backspace/Esc/y/n). Those keys would be
// directly tappable on the soft keyboard anyway, so the row is just
// noise while the keyboard is visible.
//
// Detection — the tricky part: we can't just compare
// `visualViewport.height` to `window.innerHeight`, because on
// Firefox/Chrome Android the layout viewport (innerHeight) ALSO
// shrinks when the soft keyboard opens, so the delta stays at ~0
// and we'd never detect the keyboard. iOS Safari, in contrast,
// keeps innerHeight at full screen and only shrinks visualViewport.
//
// The robust signal across browsers is a *baseline*: the largest
// viewport height observed in this session is the no-keyboard
// resting state. Any meaningful drop below that baseline means the
// keyboard came up. We seed the baseline from both
// visualViewport.height and window.innerHeight on every tick so it
// keeps tracking the true maximum even after orientation changes
// or URL-bar transitions.
//
// Browsers without VisualViewport (older / non-mobile) fall through:
// the body class is never set and the secondary bar stays visible,
// which is the right default since there's no keyboard to overlap.

export const KEYBOARD_OPEN_THRESHOLD_PX = 150;
export const KBD_OPEN_CLASS = "kbd-open";

export function evaluateKeyboardOpen({
  viewportHeight,
  baselineHeight,
  threshold = KEYBOARD_OPEN_THRESHOLD_PX,
} = {}) {
  if (
    typeof viewportHeight !== "number" ||
    typeof baselineHeight !== "number"
  ) {
    return false;
  }
  return baselineHeight - viewportHeight > threshold;
}

export const KeyboardVisibilityHook = {
  mounted() {
    this._vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!this._vv) return;

    this._baseline = 0;

    this._update = () => {
      // The baseline is the largest viewport height we've ever seen.
      // Including innerHeight catches iOS where visualViewport shrinks
      // but innerHeight does not — innerHeight stays at the true
      // no-keyboard maximum. Including visualViewport.height covers
      // the moments we observed it expand (orientation change, etc.).
      this._baseline = Math.max(
        this._baseline,
        this._vv.height,
        window.innerHeight,
      );
      const open = evaluateKeyboardOpen({
        viewportHeight: this._vv.height,
        baselineHeight: this._baseline,
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
