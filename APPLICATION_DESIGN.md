# Remote Code Agents - Application Design

## Overview

A web application built with Elixir, Phoenix, and LiveView that runs on a host computer and provides a browser-based interface to interact with tmux sessions. This enables remote access to terminal sessions — particularly useful for monitoring and interacting with long-running processes, code agents, or development environments.

The application must work well over high-latency and low-bandwidth connections, and be fully usable on mobile browsers. A native Android app is a future target, so the architecture should cleanly separate the transport/API layer from the web UI.

## Goals

- Attach to existing tmux sessions from a web browser
- Create new tmux sessions from the UI
- Stream terminal output in real-time via LiveView WebSocket
- Send keyboard input back to the tmux pane
- Support multiple simultaneous viewers on the same pane (shared stream)
- Capture scrollback history when attaching to a pane
- Clipboard integration (copy/paste)
- Mobile-friendly UI — usable on phone browsers
- Minimal setup — run alongside existing tmux workflows
- Optimized for high-latency / low-bandwidth connections

## Architecture

### High-Level Components

```
Browser / Android App
    |
    | WebSocket
    |
    |-- LiveView (web UI)
    |-- Phoenix Channel (raw terminal protocol — for native apps)
    |
Phoenix Application
    |
    |-- TmuxManager (GenServer)
    |       Discovers sessions, creates new sessions
    |
    |-- PaneStream (GenServer, one per pane — shared across viewers)
    |       Streams output via `tmux pipe-pane` + FIFO
    |       Sends keystrokes via `tmux send-keys`
    |       Manages viewer reference counting
    |
    |-- PaneStreamSupervisor (DynamicSupervisor)
    |       Lifecycle management for PaneStream processes
    |
tmux server (host)
    |
    |-- pipe-pane → FIFO/pipe per pane (output streaming)
    |-- capture-pane (initial scrollback snapshot)
    |-- send-keys (input)
```

### Dual Client Strategy

To support both the LiveView web app and a future native Android client:

1. **Phoenix Channel (`TerminalChannel`)**: A raw WebSocket channel that speaks a simple binary/JSON protocol for terminal I/O. This is the shared transport layer.
   - Events: `output` (server→client, binary), `input` (client→server), `resize`, `scrollback`
   - Both LiveView hooks and native Android connect to this same channel
2. **LiveView**: Uses the channel internally via the hook, adds HTML UI chrome (session list, controls, mobile layout)
3. **Android app**: Connects directly to the Phoenix Channel, renders with a terminal emulator library on-device

This avoids duplicating terminal logic in LiveView and keeps the protocol clean for any client.

### Key Modules

#### `RemoteCodeAgents.TmuxManager`
- **Responsibility**: Discover, list, and create tmux sessions
- **Interface**:
  - `list_sessions/0` — returns `[%Session{name, windows, created, attached?}]`
  - `list_panes/1` — returns panes for a given session/window
  - `create_session/1` — creates a new tmux session with given name, returns session info
  - `kill_session/1` — terminates a session
  - `session_exists?/1` — check if a session is still alive
- **Implementation**: Shells out to `tmux list-sessions`, `tmux list-windows`, `tmux list-panes`, `tmux new-session` with format strings; parses output

#### `RemoteCodeAgents.PaneStream`
- **Responsibility**: Bidirectional bridge between a tmux pane and one or more viewers
- **State**:
  - `target` — the `session:window.pane` identifier
  - `pipe_port` — Elixir Port reading from the FIFO
  - `viewer_count` — number of active subscribers (for lifecycle management)
  - `buffer` — recent output ring buffer for late-joining viewers
- **Interface**:
  - `start_link/1` — starts streaming for a target pane
  - `subscribe/1` — adds a viewer, increments ref count, returns scrollback snapshot
  - `unsubscribe/1` — decrements ref count, shuts down if zero
  - `send_keys/2` — sends input to the pane via `tmux send-keys`
- **Lifecycle**: Starts on first viewer subscribe, shuts down when last viewer unsubscribes (with a grace period to handle tab refreshes)

