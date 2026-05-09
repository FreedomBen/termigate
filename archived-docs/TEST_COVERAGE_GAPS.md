# Test Coverage Gap Analysis

**Date:** 2026-05-09
**Scope:** `server/` Elixir suite + `server/assets/` JS suite
**Run baseline:** `mix test` → 378 tests, 0 failures, 50 excluded (`:tmux` integration set)

## Summary

The suite is broadly healthy (~one test module per source module, 0 failures). Real gaps cluster in three areas: (1) modules with **no test file at all**, (2) **complex modules with thin coverage**, and (3) **CI-time blind spots** where tests are gated behind `@tag :tmux` and skipped by default.

## 1. Modules with no test file

| Module | LOC | Risk | Notes |
| --- | --- | --- | --- |
| `Mix.Tasks.Termigate.ChangePassword` | 47 | Medium | Operator-facing CLI; touches credentials. Mistakes corrupt the auth file. |
| `Mix.Tasks.Termigate.Reset` | 40 | Medium | Destructive — wipes config/state. No regression guard. |
| `Mix.Tasks.Termigate.Setup` | 42 | Medium | First-run onboarding. Failure modes are silent. |
| `TermigateWeb.Plugs.Cors` | 28 | Low | Conditional Corsica wrapper — at minimum, "no-op when env unset / applies origins when set". |
| `TermigateWeb.CoreComponents` | (large) | Low | Phoenix-default components; consider snapshot/render tests for `flash`, `input`, `button`, `header`, `table`. |
| `Termigate.Application` | 87 | Low | Boot logic (`check_auth_warning`, `check_tmux_availability`) — branchy log paths are uncovered. |
| `Termigate.PaneStreamSupervisor` | 18 | Low | Thin wrapper; covered transitively via `PaneStreamTest`. Not a priority. |
| `TermigateWeb.RateLimitStore` | 88 | Medium | Has telemetry + cleanup logic. Currently only tested *through* the plug — direct unit tests for `check/3`, expiry, and `@max_entries` cap would be valuable. |

## 2. Thin coverage in complex modules

| Module | Source size | Tests | Gap |
| --- | --- | --- | --- |
| `TermigateWeb.TerminalChannel` | 275 lines, 11 handlers | 16 tests | `handle_info` for `:pane_dead`, `:pane_reconnected`, `:pane_resized`, `:pane_superseded` are not asserted; `:DOWN` matching-ref path also untested. |
| `Termigate.MCP.Server` | 94 lines | indirect via endpoint test | No unit test for `parse_template_uri/1` (regex parsing is a security-relevant boundary — bad URIs should not match). |
| `TermigateWeb.MCPEndpointTest` | — | 12 tests | Covers POST initialize/list. No coverage of GET/SSE streaming behavior of `Hermes.Server.Transport.StreamableHTTP.Plug`, no malformed-JSON path, no oversized body. |
| `TermigateWeb.Telemetry` | — | 3 tests | Telemetry handler list is small but every metric should have an emit/observe test to catch silent metric drops. |

## 3. CI blind spots — `:tmux`-gated tests

`@tag :tmux` is excluded by default. Means the following controllers have **near-zero coverage on a default `mix test` run**:

- `test/termigate_web/controllers/pane_controller_test.exs` — 3 of 6 tests gated.
- `test/termigate_web/controllers/session_controller_test.exs` — 6 of 14 tests gated.

Either (a) run `:tmux` tests in CI (preferred, since tmux is the source of truth), or (b) backfill Mox-based unit tests against `MockCommandRunner` so the non-tmux happy paths are exercised by default.

## 4. JS suite — solid

`server/assets/js/hooks/*.test.js` covers all hooks (notification, restore-or-fit, quick-action-bar, password-toggle, edge-swipe-back, pane-resize, terminal-hook fit gates + tap focus, mobile control bar, mobile tap targets, preferences, should-auto-fit). No structural gap noted.

## Recommended priority

1. **Add unit tests for `RateLimitStore.check/3`** — directly testable, security-relevant, easy.
2. **Backfill `TerminalChannel` `handle_info` cases** — straightforward, prevents regressions in core streaming.
3. **Add tests for the three `mix termigate.*` tasks** — destructive ops without a regression guard is a footgun.
4. **Decide CI policy on `:tmux` tag** — current default-off means controller routes are effectively untested in CI.
5. **Cover `Plugs.Cors` and `MCP.Server.parse_template_uri/1`** — small, security-adjacent.

## Lower-priority / optional

- `Application` boot warnings, `PaneStreamSupervisor` wrapper, `CoreComponents` rendering — useful but lower marginal value given current pass rate.
