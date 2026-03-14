const IDLE_COOLDOWN_MS = 30_000; // 30 seconds per-pane cooldown for activity mode

export const NotificationHook = {
  mounted() {
    this._idleCooldowns = {}; // pane -> last notification timestamp
    this._config = {};         // populated by server push

    // Receive notification config from server (on mount and on config change)
    this.handleEvent("notification_config", ({ config }) => {
      this._config = config;
    });

    this.handleEvent("notify_command_done", (data) => {
      if (this._config.mode !== "shell") return;
      if (data.duration_seconds < (this._config.min_duration || 5)) return;
      this._showNotification(data);
    });

    this.handleEvent("notify_pane_idle", (data) => {
      if (this._config.mode !== "activity") return;
      // Per-pane cooldown to prevent spam with low idle thresholds
      const now = Date.now();
      const lastNotify = this._idleCooldowns[data.pane] || 0;
      if (now - lastNotify < IDLE_COOLDOWN_MS) return;
      this._idleCooldowns[data.pane] = now;
      // Prune stale cooldown entries to prevent unbounded growth over long sessions
      for (const [pane, ts] of Object.entries(this._idleCooldowns)) {
        if (now - ts > IDLE_COOLDOWN_MS * 2) delete this._idleCooldowns[pane];
      }
      this._showNotification(data);
    });
  },

  _showNotification(data) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (document.hasFocus()) return; // Don't notify if tab is focused

    const title = data.command
      ? `Command finished: ${data.command}`
      : `Activity stopped in pane`;

    const body = data.command
      ? `Exit code: ${data.exit_code} | Duration: ${data.duration_seconds}s`
      : `Pane ${data.pane} has been idle for ${data.idle_seconds}s`;

    const notification = new Notification(title, {
      body: body,
      tag: `termigate-${data.pane}`, // Replace previous notification for same pane
      icon: "/favicon.ico",
      silent: !(this._config.sound),
    });

    notification.onclick = () => {
      window.focus();
      // Push event to LiveView to focus the pane
      this.pushEvent("focus_pane", { pane: data.pane });
      notification.close();
    };
  },
};
