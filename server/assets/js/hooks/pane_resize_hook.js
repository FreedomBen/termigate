/**
 * PaneResizeHook — draggable dividers between panes in the multi-pane grid.
 *
 * Reads pane layout data from data attributes, creates invisible hit-area
 * dividers at each tmux separator track, and handles mouse/touch drag
 * to resize tmux panes in real time.
 *
 * tmux inserts 1-char separator lines between panes, so adjacent panes
 * don't share exact boundaries. E.g. pane A ends at col 87, separator
 * occupies col 87-88, pane B starts at col 88. We detect these separator
 * tracks and place dividers on them.
 */

function getPointer(e, isEnd = false) {
  if (e.type.startsWith("touch")) {
    const t = isEnd ? e.changedTouches[0] : e.touches[0];
    return { x: t.clientX, y: t.clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

const PaneResizeHook = {
  mounted() {
    this._isDragging = false;
    this._pendingUpdate = false;
    this._drag = null;

    this._resizeTimer = null;
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        if (!this._isDragging) this._setupDividers();
      }, 120);
    };
    window.addEventListener("resize", this._onResize);

    this._setupDragHandlers();
    requestAnimationFrame(() => this._setupDividers());
  },

  updated() {
    if (this._isDragging) {
      this._pendingUpdate = true;
    } else {
      this._setupDividers();
    }
  },

  destroyed() {
    window.removeEventListener("resize", this._onResize);
    clearTimeout(this._resizeTimer);
    this._cleanupDrag?.();
  },

  // ── Divider creation ──────────────────────────────────────────────

  /**
   * Detect separator tracks in a list of boundary values.
   *
   * A separator track `t` (colBounds[t]..colBounds[t+1]) is one where
   * no pane occupies it. We return objects describing each separator:
   *   { trackIndex, leftPanes/topPanes, rightPanes/bottomPanes }
   */
  _findSeparators(bounds, panes, axis) {
    const isCol = axis === "col";
    const numTracks = bounds.length - 1;
    const separators = [];

    for (let t = 0; t < numTracks; t++) {
      const lo = bounds[t];
      const hi = bounds[t + 1];

      // A separator track has panes ending at its start and starting at its end.
      // We don't check "covered" because full-height panes can span across a
      // horizontal separator that only applies to shorter panes beside them.
      const before = panes.filter((p) =>
        isCol ? p.left + p.width === lo : p.top + p.height === lo,
      );
      const after = panes.filter((p) =>
        isCol ? p.left === hi : p.top === hi,
      );
      if (!before.length || !after.length) continue;

      separators.push({ trackIndex: t, before, after });
    }
    return separators;
  },

  _setupDividers() {
    const container = document.getElementById("pane-dividers");
    if (!container) return;

    while (container.firstChild) container.removeChild(container.firstChild);

    if (this.el.dataset.maximized) return;

    let panes, colBounds, rowBounds;
    try {
      panes = JSON.parse(this.el.dataset.panes || "[]");
      colBounds = JSON.parse(this.el.dataset.colBounds || "[]");
      rowBounds = JSON.parse(this.el.dataset.rowBounds || "[]");
    } catch {
      return;
    }
    if (panes.length <= 1) return;

    const gridRect = this.el.getBoundingClientRect();
    if (gridRect.width === 0 || gridRect.height === 0) return;

    // Pane wrapper pixel rects relative to grid
    const rects = {};
    for (const p of panes) {
      const el = document.getElementById(`pane-wrapper-${p.target}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      rects[p.target] = {
        left: r.left - gridRect.left,
        top: r.top - gridRect.top,
        right: r.right - gridRect.left,
        bottom: r.bottom - gridRect.top,
      };
    }

    // Vertical dividers (column separator tracks)
    for (const sep of this._findSeparators(colBounds, panes, "col")) {
      const lr = rects[sep.before[0].target];
      const rr = rects[sep.after[0].target];
      if (!lr || !rr) continue;

      const gapCenter = (lr.right + rr.left) / 2;
      const allRects = [...sep.before, ...sep.after]
        .map((p) => rects[p.target])
        .filter(Boolean);
      const top = Math.min(...allRects.map((r) => r.top));
      const bottom = Math.max(...allRects.map((r) => r.bottom));

      const div = document.createElement("div");
      div.className = "pane-divider pane-divider-v";
      div.style.left = `${gapCenter - 5}px`;
      div.style.top = `${top}px`;
      div.style.height = `${bottom - top}px`;
      div.dataset.axis = "col";
      div.dataset.sepTrack = sep.trackIndex;
      div.dataset.target = sep.before[0].target;
      container.appendChild(div);
    }

    // Horizontal dividers (row separator tracks)
    for (const sep of this._findSeparators(rowBounds, panes, "row")) {
      const tr = rects[sep.before[0].target];
      const br = rects[sep.after[0].target];
      if (!tr || !br) continue;

      const gapCenter = (tr.bottom + br.top) / 2;
      const allRects = [...sep.before, ...sep.after]
        .map((p) => rects[p.target])
        .filter(Boolean);
      const left = Math.min(...allRects.map((r) => r.left));
      const right = Math.max(...allRects.map((r) => r.right));

      const div = document.createElement("div");
      div.className = "pane-divider pane-divider-h";
      div.style.top = `${gapCenter - 5}px`;
      div.style.left = `${left}px`;
      div.style.width = `${right - left}px`;
      div.dataset.axis = "row";
      div.dataset.sepTrack = sep.trackIndex;
      div.dataset.target = sep.before[0].target;
      container.appendChild(div);
    }
  },

  // ── Drag handling ─────────────────────────────────────────────────

  _setupDragHandlers() {
    const onStart = (e) => {
      const divider = e.target.closest(".pane-divider");
      if (!divider) return;
      e.preventDefault();

      const pos = getPointer(e);
      const style = getComputedStyle(this.el);
      const sepTrack = parseInt(divider.dataset.sepTrack, 10);

      this._isDragging = true;
      this._drag = {
        divider,
        startX: pos.x,
        startY: pos.y,
        axis: divider.dataset.axis,
        sepTrack,
        // The pane track indices on either side of the separator
        leftIdx: sepTrack - 1,
        rightIdx: sepTrack + 1,
        target: divider.dataset.target,
        origColStyle: this.el.style.gridTemplateColumns,
        origRowStyle: this.el.style.gridTemplateRows,
        origColSizes: style.gridTemplateColumns.split(" ").map(parseFloat),
        origRowSizes: style.gridTemplateRows.split(" ").map(parseFloat),
      };

      divider.classList.add("pane-divider-active");
      document.body.style.cursor =
        divider.dataset.axis === "col" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
    };

    const onMove = (e) => {
      if (!this._drag) return;
      e.preventDefault();

      const pos = getPointer(e);
      const d = this._drag;
      const MIN_TRACK = 20;

      if (d.axis === "col") {
        const delta = pos.x - d.startX;
        const newLeft = d.origColSizes[d.leftIdx] + delta;
        const newRight = d.origColSizes[d.rightIdx] - delta;

        if (newLeft >= MIN_TRACK && newRight >= MIN_TRACK) {
          const sizes = [...d.origColSizes];
          sizes[d.leftIdx] = newLeft;
          sizes[d.rightIdx] = newRight;
          this.el.style.gridTemplateColumns = sizes
            .map((s) => `${s}px`)
            .join(" ");
        }
      } else {
        const delta = pos.y - d.startY;
        const newTop = d.origRowSizes[d.leftIdx] + delta;
        const newBottom = d.origRowSizes[d.rightIdx] - delta;

        if (newTop >= MIN_TRACK && newBottom >= MIN_TRACK) {
          const sizes = [...d.origRowSizes];
          sizes[d.leftIdx] = newTop;
          sizes[d.rightIdx] = newBottom;
          this.el.style.gridTemplateRows = sizes
            .map((s) => `${s}px`)
            .join(" ");
        }
      }
    };

    const onEnd = (e) => {
      if (!this._drag) return;

      const d = this._drag;
      d.divider.classList.remove("pane-divider-active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      this._isDragging = false;

      const pos = getPointer(e, true);

      if (d.axis === "col") {
        const delta = pos.x - d.startX;
        const colBounds = JSON.parse(this.el.dataset.colBounds || "[]");
        const totalCols = colBounds[colBounds.length - 1];
        const totalPx = d.origColSizes.reduce((a, b) => a + b, 0);
        const pxPerCol = totalPx / totalCols;
        const deltaCols = Math.round(delta / pxPerCol);

        if (deltaCols !== 0) {
          this.pushEvent("resize_pane_drag", {
            target: d.target,
            axis: "x",
            delta: deltaCols,
          });
        } else {
          this.el.style.gridTemplateColumns = d.origColStyle;
          this.el.style.gridTemplateRows = d.origRowStyle;
        }
      } else {
        const delta = pos.y - d.startY;
        const rowBounds = JSON.parse(this.el.dataset.rowBounds || "[]");
        const totalRows = rowBounds[rowBounds.length - 1];
        const totalPx = d.origRowSizes.reduce((a, b) => a + b, 0);
        const pxPerRow = totalPx / totalRows;
        const deltaRows = Math.round(delta / pxPerRow);

        if (deltaRows !== 0) {
          this.pushEvent("resize_pane_drag", {
            target: d.target,
            axis: "y",
            delta: deltaRows,
          });
        } else {
          this.el.style.gridTemplateColumns = d.origColStyle;
          this.el.style.gridTemplateRows = d.origRowStyle;
        }
      }

      this._drag = null;

      if (this._pendingUpdate) {
        this._pendingUpdate = false;
        requestAnimationFrame(() => this._setupDividers());
      }
    };

    this.el.addEventListener("mousedown", onStart);
    this.el.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchend", onEnd);

    this._cleanupDrag = () => {
      this.el.removeEventListener("mousedown", onStart);
      this.el.removeEventListener("touchstart", onStart);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchend", onEnd);
    };
  },
};

export { PaneResizeHook };
