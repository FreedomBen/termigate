// Client-side password-visibility toggle (F7).
//
// Mounted on the eye / eye-slash button next to a password <input>.
// On click, swap the input's `type` between "password" and "text",
// flip the visible icon, and update aria-label so screen readers
// announce the *next* action ("Show password" / "Hide password").
//
// The password value never round-trips through LiveView state — this
// is a pure DOM operation so the cleartext stays in the browser.
export const PasswordToggleHook = {
  mounted() {
    this.el.addEventListener("click", () => this.toggle());
  },

  toggle() {
    const input = document.getElementById(this.el.dataset.target);
    if (!input) return;
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    const showIcon = this.el.querySelector(".password-toggle-show");
    const hideIcon = this.el.querySelector(".password-toggle-hide");
    showIcon?.classList.toggle("hidden", willShow);
    hideIcon?.classList.toggle("hidden", !willShow);
    this.el.setAttribute(
      "aria-label",
      willShow ? "Hide password" : "Show password",
    );
  },
};
