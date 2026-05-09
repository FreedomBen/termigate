import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import {
  NotificationHook,
  NotificationPermission,
} from "./notification_hook.js";

// Pin the browser-notification surface for command-done and pane-idle
// signals from the server. These are the only client-side checks
// between the server's "this thing is interesting" event and the OS's
// notification tray, so the suppression rules (focus, mode, threshold,
// per-pane cooldown) need to be airtight — a missed notification is
// silent and easy to miss in drive testing.

const ORIGINAL_NOTIFICATION = globalThis.Notification;

let notifInstances;
let NotificationStub;

function installNotificationStub({ permission = "granted" } = {}) {
  notifInstances = [];
  NotificationStub = vi.fn(function (title, opts) {
    this.title = title;
    this.opts = opts;
    this.onclick = null;
    this.close = vi.fn();
    notifInstances.push(this);
  });
  NotificationStub.permission = permission;
  NotificationStub.requestPermission = vi.fn(() => Promise.resolve(permission));
  globalThis.Notification = NotificationStub;
}

function mountNotificationHook({ el } = {}) {
  const handlers = {};
  const hook = Object.create(NotificationHook);
  hook.el = el || document.createElement("div");
  hook.handleEvent = (name, fn) => {
    handlers[name] = fn;
  };
  hook.pushEvent = vi.fn();
  hook.mounted();
  return { hook, handlers };
}

function mountPermissionHook(button) {
  const handlers = {};
  const hook = Object.create(NotificationPermission);
  hook.el = button;
  hook.handleEvent = (name, fn) => {
    handlers[name] = fn;
  };
  hook.pushEvent = vi.fn();
  hook.mounted();
  return { hook, handlers };
}

describe("NotificationHook", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    installNotificationStub({ permission: "granted" });
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_NOTIFICATION === undefined) {
      delete globalThis.Notification;
    } else {
      globalThis.Notification = ORIGINAL_NOTIFICATION;
    }
  });

  it("stores config received via the notification_config push", () => {
    const { hook, handlers } = mountNotificationHook();
    handlers["notification_config"]({
      config: { mode: "shell", min_duration: 10, sound: true },
    });
    expect(hook._config).toEqual({ mode: "shell", min_duration: 10, sound: true });
  });

  it("notify_command_done is a no-op when mode !== 'shell'", () => {
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "activity" } });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "ls",
      exit_code: 0,
      duration_seconds: 60,
    });
    expect(notifInstances).toHaveLength(0);
  });

  it("notify_command_done is a no-op when duration_seconds < min_duration", () => {
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "shell", min_duration: 30 } });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "ls",
      exit_code: 0,
      duration_seconds: 5,
    });
    expect(notifInstances).toHaveLength(0);
  });

  it("fires a notification with the command + exit code when threshold met and tab unfocused", () => {
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "shell", min_duration: 1 } });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "make build",
      exit_code: 0,
      duration_seconds: 42,
    });
    expect(notifInstances).toHaveLength(1);
    expect(notifInstances[0].title).toBe("Command finished: make build");
    expect(notifInstances[0].opts.body).toBe("Exit code: 0 | Duration: 42s");
    expect(notifInstances[0].opts.tag).toBe("termigate-p1");
  });

  it("suppresses notifications when document.hasFocus() is true", () => {
    document.hasFocus.mockReturnValue(true);
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "shell", min_duration: 1 } });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "ls",
      exit_code: 0,
      duration_seconds: 10,
    });
    expect(notifInstances).toHaveLength(0);
  });

  it("suppresses when Notification.permission !== 'granted'", () => {
    NotificationStub.permission = "denied";
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "shell", min_duration: 1 } });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "ls",
      exit_code: 0,
      duration_seconds: 10,
    });
    expect(notifInstances).toHaveLength(0);
  });

  it("activity-mode respects the per-pane 30s cooldown", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    try {
      const { handlers } = mountNotificationHook();
      handlers["notification_config"]({ config: { mode: "activity" } });

      handlers["notify_pane_idle"]({ pane: "p1", idle_seconds: 60 });
      expect(notifInstances).toHaveLength(1);

      // 29s later — within cooldown, suppressed.
      vi.setSystemTime(new Date("2026-01-01T12:00:29Z"));
      handlers["notify_pane_idle"]({ pane: "p1", idle_seconds: 60 });
      expect(notifInstances).toHaveLength(1);

      // 31s later — past cooldown, fires.
      vi.setSystemTime(new Date("2026-01-01T12:00:31Z"));
      handlers["notify_pane_idle"]({ pane: "p1", idle_seconds: 60 });
      expect(notifInstances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notify_pane_idle is a no-op when mode !== 'activity'", () => {
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "shell" } });
    handlers["notify_pane_idle"]({ pane: "p1", idle_seconds: 90 });
    expect(notifInstances).toHaveLength(0);
  });

  it("clicking the rendered notification focuses the window, pushes focus_pane, and closes the notification", () => {
    const focusSpy = vi.fn();
    window.focus = focusSpy;

    const { hook, handlers } = mountNotificationHook();
    handlers["notification_config"]({ config: { mode: "shell", min_duration: 1 } });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "ls",
      exit_code: 0,
      duration_seconds: 10,
    });

    const notif = notifInstances[0];
    notif.onclick();

    expect(focusSpy).toHaveBeenCalled();
    expect(hook.pushEvent).toHaveBeenCalledWith("focus_pane", { pane: "p1" });
    expect(notif.close).toHaveBeenCalled();
  });

  it("silent flag mirrors _config.sound", () => {
    const { handlers } = mountNotificationHook();
    handlers["notification_config"]({
      config: { mode: "shell", min_duration: 1, sound: true },
    });
    handlers["notify_command_done"]({
      pane: "p1",
      command: "ls",
      exit_code: 0,
      duration_seconds: 10,
    });
    expect(notifInstances[0].opts.silent).toBe(false);

    handlers["notification_config"]({
      config: { mode: "shell", min_duration: 1, sound: false },
    });
    handlers["notify_command_done"]({
      pane: "p2",
      command: "ls",
      exit_code: 0,
      duration_seconds: 10,
    });
    expect(notifInstances[1].opts.silent).toBe(true);
  });
});

