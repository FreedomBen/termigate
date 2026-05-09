// EdgeSwipeBackHook — left-edge horizontal swipe to return to the
// sessions list from the window/pane view.
//
// Mobile browsers don't surface a back gesture for in-app LiveView
// navigations, so we synthesize one: a single-finger drag that starts
// within EDGE_ZONE_PX of the left edge and travels MIN_DISTANCE_PX
// horizontally fires "swipe_back" on the LiveView, which push_navigates
// to "/".

export const EDGE_ZONE_PX = 24;
export const MIN_DISTANCE_PX = 80;
export const MAX_DURATION_MS = 600;
export const HORIZONTAL_RATIO = 1.5;

export function evaluateSwipe(start, end, opts = {}) {
  const {
    edgeZone = EDGE_ZONE_PX,
    minDistance = MIN_DISTANCE_PX,
    maxDuration = MAX_DURATION_MS,
    horizontalRatio = HORIZONTAL_RATIO,
  } = opts;
  if (!start || !end) return false;
  if (start.x > edgeZone) return false;
  const dx = end.x - start.x;
  const dy = Math.abs(end.y - start.y);
  if (dx < minDistance) return false;
  if (dx < dy * horizontalRatio) return false;
  if (end.t - start.t > maxDuration) return false;
  return true;
}

function shouldIgnoreTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return !!target.closest(".pane-resize-divider");
}

export const EdgeSwipeBackHook = {
  mounted() {
    this._start = null;
    this._cancelled = false;

    this._onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        this._cancelled = true;
        this._start = null;
        return;
      }
      if (shouldIgnoreTarget(e.target)) {
        this._cancelled = true;
        this._start = null;
        return;
      }
      const t = e.touches[0];
      if (t.clientX > EDGE_ZONE_PX) {
        this._start = null;
        this._cancelled = false;
        return;
      }
      this._cancelled = false;
      this._start = { x: t.clientX, y: t.clientY, t: Date.now() };
    };

    this._onTouchMove = (e) => {
      if (!this._start || this._cancelled) return;
      if (e.touches.length > 1) {
        this._cancelled = true;
        this._start = null;
      }
    };

    this._onTouchEnd = (e) => {
      const start = this._start;
      this._start = null;
      if (!start || this._cancelled) {
        this._cancelled = false;
        return;
      }
      const t = e.changedTouches[0];
      if (!t) return;
      const end = { x: t.clientX, y: t.clientY, t: Date.now() };
      if (evaluateSwipe(start, end)) {
        this.pushEvent("swipe_back");
      }
    };

    this._onTouchCancel = () => {
      this._start = null;
      this._cancelled = false;
    };

    this.el.addEventListener("touchstart", this._onTouchStart, {
      passive: true,
    });
    this.el.addEventListener("touchmove", this._onTouchMove, { passive: true });
    this.el.addEventListener("touchend", this._onTouchEnd);
    this.el.addEventListener("touchcancel", this._onTouchCancel);
  },

  destroyed() {
    this.el.removeEventListener("touchstart", this._onTouchStart);
    this.el.removeEventListener("touchmove", this._onTouchMove);
    this.el.removeEventListener("touchend", this._onTouchEnd);
    this.el.removeEventListener("touchcancel", this._onTouchCancel);
  },
};
