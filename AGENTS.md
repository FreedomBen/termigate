# Repository Guidelines

## Project Structure & Module Organization

Termigate is a Phoenix LiveView server with an Android client. Server code lives in `server/lib`: web modules are under `termigate_web`, and tmux/config/MCP logic is under `termigate`. Server tests mirror this in `server/test`. Browser assets and Vitest tests live in `server/assets/js`. Android modules are `android/app` and `android/terminal-lib`, with JVM tests in each module's `src/test`. Packaging and deployment helpers are in `packaging`, `deploy`, `Containerfile`, `compose.yaml`, and `bin`.

## Build, Test, and Development Commands

- `cd server && mix setup`: install Elixir deps and build assets.
- `cd server && mix phx.server`: run the local web app on port `8888`.
- `make test`: run the server ExUnit suite.
- `cd server && mix precommit`: compile, check deps, format, run ExUnit, and run asset tests.
- `cd server/assets && npm test`: run Vitest tests for JavaScript hooks.
- `make android`: build the Android debug APK.
- `make android-test`: run Android JVM unit tests.
- `cd android && ./gradlew lintDebug`: run Android lint, matching CI.
- `make build` or `make build-container`: build the release or container image.

## Coding Style & Naming Conventions

Use `mix format` for Elixir, HEEx, and config files covered by `server/.formatter.exs`. Keep ExUnit files named `*_test.exs`, JavaScript tests as `*.test.js`, and Android tests as `*Test.kt` or `*Test.java`. Prefer existing Phoenix LiveView, OTP, Compose, and Termux terminal-library patterns. In shell scripts and Makefiles, use `"${VAR}"`; if editing Makefiles, keep `make help` accurate and default any `PREFIX` to `/usr/local`.

## Testing Guidelines

Add focused tests for code changes when an existing test layer covers the behavior. Use ExUnit for server logic and LiveView/controllers, Vitest with jsdom for asset hooks, and Robolectric/JUnit for Android UI and terminal behavior. Run the narrowest relevant test first, then `mix precommit` or the matching CI command.

## Commit & Pull Request Guidelines

Recent history uses concise imperative subjects without Conventional Commit prefixes, for example `Rename MultiPaneLive to WindowLive`. Do not use `feat:` or `bug:` prefixes. Commit bodies should explain what changed and why. PRs should include a description, linked issue when applicable, UI/mobile screenshots, configuration notes, and test commands run.

## Agent-Specific Instructions

Do not read `TODO.md` or other TODO files. Update documentation when code changes affect documented behavior. Do not create branches, commit, or run git operations unless explicitly asked; never push. Do not include Claude as a co-author in commits.
