import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { Socket } from "phoenix";
import { serverToLocal, resolveTheme } from "../preferences";
import { shouldAutoFit } from "./should_auto_fit";

function isMobile() {
  return window.innerWidth < 640;
}

// How long (ms) after the last scroll tick we treat the inertial glide
// that follows a touch lift-off as finished and resume writing buffered
// output. Long enough to span the gaps between momentum scroll events,
// short enough that output doesn't feel stalled once scrolling stops.
const MOMENTUM_SETTLE_MS = 180;

const TerminalHook = {
  mounted() {
    const target = this.el.dataset.target;

    // Load preferences from server config (passed via data attribute)
    const serverPrefs = JSON.parse(this.el.dataset.terminalPrefs || "{}");
    this._serverPrefs = serverPrefs;
    const prefs = serverToLocal(serverPrefs);

    this._isMobile = isMobile();

    console.log("[TerminalHook] mounted", {
      target,
      isMobile: this._isMobile,
      dataCols: this.el.dataset.cols,
      dataRows: this.el.dataset.rows,
      elWidth: this.el.offsetWidth,
      elHeight: this.el.offsetHeight,
    });

    // Use the tmux pane's actual dimensions so captured scrollback renders
    // correctly. On attach, the server captures whatever tmux retains in
    // history and writes it here, so this cap needs to be large enough to
    // hold a typical user-raised tmux history-limit (often 10–50K lines).
    // xterm.js allocates scrollback rows lazily, so the cost scales with
    // actual usage, not the cap.
    const termOpts = {
      fontSize: prefs.fontSize,
      fontFamily: prefs.fontFamily,
      cursorStyle: prefs.cursorStyle,
      cursorBlink: prefs.cursorBlink,
      scrollback: 50000,
      theme: resolveTheme(prefs),
    };

    const tmuxCols = parseInt(this.el.dataset.cols, 10);
    const tmuxRows = parseInt(this.el.dataset.rows, 10);
    if (tmuxCols && tmuxRows) {
      termOpts.cols = tmuxCols;
      termOpts.rows = tmuxRows;
    }

    // Create xterm.js terminal
    this.term = new Terminal(termOpts);

    // Addons
    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon());

    // Open terminal in container
    this.term.open(this.el);

    // Renderer. xterm's built-in DOM renderer re-renders rows on the main
    // thread on every scroll tick, which janks touch scrolling on mobile
    // while output streams: dropped scroll frames, one-line-at-a-time
    // steps, and stutter on BOTH axes (the viewport scrolls in x and y).
    // Prefer the GPU WebGL renderer, fall back to the 2D Canvas renderer,
    // then to DOM. Must load after open() so the render service exists.
    this._renderer = null;
    const useCanvas = () => {
      try {
        const canvas = new CanvasAddon();
        this.term.loadAddon(canvas);
        this._renderer = canvas;
      } catch (e) {
        // Leave xterm's built-in DOM renderer in place.
        this._renderer = null;
        console.warn("[TerminalHook] Canvas renderer unavailable, using DOM", e);
      }
    };
    try {
      const webgl = new WebglAddon();
      // Mobile GPUs cap concurrent WebGL contexts; a multi-pane window can
      // lose one. Drop that pane to Canvas so it keeps painting instead of
      // freezing on a dead context.
      webgl.onContextLoss(() => {
        if (this._renderer === webgl) {
          webgl.dispose();
          this._renderer = null;
          useCanvas();
        }
      });
      this.term.loadAddon(webgl);
      this._renderer = webgl;
    } catch (e) {
      // WebGL2 missing (older mobile browsers, blocklisted GPUs).
      console.warn("[TerminalHook] WebGL renderer unavailable, trying Canvas", e);
      useCanvas();
    }

    // Expose this hook on the element so sibling hooks (e.g. the mobile
    // "fit pane to screen" button) can read xterm cell metrics for resizing.
    this.el._termHook = this;

    // Block textarea focus when on-screen keyboard is disabled by the user.
    // Covers every focus path (xterm's internal touch handler, our tap-to-
    // focus logic, programmatic term.focus() calls, etc.).
    if (this.term.textarea) {
      // xterm's helper textarea has aria-label but no id/name, which
      // trips the DevTools "form field needs id or name" a11y check and
      // also invites password managers to autofill it. Give it a stable
      // per-pane name and disable autofill.
      this.term.textarea.name = `terminal-input-${target || "default"}`;
      this.term.textarea.setAttribute("autocomplete", "off");
      this.term.textarea.setAttribute("data-1p-ignore", "");
      this.term.textarea.setAttribute("data-lpignore", "true");

      // Override xterm's default "Terminal input" aria-label with a
      // pane-specific one so screen readers and a11y tooling can tell
      // multiple panes apart. Target format is "session:window.N";
      // fall back to the raw target for non-pane contexts.
      const paneNumber = target ? String(target).split(".").pop() : null;
      if (paneNumber !== null && /^\d+$/.test(paneNumber)) {
        this.term.textarea.setAttribute("aria-label", `pane ${paneNumber}`);
      }

      this.term.textarea.addEventListener("focus", (e) => {
        if (!this._getMobileKeyboardEnabled()) {
          e.target.blur();
          return;
        }
        // Block xterm's focus-on-touchstart while a tap is still pending.
        // touchend clears _tapPending before calling focus(), so a real
        // tap still goes through; a drag/scroll clears it earlier in
        // touchmove and never reaches the focus call.
        if (this._tapPending) {
          e.target.blur();
          return;
        }
        // On mobile, only allow focus from a confirmed direct tap on the
        // pane. Block every other path (server-pushed focus, browser focus
        // restoration after LiveView morph, xterm-internal handlers, etc.)
        // so switching panes via a tab click never opens the soft keyboard.
        if (this._isMobile && !this._allowFocus) {
          e.target.blur();
        }
      });
    }

    // Skip the synchronous fit() so the initial history renders at tmux's
    // dimensions. The window-resize-driven fit below re-fits once the CSS
    // Grid layout has settled.

    console.log("[TerminalHook] after setup", {
      target,
      termCols: this.term.cols,
      termRows: this.term.rows,
    });

    // Connect companion Channel for binary I/O
    this._connectChannel(target);

    // Input handling: buffer keystrokes and flush periodically
    this._inputBuffer = [];
    this._inputTimer = null;
    this._encoder = new TextEncoder();

    this.term.onData((data) => {
      this._inputBuffer.push(data);
      const totalBytes = this._inputBuffer.reduce((s, d) => s + d.length, 0);

      if (totalBytes >= 64) {
        this._flushInput();
      } else if (!this._inputTimer) {
        this._inputTimer = requestAnimationFrame(() => {
          this._inputTimer = null;
          this._flushInput();
        });
      }
    });

    // Resize handling with debounce. On non-mobile, fit the terminal to its
    // container on mount and on browser resize/zoom. We use the window
    // "resize" event rather than a ResizeObserver because ResizeObserver
    // also fires when the LiveView re-renders the CSS Grid (after
    // LayoutPoller updates), which creates a feedback loop (fit → tmux
    // resize → layout update → grid change → observer fires → fit again).
    // Mobile intentionally skips this listener — see shouldAutoFit().
    this._resizeTimer = null;
    if (shouldAutoFit({ isMobile: this._isMobile })) {
      this._initialFitDone = false;
      this._paneFit = () => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
          const prevCols = this.term.cols;
          const prevRows = this.term.rows;
          this.fitAddon.fit();
          // Only push resize for user-initiated window resizes, not the
          // initial mount — viewing the page shouldn't resize tmux panes.
          if (this._initialFitDone && this.channel && this.term &&
              (this.term.cols !== prevCols || this.term.rows !== prevRows)) {
            this.channel.push("resize", { cols: this.term.cols, rows: this.term.rows });
          }
          this._initialFitDone = true;
        }, 300);
      };
      this._paneFit();
      window.addEventListener("resize", this._paneFit);
    }

    // Handle pane_resized from other viewers or layout changes (via LiveView)
    this.handleEvent("pane_resized", ({ target, cols, rows }) => {
      if (!target || target === this.el.dataset.target) {
        this.term.resize(cols, rows);
      }
    });

    // Clipboard: Ctrl+Shift+V to paste
    this.el.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "V") {
        e.preventDefault();
        this._pasteFromClipboard();
      }
    });

    this._setupMobileKeyboardToggle();
    this._setupBarsToggle();

    // --- Live config updates from server ---
    this.handleEvent("terminal_prefs", (serverPrefs) => {
      this._applyTerminalPrefs(serverPrefs);
    });

    // Keep the channel-scope meta tag fresh so Phoenix.Channel rejoins (which
    // re-evaluate joinParams via buildJoinParams) read a non-expired token.
    this.handleEvent("channel_scope_refreshed", ({ scope }) => {
      const meta = document.querySelector("meta[name='channel-scope']");
      if (meta && scope) meta.setAttribute("content", scope);
    });

    // Notify LiveView when this pane gets focus. Skipped in single-pane
    // mode — active_pane never changes, and the touchstart push is a
    // measurable source of mobile scroll jank. Checked lazily because
    // panes can be split open after mount.
    const notifyFocus = () => {
      if (document.querySelectorAll('[phx-hook="TerminalHook"]').length > 1) {
        this.pushEvent("pane_focused", { target: this.el.dataset.target });
      }
    };
    this.term.textarea?.addEventListener("focus", notifyFocus);
    this.el.addEventListener("mousedown", notifyFocus);
    // Pause output writes during a mobile touch *and* through the
    // inertial scroll that keeps gliding after the finger lifts. xterm.js
    // adjusts scrollTop every time new bytes arrive while the user is
    // scrolled up (its "preserve scrollback position" behavior), which
    // fights momentum scroll and strands the user at one-line-per-
    // gesture progress. The pause spans two phases: _touchActive (finger
    // down) and _momentumActive (the post-lift glide, detected via
    // xterm's onScroll below). Buffered output drains in one shot once
    // both clear, so xterm's adjustment happens at most once per gesture.
    this._touchActive = false;
    this._momentumActive = false;
    this._momentumTimer = null;
    this._touchOutputQueue = [];

    const flushTouchOutput = () => {
      if (this._touchOutputQueue.length === 0) return;
      const queued = this._touchOutputQueue;
      this._touchOutputQueue = [];
      for (const chunk of queued) {
        this.term?.write(chunk);
      }
    };
    const clearMomentumTimer = () => {
      if (this._momentumTimer) {
        clearTimeout(this._momentumTimer);
        this._momentumTimer = null;
      }
    };
    // Immediately end the pause and drain. Used for confirmed taps (no
    // scrolling to wait out), touchcancel, and teardown.
    const endTouchPause = () => {
      this._touchActive = false;
      this._momentumActive = false;
      clearMomentumTimer();
      flushTouchOutput();
    };
    // After a scroll gesture lifts off, the view keeps gliding with no
    // finger down. Keep buffering and (re)arm a settle timer; each
    // onScroll tick below pushes the deadline out, so we only drain once
    // the glide actually stops.
    const armMomentumSettle = () => {
      clearMomentumTimer();
      this._momentumTimer = setTimeout(() => {
        this._momentumTimer = null;
        this._momentumActive = false;
        flushTouchOutput();
      }, MOMENTUM_SETTLE_MS);
    };

    // xterm fires onScroll for every viewport scroll, including the
    // native inertial glide after touchend. While the momentum pause is
    // armed, each tick resets the settle timer. The flush is what
    // re-enables direct writes, so the scroll it triggers can't re-arm.
    this._scrollDisposable = this.term.onScroll(() => {
      if (this._momentumActive) armMomentumSettle();
    });

    // Tap-vs-scroll detection: defer both pane_focused and the soft
    // keyboard until touchend confirms a tap (no movement). Scrolls
    // never push the event — that's the whole point. Capture phase so
    // we set _tapPending before xterm's bubble-phase touchstart handler
    // tries to focus the textarea.
    this.el.addEventListener("touchstart", (e) => {
      if (this._isMobile) {
        this._touchActive = true;
        // Finger back down during the post-gesture glide: cancel the
        // momentum settle so buffering continues under _touchActive
        // until the next lift-off instead of draining mid-interaction.
        this._momentumActive = false;
        clearMomentumTimer();
      }
      if (e.touches.length === 1) {
        this._tapPending = true;
      }
    }, { passive: true, capture: true });

    this.el.addEventListener("touchmove", () => {
      if (this._tapPending) {
        this._tapPending = false;
        if (document.activeElement === this.term?.textarea) {
          this.term.textarea.blur();
        }
      }
    }, { passive: true });

    this.el.addEventListener("touchend", () => {
      if (this._tapPending) {
        // Confirmed tap (touchmove never fired): nothing is scrolling, so
        // end the pause and drain now, then run the deferred focus. Clear
        // _tapPending before focus() so the textarea focus listener
        // doesn't blur the tap we're trying to honor.
        this._tapPending = false;
        endTouchPause();
        this._allowFocus = true;
        // Push before focus(): mobile-keyboard-disabled mode blocks the
        // textarea focus event, so we can't rely on the focus listener
        // alone to fire notifyFocus.
        notifyFocus();
        this.term?.focus();
        queueMicrotask(() => { this._allowFocus = false; });
      } else if (this._isMobile) {
        // Scroll/drag lift-off: keep buffering through the inertial glide
        // instead of draining straight away (see armMomentumSettle).
        this._touchActive = false;
        this._momentumActive = true;
        armMomentumSettle();
      } else {
        endTouchPause();
      }
    }, { passive: true });

    this.el.addEventListener("touchcancel", endTouchPause, { passive: true });

    // Listen for server-initiated focus (e.g. after creating a new window).
    // On mobile, skip the focus call so the soft keyboard doesn't pop up just
    // from switching panes via a tab click — the keyboard should only appear
    // when the user taps the terminal directly (handled by touchend above).
    this.handleEvent("focus_terminal", ({ pane }) => {
      if (pane === this.el.dataset.target && !this._isMobile) {
        this.term?.focus();
      }
    });

    // Drives xterm.js scrollback navigation from the secondary mobile
    // control bar's ^U / ^D / Bottom buttons. Only the active pane's hook
    // responds. These operate on whatever's already in xterm's scrollback
    // buffer, regardless of scroll mode.
    this.handleEvent("scrollback_action", ({ target, action }) => {
      if (target !== this.el.dataset.target || !this.term) return;
      const half = Math.max(1, Math.ceil(this.term.rows / 2));
      switch (action) {
        case "page-up":
          this.term.scrollPages(-1);
          break;
        case "halfpage-up":
          this.term.scrollLines(-half);
          break;
        case "halfpage-down":
          this.term.scrollLines(half);
          break;
        case "bottom":
          this.term.scrollToBottom();
          break;
      }
    });

    // Scroll mode: server snapshots tmux's full retained history and
    // pushes it here. While _scrollMode is true we ignore live channel
    // output and refuse to forward input — the user is looking at a
    // frozen snapshot, scrolling natively. Exit fires another snapshot
    // so the resumed live view starts from current state, not whatever
    // was last on screen before the snapshot.
    this._scrollMode = false;
    this.handleEvent("scroll_mode_enter", ({ target, history }) => {
      if (target !== this.el.dataset.target || !this.term) return;
      this._scrollMode = true;
      this.term.reset();
      if (history) {
        const bytes = Uint8Array.from(atob(history), (c) => c.charCodeAt(0));
        this.term.write(bytes);
      }
    });
    this.handleEvent("scroll_mode_exit", ({ target, history }) => {
      if (target !== this.el.dataset.target || !this.term) return;
      this._scrollMode = false;
      this.term.reset();
      if (history) {
        const bytes = Uint8Array.from(atob(history), (c) => c.charCodeAt(0));
        this.term.write(bytes);
      }
    });

    // Re-fit when a pane is maximized. Mobile intentionally does not
    // auto-fit (see shouldAutoFit()) — we just repaint the terminal so the
    // previously-hidden cells render at tmux's existing dimensions.
    this.handleEvent("pane_maximized", ({ target }) => {
      if (target === this.el.dataset.target) {
        if (shouldAutoFit({ isMobile: this._isMobile })) {
          setTimeout(() => {
            const prevCols = this.term.cols;
            const prevRows = this.term.rows;
            this.fitAddon.fit();
            if (this.channel && this.term &&
                (this.term.cols !== prevCols || this.term.rows !== prevRows)) {
              this.channel.push("resize", { cols: this.term.cols, rows: this.term.rows });
            }
          }, 50);
        } else {
          this.term?.refresh(0, this.term.rows - 1);
        }
      }
    });

    // Auto-focus if this is the only terminal on the page (new window).
    if (document.querySelectorAll('[phx-hook="TerminalHook"]').length === 1) {
      this.term?.focus();
    }
  },

  // Returns current prefs in camelCase (for preferences panel)
  getLocalPrefs() {
    return serverToLocal(this._serverPrefs || {});
  },

  _applyTerminalPrefs(serverPrefs) {
    this._serverPrefs = serverPrefs;
    if (!this.term) return;
    const local = serverToLocal(serverPrefs);
    this.term.options.fontSize = local.fontSize;
    this.term.options.fontFamily = local.fontFamily;
    this.term.options.theme = resolveTheme(local);
    this.term.options.cursorStyle = local.cursorStyle;
    this.term.options.cursorBlink = local.cursorBlink;
    if (shouldAutoFit({ isMobile: this._isMobile })) {
      this.fitAddon?.fit();
    }
  },

  // --- Mobile on-screen keyboard toggle ---
  _getMobileKeyboardEnabled() {
    const serverDefault =
      this._serverPrefs?.mobile_keyboard_enabled !== false;
    try {
      const v = localStorage.getItem("termigate:mobileKeyboardEnabled");
      return v === null ? serverDefault : v !== "false";
    } catch {
      return serverDefault;
    }
  },

  _setMobileKeyboardEnabled(enabled) {
    try {
      localStorage.setItem(
        "termigate:mobileKeyboardEnabled",
        enabled ? "true" : "false",
      );
    } catch {}
  },

  _setupMobileKeyboardToggle() {
    const btn = document.querySelector("#mobile-keyboard-toggle");
    if (!btn || btn._termigateWired) return;
    btn._termigateWired = true;

    const onIcon = btn.querySelector(".kb-icon-on");
    const offIcon = btn.querySelector(".kb-icon-off");
    const applyState = (enabled) => {
      onIcon?.classList.toggle("hidden", !enabled);
      offIcon?.classList.toggle("hidden", enabled);
      btn.setAttribute("aria-pressed", enabled ? "false" : "true");
    };
    applyState(this._getMobileKeyboardEnabled());

    btn.addEventListener("click", () => {
      const next = !this._getMobileKeyboardEnabled();
      this._setMobileKeyboardEnabled(next);
      applyState(next);
      if (!next && this.term?.textarea) this.term.textarea.blur();
    });
  },

  // --- Collapsible tabs + control bar ---
  _setupBarsToggle() {
    const group = document.querySelector("#bars-group");
    const btn = document.querySelector("#bars-toggle-btn");
    if (!group || !btn || btn._termigateWired) return;
    btn._termigateWired = true;

    const upIcon = btn.querySelector(".bars-chevron-up");
    const downIcon = btn.querySelector(".bars-chevron-down");
    const key = "termigate:barsCollapsed";

    const isCollapsed = () => {
      try {
        return localStorage.getItem(key) === "true";
      } catch {
        return false;
      }
    };
    const setCollapsed = (v) => {
      try {
        localStorage.setItem(key, v ? "true" : "false");
      } catch {}
    };
    const apply = (collapsed) => {
      group.classList.toggle("bars-collapsed", collapsed);
      upIcon?.classList.toggle("hidden", collapsed);
      downIcon?.classList.toggle("hidden", !collapsed);
      btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    };
    apply(isCollapsed());

    btn.addEventListener("click", () => {
      const next = !isCollapsed();
      setCollapsed(next);
      apply(next);
    });
  },

  // --- Paste from clipboard ---
  _pasteFromClipboard() {
    // Scroll mode = view-only; pasting into a frozen snapshot would
    // confuse the user (no visible feedback). The keyboard-typing path
    // is gated in `_flushInput`; this gate covers the Ctrl+Shift+V path.
    if (this._scrollMode) return;
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      // Show a brief message if clipboard API is unavailable
      this.term?.write("\r\n\x1b[33m[Clipboard requires HTTPS or localhost]\x1b[0m\r\n");
      return;
    }
    navigator.clipboard.readText().then((text) => {
      if (text && this.channel) {
        this.channel.push("input", { data: text });
      }
    }).catch(() => {
      // Permission denied or other error — silently ignore
    });
  },

  _connectChannel(target) {
    // Phoenix's WS connect_info session decoder runs a CSRF check against the
    // session's stored CSRF state, so the upgrade URL must carry the live
    // token from the page's <meta name="csrf-token">. Without it, the
    // session map arrives empty in UserSocket.connect/3 and cookie auth is
    // refused with a 403.
    const csrfMeta = document.querySelector("meta[name='csrf-token']");
    const csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : null;

    // Convert target "session:window.pane" to topic "terminal:session:window:pane"
    const topic =
      "terminal:" + target.replace(/\./, ":").replace(/^([^:]+):/, "$1:");

    // Use existing socket or create one
    if (!window.userSocket) {
      window.userSocket = new Socket("/socket", {
        params: { _csrf_token: csrfToken },
      });
      window.userSocket.connect();
    }

    // Pass a function so Phoenix re-evaluates params on every (re)join. The
    // Plug session cookie authenticates the WebSocket; the page-supplied
    // scope token (short-lived, single-purpose) pins this channel to one
    // tmux session. The LiveView refreshes the meta tag periodically and
    // pushes "channel_scope_refreshed" to keep this rejoin-safe after long
    // idle periods (mobile background, screen-lock).
    const buildJoinParams = () => {
      const params = {};
      const meta = document.querySelector("meta[name='channel-scope']");
      if (meta && meta.content) params.scope = meta.content;
      return params;
    };
    this.channel = window.userSocket.channel(topic, buildJoinParams);
    this.channel
      .join()
      .receive("ok", (reply) => {
        // Write history from join reply (base64 encoded)
        if (reply.history) {
          const historyBytes = Uint8Array.from(atob(reply.history), (c) =>
            c.charCodeAt(0)
          );
          console.log("[TerminalHook] received history", {
            bytes: historyBytes.length,
            termCols: this.term.cols,
            termRows: this.term.rows,
          });
          this.term.write(historyBytes);
        }
      })
      .receive("error", (reason) => {
        this.term.write(
          `\r\n\x1b[31mFailed to connect: ${reason.reason || "unknown"}\x1b[0m\r\n`
        );
      });

    // Output from server. While in scroll mode we drop incoming output
    // entirely — the user is viewing a frozen snapshot. On exit the
    // server re-snapshots and pushes scroll_mode_exit, which repaints
    // current state, so the dropped bytes are not lost; they're folded
    // into the resync.
    this.channel.on("output", (msg) => {
      if (this._scrollMode) return;
      if (msg.data) {
        const bytes = Uint8Array.from(atob(msg.data), (c) =>
          c.charCodeAt(0)
        );
        if (this._touchActive || this._momentumActive) {
          this._touchOutputQueue.push(bytes);
        } else {
          this.term.write(bytes);
        }
      }
    });

    // Reconnected — reset and write fresh history
    this.channel.on("reconnected", (msg) => {
      this.term.reset();
      if (msg.data) {
        const bytes = Uint8Array.from(atob(msg.data), (c) =>
          c.charCodeAt(0)
        );
        this.term.write(bytes);
      }
    });

    // Pane died
    this.channel.on("pane_dead", () => {
      this.term.write("\r\n\x1b[33m[Session ended]\x1b[0m\r\n");
    });

    // Pane superseded
    this.channel.on("superseded", (_msg) => {
      // LiveView handles navigation
    });
  },

  _flushInput() {
    if (this._inputBuffer.length === 0) return;

    const combined = this._inputBuffer.join("");
    this._inputBuffer = [];

    // Drop input while in scroll mode — the visible terminal is a
    // frozen snapshot, so forwarding keystrokes would send them to a
    // pane the user can't see, which is confusing. Clipboard paste
    // (`_pasteFromClipboard`) and the secondary control bar's special
    // keys go through their own paths and are similarly gated by the
    // server (scroll mode is per-viewer; other viewers stay live).
    if (this._scrollMode) return;

    if (this.channel) {
      this.channel.push("input", { data: combined });
    }
  },

  destroyed() {
    if (this.channel) {
      this.channel.leave();
      this.channel = null;
    }
    if (this._paneFit) {
      window.removeEventListener("resize", this._paneFit);
    }
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
    }
    if (this._inputTimer) {
      cancelAnimationFrame(this._inputTimer);
    }
    if (this._momentumTimer) {
      clearTimeout(this._momentumTimer);
    }
    if (this._scrollDisposable) {
      this._scrollDisposable.dispose();
      this._scrollDisposable = null;
    }
    // Release the GPU/canvas context promptly (mobile caps concurrent
    // contexts). Disposing again via term.dispose() below is a safe no-op.
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
    if (this.el._termHook === this) {
      delete this.el._termHook;
    }
  },

  // Compute how many xterm columns fit in the current viewport width.
  // Returns null if the renderer hasn't measured a cell yet.
  viewportFitCols() {
    const cellWidth =
      this.term?._core?._renderService?.dimensions?.css?.cell?.width;
    if (!cellWidth || cellWidth <= 0) return null;
    return Math.max(2, Math.floor(window.innerWidth / cellWidth));
  },
};

export { TerminalHook };
