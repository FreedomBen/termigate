# APPLICATION_DESIGN.md Review Findings

## Inconsistencies

### ~~1. Duplicated MVP Scope~~ RESOLVED
Removed duplicate section, renamed "MVP Scope" → "Scope", replaced all "MVP"/"Post-MVP" language with "Future".

### ~~2. TmuxManager "Not a GenServer for MVP"~~ RESOLVED
Removed "for MVP" qualifier — now just "Not a GenServer".

### ~~3. PaneStream subscribe/unsubscribe arity unclear~~ RESOLVED
Clarified that both `subscribe/1` and `unsubscribe/1` use `self()` to identify the caller.

### ~~4. `get_or_start/1` ownership unspecified~~ RESOLVED
Moved the get-or-start logic into the `subscribe/1` description directly — it now explicitly states it checks Registry and starts under DynamicSupervisor if needed.

## Ambiguities

### ~~5. Scrollback vs ring buffer overlap for late joiners~~ RESOLVED
Unified into a single ring buffer. Scrollback is written into the ring buffer at startup; all viewers receive `{:ok, history}` from the same buffer. Buffer sized dynamically from tmux `history-limit` × pane width (clamped 256KB–4MB, default 1MB fallback). Renamed all events from `"scrollback"` to `"history"`.

### 6. Input encoding path underspecified
Line 241 says output is base64-encoded for push_event, but line 264 shows `pushEvent("key_input", {data: rawBytes})` without mentioning base64. xterm.js `onData` emits a JavaScript string (UTF-16), not raw bytes. The doc should clarify:
- Is input also base64-encoded?
- Where does the JS string → UTF-8 bytes → hex conversion happen (client-side or server-side)?

### 7. `send-keys -H` and multi-byte characters
Line 178 says "send UTF-8 bytes as hex" but doesn't address how the JavaScript string from `onData` gets converted to UTF-8 byte representation. Specify whether this conversion happens client-side (send hex directly) or server-side (receive string, encode to UTF-8, then hex).

### 8. PubSub topic contains multiple colons
Line 209 uses `"pane:#{target}"` where target is `"session:window.pane"`, producing topics like `"pane:mysession:0.1"`. This works but is worth an explicit note that the format is intentionally `pane:<session>:<window>.<pane>`.

## Insufficiencies

### 9. No error handling for `tmux send-keys` failures
The input path (lines 265-266) doesn't cover what happens if `send-keys` fails (e.g., pane died between last output and next input). Does PaneStream silently drop it? Return an error? Log?

### 10. No FIFO cleanup on application crash
Line 158 covers PaneStream crash recovery, but not full application crash/kill. Stale FIFOs accumulate in `/tmp/remote-code-agents/`. Application startup should clean the FIFO directory.

### 11. Port `cat` non-zero exit unhandled
Line 279 only covers `cat` exiting with status 0 (normal EOF / pane death). What happens on non-zero exit (permission error, missing binary, etc.)? PaneStream should handle both cases.

### 12. Grace period race condition
Lines 106-109: If the last viewer disconnects and the grace period timer fires, but a new viewer subscribes concurrently — is there a race between shutdown and the new subscription? The doc should note that shutdown must check viewer count atomically within the GenServer `handle_info` before proceeding.

### 13. No minimum tmux version stated
`send-keys -H` was added in tmux 2.6. `pipe-pane -o` has been around since 1.8. The doc should state a minimum tmux version requirement (>= 2.6).

### 14. CommandRunner `run/1` argument format unspecified
Line 115 says `run/1` "executes a tmux command" but doesn't specify the argument type — a string like `"list-sessions -F ..."`, a list of args like `["list-sessions", "-F", "..."]`, or a structured type?

### 15. `capture-pane -S` flag inconsistency
Line 138 uses `-S -{max_lines}` (e.g., `-S -10000`) but line 529 says `-S -` (all history). These are different behaviors. Pick one and be consistent — `-S -{max_lines}` is correct per the configuration section.

## Minor Issues

### 16. xterm.js core package name
Line 363 says "xterm.js 5.x" but since v5 the npm package is `@xterm/xterm` (scoped). The addon references already use `@xterm/addon-fit` — the core package name should match.

### 17. `pipe-pane -o` rationale missing
Line 136 uses `-o` (output only) without explaining why. Worth a brief note: without `-o`, input echo would also be captured, causing doubled input for viewers when the pane has echo enabled.
