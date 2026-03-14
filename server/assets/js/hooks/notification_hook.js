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

// Hook for the "Request permission" button on the settings page
export const NotificationPermission = {
  mounted() {
    this._updateStatus();

    this.el.addEventListener("click", () => {
      if (typeof Notification === "undefined") return;
      Notification.requestPermission().then(() => this._updateStatus());
    });

    this.handleEvent("test_notification", () => {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") {
        Notification.requestPermission().then(() => this._updateStatus());
        return;
      }
      new Notification("Termigate test", {
        body: "Notifications are working!",
        tag: "termigate-test",
        icon: "/favicon.ico",
      });
    });
  },

  _updateStatus() {
    const el = document.getElementById("notif-permission-status");
    if (!el) return;
    if (typeof Notification === "undefined") {
      el.textContent = "Notifications not supported in this browser";
      return;
    }
    const perm = Notification.permission;
    if (perm === "granted") {
      el.textContent = "Permission granted";
      el.className = "text-xs text-success";
    } else if (perm === "denied") {
      el.textContent = "Permission denied — enable in browser settings";
      el.className = "text-xs text-error";
    } else {
      el.textContent = "Permission not yet requested";
      el.className = "text-xs text-base-content/40";
    }
  },
};
