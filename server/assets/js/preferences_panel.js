// Client-side preferences slide-out panel.
// Triggered by gear icon in terminal header.
// Applies changes live to the terminal — no server interaction.

import {
  THEMES,
  FONT_FAMILIES,
  loadPrefs,
  savePrefs,
  resolveTheme,
} from "./preferences";

let panelEl = null;
let backdropEl = null;
let currentTerminal = null;
let currentFitAddon = null;
let onToolbarToggle = null;

function open(term, fitAddon, toolbarCallback) {
  if (panelEl) return; // already open
  currentTerminal = term;
  currentFitAddon = fitAddon;
  onToolbarToggle = toolbarCallback;

  const prefs = loadPrefs();

  // Backdrop
  backdropEl = document.createElement("div");
  backdropEl.className = "prefs-backdrop";
  backdropEl.addEventListener("click", close);
  document.body.appendChild(backdropEl);

  // Panel
  panelEl = document.createElement("div");
  panelEl.className = "prefs-panel";
  panelEl.innerHTML = buildHTML(prefs);
  document.body.appendChild(panelEl);

  // Animate in
  requestAnimationFrame(() => {
    backdropEl.classList.add("prefs-backdrop-visible");
    panelEl.classList.add("prefs-panel-visible");
  });

  bindEvents(prefs);
}

function close() {
  if (!panelEl) return;
  panelEl.classList.remove("prefs-panel-visible");
  backdropEl.classList.remove("prefs-backdrop-visible");
  setTimeout(() => {
    panelEl?.remove();
    backdropEl?.remove();
    panelEl = null;
    backdropEl = null;
    currentTerminal = null;
    currentFitAddon = null;
    onToolbarToggle = null;
  }, 200);
}

