# APPLICATION_DESIGN.md Review — Open Questions

## ~~#5/#6 — SessionChannel Design~~ RESOLVED

Resolved: Option (c) — each `SessionChannel` subscribes to PubSub `"sessions"` for instant updates + runs its own poll timer for external changes. Dedicated `SessionChannel` design section added to APPLICATION_DESIGN.md (after TerminalChannel), plus SessionChannel events added to the Event Reference table.

## ~~#11 — Rate Limiting~~ RESOLVED

Resolved: Per-IP rate limiting added to Security Considerations section. Three endpoints rate limited: `POST /api/login` (5/min), WebSocket upgrade (10/min), `POST /api/sessions` (10/min). Implementation via `RateLimit` Plug using ETS. Configurable limits, lazy cleanup, only active in remote mode. Added `rate_limit.ex` to project structure, rate limit pipeline to routes.

## ~~#12 — Certificate Pinning for Android~~ RESOLVED

Resolved: Option (b) — standard TLS only, no pinning or TOFU. TOFU is complex (cert rotation false alarms), pinning is brittle, and the recommended deployment is Tailscale/VPN anyway. Added TLS rationale section under Android Token Management.

## ~~#17 — Retrofit vs Ktor~~ RESOLVED

Resolved: Switched to Ktor Client + kotlinx.serialization. Pure Kotlin, first-class serialization support, coroutine-native. Uses `ktor-client-okhttp` engine to share the OkHttp instance with the WebSocket layer. Updated tech stack table, architecture diagram, project structure (`ApiService.kt` → `ApiClient.kt`, `AuthInterceptor.kt` → `AuthPlugin.kt`), and DI module description.

## #7/#8 — Android Quick Action Validation & Termux Dependency

Two implementation details that could be fleshed out now or deferred:

1. **Quick action execution path on Android**: The web path validates input size (128KB) in `handle_event`. The Android path sends commands via Channel `"input"` which has the same server-side limit, but there's no mention of client-side validation in the Android app. Should the Android `TerminalRepository` or `TerminalViewModel` validate before sending?

2. **Termux library dependency coordinates**: The doc says to fork `terminal-emulator` and `terminal-view` into a standalone library repo and publish to GitHub Packages, but doesn't show the Maven dependency declaration in `build.gradle.kts` or `libs.versions.toml`. Worth specifying now, or leave for implementation time?