#### `RemoteCodeAgents.Terminal.Parser`
- **Decision**: Use xterm.js on the client (web) — send raw bytes, let the client handle rendering
- No server-side ANSI parsing needed for the web client
- For the Android app, a terminal emulator library (e.g., Termux's terminal-emulator) handles rendering

### tmux pipe-pane Strategy

**Why pipe-pane over capture-pane polling:**
- `capture-pane` polling at 100ms means up to 100ms latency per frame, wastes CPU diffing unchanged screens, and scales poorly with many panes
- `pipe-pane` gives true streaming — output arrives as soon as tmux processes it, with zero polling overhead
- Critical for high-latency connections: every millisecond of unnecessary server-side delay compounds with network latency

**Implementation:**

```
PaneStream startup:
  1. Create a named pipe: mkfifo /tmp/rca-pane-{target}.fifo
  2. Capture initial scrollback: tmux capture-pane -p -e -S - -t {target}
  3. Attach pipe: tmux pipe-pane -t {target} -o 'cat >> /tmp/rca-pane-{target}.fifo'
  4. Open FIFO as an Elixir Port for async reads

PaneStream shutdown:
  1. Detach pipe: tmux pipe-pane -t {target}   (no -o flag = detach)
  2. Close the Port
  3. Remove the FIFO: rm /tmp/rca-pane-{target}.fifo
```

**Complexity assessment**: Moderate. The main additions vs. polling are:
- FIFO lifecycle management (create on start, clean up on stop/crash)
- Elixir Port management for reading the FIFO (well-supported in OTP)
- Crash cleanup — if PaneStream crashes, the supervisor restart must clean up the stale FIFO and re-attach `pipe-pane`
- `pipe-pane` only captures *new* output, so initial scrollback still requires a one-time `capture-pane -p -e -S -` call

The complexity is manageable and the benefits (lower latency, lower CPU, better scalability) are significant — especially over slow connections.

**Alternative considered**: Using `pipe-pane` with a Unix socket instead of a FIFO. Marginally cleaner but FIFOs are simpler and sufficient for a one-reader scenario.

### LiveView Pages

#### `RemoteCodeAgentsWeb.SessionListLive`
- Route: `/`
- Lists all active tmux sessions with their windows and panes
- "New Session" button/form — creates a new tmux session (name input, optional command)
- Auto-refreshes session list via periodic `handle_info` (every 2-3 seconds)
- Click a pane to navigate to the terminal view
- Mobile layout: full-width card list, large touch targets

#### `RemoteCodeAgentsWeb.TerminalLive`
- Route: `/sessions/:session/:window/:pane`
- Full-viewport xterm.js terminal
- LiveView Hook (`TerminalHook`):
  - Initializes xterm.js `Terminal` instance on mount
  - Connects to `TerminalChannel` for binary I/O
  - Writes received output to xterm.js
  - Captures keyboard input and sends to channel
  - Handles resize events
  - Clipboard integration (see below)
- Server side:
  - Subscribes to PaneStream for the target pane
  - Receives scrollback snapshot on subscribe, pushes to client
  - Forwards streaming output to client
  - Forwards client input to `PaneStream.send_keys/2`
- Mobile: on-screen virtual keyboard with common keys (Ctrl, Alt, Tab, Esc, arrow keys, etc.)
- Back button / navigation header to return to session list

### Phoenix Channel: `TerminalChannel`

- Topic: `"terminal:{session}:{window}:{pane}"`
- **Client → Server events**:
  - `"input"` — `%{"data" => binary}` — keyboard input
  - `"resize"` — `%{"cols" => int, "rows" => int}`
- **Server → Client events**:
  - `"output"` — `%{"data" => binary}` — terminal output bytes
  - `"scrollback"` — `%{"data" => binary}` — initial scrollback history on join
  - `"disconnected"` — pane/session no longer exists
- Used by both the LiveView hook (web) and native Android app

## Data Flow

### Terminal Output (tmux → browser)

1. tmux writes output → `pipe-pane` sends to FIFO
2. `PaneStream` Port reads from FIFO, receives `{port, {:data, bytes}}`
3. Broadcasts bytes to PubSub topic `"pane:#{target}"`
4. `TerminalLive` / `TerminalChannel` receives, pushes `"output"` event to client
5. Client writes bytes to xterm.js / native terminal emulator

### Initial Attach (scrollback)

1. Viewer subscribes to `PaneStream`
2. `PaneStream` returns cached scrollback (captured at startup via `capture-pane -p -e -S -`)
3. Client receives `"scrollback"` event, writes to terminal before streaming output
4. Ring buffer of recent output also replayed to handle data that arrived between capture and pipe-pane attach

### Keyboard Input (browser → tmux)

1. xterm.js `onData` callback fires
2. Client sends `"input"` event via channel
3. Server calls `PaneStream.send_keys/2`
4. `PaneStream` executes `tmux send-keys -t {target} -l {data}` (literal mode)

### Pane Resize

1. xterm.js / mobile UI reports new dimensions
2. Client sends `"resize"` event via channel
3. Server calls `tmux resize-pane -t {target} -x {cols} -y {rows}`

## Bandwidth Optimization

For low-bandwidth / high-latency connections:

1. **Binary WebSocket frames**: Terminal data sent as raw binary, not base64 or JSON-encoded text
2. **No polling overhead**: pipe-pane streams only actual output — no wasted bandwidth on unchanged frames
3. **Compression**: Enable WebSocket per-message deflate compression in Phoenix endpoint config
4. **Debounced resize**: Client debounces resize events (300ms) to avoid flooding the server during orientation changes
5. **Input batching**: Buffer rapid keystrokes client-side and send in batches (configurable, e.g. every 16ms) to reduce round-trip overhead
6. **Scrollback cap**: Limit initial scrollback to a configurable max (e.g. 10,000 lines) to avoid a huge payload on attach

## Clipboard Integration

- **Copy**: xterm.js selection → `navigator.clipboard.writeText()` via the xterm.js `onSelectionChange` event. On mobile, long-press triggers selection mode (native browser behavior works with xterm.js).
- **Paste**: "Paste" button in mobile toolbar calls `navigator.clipboard.readText()` → sends as `"input"` event. On desktop, Ctrl+Shift+V is intercepted by the hook.
- **Permission**: Clipboard API requires HTTPS or localhost. Secure context is guaranteed by our security model.

## Mobile UI Considerations

### Layout
- Session list: single-column card layout, large touch targets (min 48px)
- Terminal view: full-viewport, no browser chrome wasted
- Collapsible header with session info and back button
- Bottom toolbar for special keys and actions

### Virtual Key Toolbar
A fixed bottom toolbar providing keys that don't exist on mobile keyboards:
```
[ Esc ] [ Tab ] [ Ctrl ] [ Alt ] [ ↑ ] [ ↓ ] [ ← ] [ → ] [ Paste ]
```
- `Ctrl` and `Alt` are sticky modifiers (tap to toggle, highlight when active)
- Swipe-up on toolbar reveals extended keys (F1-F12, PgUp/PgDn, Home/End)
- Toolbar auto-hides when the soft keyboard is open (to maximize terminal space), reappears on dismiss

### Touch Gestures
- Tap: focus terminal / place cursor
- Long press: text selection (native xterm.js behavior)
- Two-finger pinch: zoom/font size adjustment
- Swipe from left edge: back to session list

### Responsive Breakpoints
- `< 640px`: Mobile layout (single column, bottom toolbar, full-viewport terminal)
- `640px - 1024px`: Tablet (sidebar session list + terminal)
- `> 1024px`: Desktop (sidebar + terminal + status panel)

## Technology Choices

| Component          | Choice              | Rationale                                              |
|--------------------|---------------------|--------------------------------------------------------|
| Language           | Elixir              | User preference; excellent for concurrent I/O          |
| Web framework      | Phoenix 1.7+        | Standard Elixir web framework                          |
| Real-time UI       | Phoenix LiveView    | WebSocket-based, no separate API needed                |
| Terminal rendering | xterm.js            | Battle-tested terminal emulator; handles ANSI, cursor  |
| Terminal backend   | tmux pipe-pane      | True streaming, lower latency than polling              |
| Process management | DynamicSupervisor   | One child per active pane stream                       |
| Pub/Sub            | Phoenix.PubSub      | Built-in; connects PaneStreams to viewers               |
| Mobile terminal    | xterm.js + toolbar  | Works in mobile browsers; virtual key toolbar for special keys |
| Android (future)   | Phoenix Channel     | Direct WebSocket connection; native terminal renderer   |

## Project Structure

```
remote_code_agents/
  lib/
    remote_code_agents/
      application.ex               # Supervision tree
      tmux_manager.ex               # Session discovery + creation
      pane_stream.ex                # Per-pane streaming GenServer (pipe-pane + FIFO)
      pane_stream_supervisor.ex     # DynamicSupervisor for PaneStreams
    remote_code_agents_web/
      channels/
        terminal_channel.ex         # Raw terminal I/O channel (for web + native clients)
        user_socket.ex              # Socket configuration
      live/
        session_list_live.ex        # Session listing + creation page
        session_list_live.html.heex # Template
        terminal_live.ex            # Terminal view page
        terminal_live.html.heex     # Template
      components/
        layouts.ex                  # App shell layout
        mobile_toolbar.ex           # Virtual key toolbar component
  assets/
    js/
      hooks/
        terminal_hook.js            # xterm.js + channel integration
      app.js
    css/
      app.css                       # Responsive styles, mobile layout
    package.json                    # xterm.js dependency
  config/
    config.exs
    dev.exs
    runtime.exs
  mix.exs
```

## Configuration

```elixir
# config/config.exs
config :remote_code_agents,
  # Max scrollback lines to capture on initial attach
  max_scrollback_lines: 10_000,
  # Grace period (ms) before shutting down a PaneStream with zero viewers
  pane_stream_grace_period: 5_000,
  # Default terminal dimensions
  default_cols: 120,
  default_rows: 40,
  # FIFO directory for pipe-pane output
  fifo_dir: "/tmp/remote-code-agents"
```

## Security Considerations

- **Authentication**: This application gives full terminal access. Must be protected:
  - Phase 1: Bind to `127.0.0.1` only (local access)
  - Phase 2: Add token-based auth for remote access (required for mobile use)
- **Input sanitization**: `send-keys` with `-l` (literal) flag prevents tmux command injection, but the user is intentionally sending arbitrary commands to a shell — access control is the real boundary
- **HTTPS**: Required if exposed beyond localhost; configure via Phoenix endpoint or reverse proxy. Also required for Clipboard API access.
- **Channel auth**: `TerminalChannel` must verify auth token on join (Phase 2) to prevent unauthorized WebSocket connections from native apps

## Resolved Design Decisions

1. **Capture strategy → pipe-pane**: True streaming via `tmux pipe-pane` to a FIFO, read by an Elixir Port. Initial scrollback captured separately via `capture-pane -p -e -S -`. Moderate added complexity (FIFO lifecycle, crash cleanup) but significantly better latency and efficiency.

2. **Scrollback → Yes**: Capture full scrollback (up to configurable max) on initial attach. Sent to client as a `"scrollback"` event before streaming begins.

3. **Multiple viewers → Shared PaneStream**: One PaneStream per pane, shared across all viewers via PubSub. Reference-counted with a grace period on last-viewer-disconnect to handle tab refreshes.

4. **Session creation → Yes**: The session list page always shows a "New Session" option alongside existing sessions. User provides a session name; optionally a starting command.

5. **Clipboard → Yes**: Copy via xterm.js selection + Clipboard API. Paste via toolbar button (mobile) or Ctrl+Shift+V interception (desktop). Requires secure context (localhost or HTTPS).

## MVP Scope

For the first working version:

1. List tmux sessions and panes on the index page
2. Create new tmux sessions from the UI
3. Click a pane to open a full-viewport terminal view with xterm.js
4. Stream output from the pane using pipe-pane (with scrollback on attach)
5. Send keyboard input from the browser to the pane
6. Shared PaneStream with viewer ref counting
7. Clipboard copy/paste
8. Mobile-responsive layout with virtual key toolbar
9. Bind to localhost only (no auth needed)

Post-MVP:
- Token-based authentication for remote access
- Phoenix Channel for native Android client
- Pane resize sync
- Session management (rename, kill)
- Multi-pane split view