function buildHTML(prefs) {
  const fontOptions = FONT_FAMILIES.map(
    (f) =>
      `<option value="${f.value}" ${prefs.fontFamily === f.value ? "selected" : ""}>${f.label}</option>`
  ).join("");

  const themeOptions = Object.keys(THEMES)
    .map(
      (t) =>
        `<option value="${t}" ${prefs.theme === t ? "selected" : ""}>${t.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</option>`
    )
    .join("") +
    `<option value="custom" ${prefs.theme === "custom" ? "selected" : ""}>Custom</option>`;

  return `
    <div class="prefs-header">
      <h3>Terminal Preferences</h3>
      <button class="prefs-close" aria-label="Close">&times;</button>
    </div>
    <div class="prefs-body">
      <div class="prefs-group">
        <label>Font Size</label>
        <div class="prefs-row">
          <input type="range" min="8" max="24" step="1" value="${prefs.fontSize}" id="pref-font-size" />
          <span id="pref-font-size-val" class="prefs-val">${prefs.fontSize}px</span>
        </div>
      </div>

      <div class="prefs-group">
        <label>Font Family</label>
        <select id="pref-font-family">${fontOptions}</select>
      </div>

      <div class="prefs-group">
        <label>Color Theme</label>
        <select id="pref-theme">${themeOptions}</select>
        <div id="pref-theme-preview" class="prefs-theme-preview"></div>
      </div>

      <div class="prefs-group prefs-custom-theme ${prefs.theme === "custom" ? "" : "vk-hidden"}" id="pref-custom-section">
        <label>Custom Colors</label>
        <div class="prefs-color-grid">
          <div class="prefs-color-item">
            <label>Foreground</label>
            <input type="color" id="pref-custom-fg" value="${prefs.customTheme?.foreground || "#c0c0c0"}" />
          </div>
          <div class="prefs-color-item">
            <label>Background</label>
            <input type="color" id="pref-custom-bg" value="${prefs.customTheme?.background || "#000000"}" />
          </div>
          <div class="prefs-color-item">
            <label>Cursor</label>
            <input type="color" id="pref-custom-cursor" value="${prefs.customTheme?.cursor || "#ffffff"}" />
          </div>
          <div class="prefs-color-item">
            <label>Selection</label>
            <input type="color" id="pref-custom-sel" value="${prefs.customTheme?.selectionBackground || "#444444"}" />
          </div>
        </div>
      </div>

      <div class="prefs-group">
        <label>Cursor Style</label>
        <div class="prefs-radio-group">
          <label class="prefs-radio"><input type="radio" name="cursorStyle" value="block" ${prefs.cursorStyle === "block" ? "checked" : ""} /> Block</label>
          <label class="prefs-radio"><input type="radio" name="cursorStyle" value="underline" ${prefs.cursorStyle === "underline" ? "checked" : ""} /> Underline</label>
          <label class="prefs-radio"><input type="radio" name="cursorStyle" value="bar" ${prefs.cursorStyle === "bar" ? "checked" : ""} /> Bar</label>
        </div>
      </div>

      <div class="prefs-group">
        <label>Cursor Blink</label>
        <label class="prefs-toggle">
          <input type="checkbox" id="pref-cursor-blink" ${prefs.cursorBlink ? "checked" : ""} />
          <span class="prefs-toggle-slider"></span>
        </label>
      </div>

      <div class="prefs-group">
        <label>Virtual Toolbar</label>
        <label class="prefs-toggle">
          <input type="checkbox" id="pref-show-toolbar" ${prefs.showToolbar !== false ? "checked" : ""} />
          <span class="prefs-toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function bindEvents(prefs) {
  const current = { ...prefs };

  // Close button
  panelEl.querySelector(".prefs-close").addEventListener("click", close);

  // Font size
  const fontSlider = panelEl.querySelector("#pref-font-size");
  const fontVal = panelEl.querySelector("#pref-font-size-val");
  fontSlider.addEventListener("input", () => {
    const size = parseInt(fontSlider.value, 10);
    fontVal.textContent = `${size}px`;
    current.fontSize = size;
    applyAndSave(current, "fontSize");
  });

  // Font family
  const fontFamily = panelEl.querySelector("#pref-font-family");
  fontFamily.addEventListener("change", () => {
    current.fontFamily = fontFamily.value;
    applyAndSave(current, "fontFamily");
  });

  // Theme
  const themeSelect = panelEl.querySelector("#pref-theme");
  const customSection = panelEl.querySelector("#pref-custom-section");
  themeSelect.addEventListener("change", () => {
    current.theme = themeSelect.value;
    customSection.classList.toggle("vk-hidden", current.theme !== "custom");
    applyAndSave(current, "theme");
    updateThemePreview(current);
  });
  updateThemePreview(current);

  // Custom theme colors
  ["fg", "bg", "cursor", "sel"].forEach((key) => {
    const input = panelEl.querySelector(`#pref-custom-${key}`);
    if (!input) return;
    input.addEventListener("input", () => {
      current.customTheme = current.customTheme || {};
      const map = { fg: "foreground", bg: "background", cursor: "cursor", sel: "selectionBackground" };
      current.customTheme[map[key]] = input.value;
      applyAndSave(current, "theme");
    });
  });

  // Cursor style
  panelEl.querySelectorAll('input[name="cursorStyle"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      current.cursorStyle = radio.value;
      applyAndSave(current, "cursorStyle");
    });
  });

  // Cursor blink
  const blinkCb = panelEl.querySelector("#pref-cursor-blink");
  blinkCb.addEventListener("change", () => {
    current.cursorBlink = blinkCb.checked;
    applyAndSave(current, "cursorBlink");
  });

  // Virtual toolbar toggle
  const toolbarCb = panelEl.querySelector("#pref-show-toolbar");
  toolbarCb.addEventListener("change", () => {
    current.showToolbar = toolbarCb.checked;
    savePrefs(current);
    if (onToolbarToggle) onToolbarToggle(current.showToolbar);
  });
}

function applyAndSave(prefs, changedKey) {
  if (!currentTerminal) return;
  savePrefs(prefs);

  if (changedKey === "fontSize") {
    currentTerminal.options.fontSize = prefs.fontSize;
    currentFitAddon?.fit();
  } else if (changedKey === "fontFamily") {
    currentTerminal.options.fontFamily = prefs.fontFamily;
    currentFitAddon?.fit();
  } else if (changedKey === "theme") {
    currentTerminal.options.theme = resolveTheme(prefs);
  } else if (changedKey === "cursorStyle") {
    currentTerminal.options.cursorStyle = prefs.cursorStyle;
  } else if (changedKey === "cursorBlink") {
    currentTerminal.options.cursorBlink = prefs.cursorBlink;
  }
}

function updateThemePreview(prefs) {
  const preview = panelEl?.querySelector("#pref-theme-preview");
  if (!preview) return;
  const theme = resolveTheme(prefs);
  const bg = theme.background || "#000000";
  const fg = theme.foreground || "#c0c0c0";
  preview.style.background = bg;
  preview.style.color = fg;
  preview.textContent = `$ echo "Hello, World!"`;
}

export { open, close };
