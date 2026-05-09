import { describe, it, expect, beforeEach } from "vitest";
import { PasswordToggleHook } from "./password_toggle_hook.js";

// F7: pin the password-visibility toggle behavior on the login and
// setup forms. The hook is a thin client-side `type` swap (password
// values never round-trip through LiveView), but the icon + aria
// label state must stay in sync with the input so the affordance
// stays accessible.

function mountHook(button) {
  const hook = Object.create(PasswordToggleHook);
  hook.el = button;
  hook.mounted();
  return hook;
}

function build({ initialType = "password" } = {}) {
  document.body.innerHTML = `
    <input id="pw" type="${initialType}" />
    <button
      id="pw-toggle"
      type="button"
      data-target="pw"
      aria-label="Show password"
    >
      <span class="password-toggle-show">eye</span>
      <span class="password-toggle-hide hidden">eye-slash</span>
    </button>
  `;
  return {
    input: document.getElementById("pw"),
    button: document.getElementById("pw-toggle"),
    show: document.querySelector(".password-toggle-show"),
    hide: document.querySelector(".password-toggle-hide"),
  };
}

describe("PasswordToggleHook (F7)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("flips type=password to type=text on click", () => {
    const { input, button } = build();
    mountHook(button);
    button.click();
    expect(input.type).toBe("text");
  });

  it("toggles back to password on the second click", () => {
    const { input, button } = build();
    mountHook(button);
    button.click();
    button.click();
    expect(input.type).toBe("password");
  });

  it("swaps the eye / eye-slash icons in lockstep with the input type", () => {
    const { button, show, hide } = build();
    mountHook(button);
    expect(show.classList.contains("hidden")).toBe(false);
    expect(hide.classList.contains("hidden")).toBe(true);

    button.click();
    expect(show.classList.contains("hidden")).toBe(true);
    expect(hide.classList.contains("hidden")).toBe(false);

    button.click();
    expect(show.classList.contains("hidden")).toBe(false);
    expect(hide.classList.contains("hidden")).toBe(true);
  });

  it("updates the aria-label so screen readers announce the next action", () => {
    const { button } = build();
    mountHook(button);
    expect(button.getAttribute("aria-label")).toBe("Show password");
    button.click();
    expect(button.getAttribute("aria-label")).toBe("Hide password");
    button.click();
    expect(button.getAttribute("aria-label")).toBe("Show password");
  });

  it("is a no-op when data-target points at a missing input", () => {
    document.body.innerHTML = `
      <button id="orphan" data-target="ghost" aria-label="Show password">
        <span class="password-toggle-show"></span>
        <span class="password-toggle-hide hidden"></span>
      </button>
    `;
    const button = document.getElementById("orphan");
    mountHook(button);
    expect(() => button.click()).not.toThrow();
    expect(button.getAttribute("aria-label")).toBe("Show password");
  });
});