describe("NotificationPermission", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="perm-btn"></button>
      <span id="notif-permission-status"></span>
    `;
    installNotificationStub({ permission: "default" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_NOTIFICATION === undefined) {
      delete globalThis.Notification;
    } else {
      globalThis.Notification = ORIGINAL_NOTIFICATION;
    }
  });

  it("calls _updateStatus on mount (writes to the status element)", () => {
    const button = document.getElementById("perm-btn");
    mountPermissionHook(button);
    const status = document.getElementById("notif-permission-status");
    expect(status.textContent).toBe("Permission not yet requested");
  });

  it("reflects 'granted' permission state", () => {
    NotificationStub.permission = "granted";
    const button = document.getElementById("perm-btn");
    mountPermissionHook(button);
    expect(document.getElementById("notif-permission-status").textContent).toBe(
      "Permission granted",
    );
  });

  it("reflects 'denied' permission state", () => {
    NotificationStub.permission = "denied";
    const button = document.getElementById("perm-btn");
    mountPermissionHook(button);
    const status = document.getElementById("notif-permission-status");
    expect(status.textContent).toMatch(/denied/i);
  });

  it("click triggers Notification.requestPermission()", () => {
    const button = document.getElementById("perm-btn");
    mountPermissionHook(button);
    button.click();
    expect(NotificationStub.requestPermission).toHaveBeenCalled();
  });

  it("test_notification fires a Notification when permission is granted", () => {
    NotificationStub.permission = "granted";
    const button = document.getElementById("perm-btn");
    const { handlers } = mountPermissionHook(button);
    handlers["test_notification"]();
    expect(notifInstances).toHaveLength(1);
    expect(notifInstances[0].title).toBe("Termigate test");
  });

  it("test_notification does not fire when permission is denied (re-requests instead)", () => {
    NotificationStub.permission = "denied";
    const button = document.getElementById("perm-btn");
    const { handlers } = mountPermissionHook(button);
    handlers["test_notification"]();
    expect(notifInstances).toHaveLength(0);
    expect(NotificationStub.requestPermission).toHaveBeenCalled();
  });

  it("test_notification is a no-op when Notification is undefined", () => {
    delete globalThis.Notification;
    const button = document.getElementById("perm-btn");
    const { handlers } = mountPermissionHook(button);
    expect(() => handlers["test_notification"]()).not.toThrow();
  });

  it("status element is left untouched when Notification is undefined", () => {
    delete globalThis.Notification;
    const button = document.getElementById("perm-btn");
    mountPermissionHook(button);
    expect(
      document.getElementById("notif-permission-status").textContent,
    ).toMatch(/not supported/i);
  });
});
