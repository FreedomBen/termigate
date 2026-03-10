# Tech Stack

All decisions finalized.

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | Elixir 1.17+ | Concurrency model ideal for streaming terminal I/O |
| Framework | Phoenix 1.8 | Latest stable. LiveView ~1.0 for real-time web UI, Channels for native app |
| Real-time UI | Phoenix LiveView (latest) | Terminal rendering, session management, settings |
| Native app protocol | Phoenix Channels | Raw WebSocket for Android app |
| Terminal backend | tmux `pipe-pane` + FIFO | Streaming output, send-keys for input |
| Terminal emulator (browser) | xterm.js 5.x | Addons: `@xterm/addon-fit`, `@xterm/addon-web-links` |
| CSS framework | Tailwind CSS 4 | CSS-first config, `@theme` directive. Tailwind Plus license at `~/gitclone/tailwind-ui-tailwind-plus/tailwindplus/` |
| UI components | Tailwind Plus (application-ui) | Shells, navigation, forms, overlays, feedback, data-display, lists, headings, layout, page-examples |
| JS bundler | esbuild | Phoenix default, fast, zero-config. Sufficient for xterm.js |
| JS package manager | npm | Standard `assets/package.json` for xterm.js and addons |
| Auth | bcrypt_elixir 3.x | Password hashing (+ optional `RCA_AUTH_TOKEN` env var) |
| Config format | YAML | Human-editable. `yaml_elixir` (read) + `ymlr` (write) |
| Process management | DynamicSupervisor + Registry | Built-in Elixir — one PaneStream per active pane |
| Pub/Sub | Phoenix.PubSub | Connects PaneStreams to viewers, config change broadcast |
| Database | None | tmux is source of truth; config in YAML; prefs in localStorage |
| Deployment | Mix release | Single binary, zero infra dependencies beyond tmux |
| Testing | ExUnit + Floki + Mox + Wallaby | Unit, LiveView, mocks, and browser E2E (Chromedriver) |
| CI/CD | GitHub Actions | Automated test runs, linting, release builds |
