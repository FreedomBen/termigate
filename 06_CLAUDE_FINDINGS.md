# APPLICATION_DESIGN.md — Review Findings

## Fixed

1. **TmuxManager diagram label**: The High-Level Components diagram labeled TmuxManager as "(GenServer)" but the module description (line 89) and supervision tree (line 556) both confirm it's a stateless module. Fixed the diagram to say "(stateless module)".

2. **Config GenServer missing from diagram**: The `Config` GenServer appeared in the Supervision Tree section but was absent from the High-Level Components ASCII diagram. Added it.

## Open Questions

### ~~1. PubSub Topic Naming Inconsistency~~ — Resolved

Clarified in the Channel section that the Channel join topic (`"terminal:..."`) is a client-facing concern, not a PubSub topic. The join handler converts it to the canonical target and subscribes to the same `"pane:#{target}"` PubSub topic that LiveView uses. No format unification needed.

### ~~2. Session/Window Rename Fragility~~ — Resolved

Added dual Registry key (`{:pane_id, pane_id}`) and a supersede mechanism. During startup, the new PaneStream detects collisions with stale PaneStreams via the secondary key, sends `:superseded`, and takes over. The old PaneStream cleans up and notifies its viewers. Updated in: Registration, startup sequence step 0b, Lifecycle, Session/Window Renamed Externally section, and Resolved Design Decisions #12.

### 3. No Consolidated Event Table

Events are defined across scattered sections (`"output"`, `"pane_dead"`, `"key_input"`, `"resize"`, `"quick_action"`, etc.) but there is no single reference table listing all LiveView push_event/handle_event names with their payloads and directions.

- Should a consolidated event contract table be added?

### 4. Channel Protocol Underspecified

The Channel section defines join topics but doesn't list actual message formats (client→server and server→client payloads). It's marked "Future — Do Not Implement in Phase 1."

- Is the current level of detail sufficient for Phase 1, or should the message contract be specified now?

### 5. Bandwidth Optimization Gap

The Overview and Goals list "optimized for high-latency / low-bandwidth connections" as a core goal, but the only concrete mechanism described is "pipe-pane avoids polling overhead." There is no compression, delta encoding, batching, or throttling strategy.

- Should specific strategies be added (e.g., gzip on WebSocket, batching small writes, throttling push_event frequency)?
- Or is this intentionally deferred beyond the current scope?

### 6. Mixed Requirement Language

The doc uses "should" (3×), "must" (9×), and "will" (11×) without a defined convention, creating ambiguity about what is mandatory vs. aspirational.

- Normalize to a single convention, or leave as-is?
