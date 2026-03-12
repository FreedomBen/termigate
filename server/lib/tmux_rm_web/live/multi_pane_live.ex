defmodule TmuxRmWeb.MultiPaneLive do
  @moduledoc """
  LiveView showing all panes in a tmux window in a CSS Grid layout.
  Mirrors tmux's split-pane layout with window tabs for navigation.
  """
  use TmuxRmWeb, :live_view

  alias TmuxRm.{LayoutPoller, TmuxManager}

  require Logger

  @impl true
  def mount(%{"session" => session, "window" => window}, _session, socket) do
    window = to_string(window)

    if connected?(socket) do
      LayoutPoller.subscribe(session, window)
      Phoenix.PubSub.subscribe(TmuxRm.PubSub, "sessions:state")
    end

    # Fetch layout and window list
    layout =
      case LayoutPoller.get(session, window) do
        {:ok, panes} -> panes
        {:error, _} -> []
      end

    windows = fetch_windows(session)

    socket =
      socket
      |> assign(:session, session)
      |> assign(:window, window)
      |> assign(:panes, layout)
      |> assign(:grid, compute_grid(layout))
      |> assign(:windows, windows)
      |> assign(:page_title, "#{session}:#{window}")

    {:ok, socket, layout: false}
  end

  def mount(%{"session" => session}, _session, socket) do
    # Redirect to active window
    active_window = get_active_window(session)

    {:ok,
     push_navigate(socket, to: "/sessions/#{session}/windows/#{active_window}", replace: true)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex flex-col h-dvh bg-black">
      <%!-- Window tabs --%>
      <div class="window-tabs">
        <.link navigate={~p"/"} class="window-tab text-base-content/40 hover:text-base-content shrink-0 px-3">
          <.icon name="hero-arrow-left-micro" class="size-4" />
        </.link>
        <span class="text-base-content/30 text-xs px-2 shrink-0 font-mono">{@session}</span>
        <div class="flex items-center gap-0.5 px-1">
          <.link
            :for={win <- @windows}
            navigate={"/sessions/#{@session}/windows/#{win.index}"}
            class={[
              "window-tab",
              if(to_string(win.index) == @window,
                do: "window-tab-active",
                else: "window-tab-inactive"
              )
            ]}
          >
            {win.index}{if win.name, do: ": #{win.name}", else: ""}
          </.link>
        </div>
      </div>

      <%!-- Multi-pane grid (desktop/tablet) --%>
      <div
        :if={@panes != []}
        id="multi-pane-grid"
        class="flex-1 min-h-0 hidden sm:grid"
        style={"grid-template-columns: #{@grid.cols}; grid-template-rows: #{@grid.rows}; gap: 2px;"}
      >
        <div
          :for={pane <- @panes}
          id={"pane-#{pane.target}"}
          phx-hook="TerminalHook"
          phx-update="ignore"
          data-target={pane.target}
          data-mode="multi"
          style={"grid-column: #{pane_grid_col(pane, @grid)}; grid-row: #{pane_grid_row(pane, @grid)};"}
          class="border border-base-content/5 min-h-0 overflow-hidden"
        >
        </div>
      </div>

      <%!-- Mobile pane list (instead of grid) --%>
      <div :if={@panes != []} class="flex-1 overflow-y-auto sm:hidden p-3 space-y-2">
        <.link
          :for={pane <- @panes}
          navigate={"/terminal/#{pane.target}"}
          class="pane-row rounded-xl"
          style="border-bottom: none; background: oklch(18% 0.008 260); border: 1px solid oklch(25% 0.01 260);"
        >
          <.icon name="hero-command-line-micro" class="size-4 text-base-content/25 shrink-0" />
          <div class="flex-1 min-w-0">
            <span class="font-mono text-sm text-base-content/70">{pane.target}</span>
            <span class="ml-2 text-xs text-base-content/40">{pane.command}</span>
          </div>
          <div class="text-xs text-base-content/25">{pane.width}&times;{pane.height}</div>
          <.icon name="hero-chevron-right-micro" class="size-4 text-base-content/20 shrink-0" />
        </.link>
      </div>

      <%!-- Empty state --%>
      <div :if={@panes == []} class="flex-1 flex items-center justify-center">
        <div class="empty-state">
          <.icon name="hero-rectangle-group" class="empty-state-icon" />
          <p class="text-lg font-semibold mb-2">No panes in this window</p>
          <.link navigate={~p"/"} class="btn btn-primary btn-sm">Back to Sessions</.link>
        </div>
      </div>

      <%!-- Focus buttons overlay (per pane, desktop only) --%>
      <div id="pane-focus-buttons" class="hidden sm:block pointer-events-none fixed inset-0 z-10">
        <div
          :for={pane <- @panes}
          class="pointer-events-auto"
          style="position: absolute; display: none;"
          id={"focus-btn-#{pane.target}"}
        >
          <.link
            navigate={"/terminal/#{pane.target}"}
            class="btn btn-xs btn-ghost text-base-content/40 hover:text-base-content opacity-0 group-hover:opacity-100"
          >
            <.icon name="hero-arrows-pointing-out-micro" class="size-3" /> Focus
          </.link>
        </div>
      </div>
    </div>
    """
  end

  # --- PubSub handlers ---

  @impl true
  def handle_info({:layout_updated, panes}, socket) do
    grid = compute_grid(panes)
    {:noreply, assign(socket, panes: panes, grid: grid)}
  end

  def handle_info({:sessions_updated, _sessions}, socket) do
    windows = fetch_windows(socket.assigns.session)
    {:noreply, assign(socket, :windows, windows)}
  end

  # Ignore pane output/control events — each TerminalHook handles its own via Channel
  def handle_info({:pane_output, _, _}, socket), do: {:noreply, socket}
  def handle_info({:pane_dead, _, _}, socket), do: {:noreply, socket}
  def handle_info({:pane_reconnected, _, _}, socket), do: {:noreply, socket}
  def handle_info({:pane_resized, _, _}, socket), do: {:noreply, socket}
  def handle_info({:tmux_status_changed, _}, socket), do: {:noreply, socket}
  def handle_info(_msg, socket), do: {:noreply, socket}

  @impl true
  def handle_event("resize", _params, socket) do
    # Multi-pane view is passive — ignore resize events
    {:noreply, socket}
  end

  @impl true
  def terminate(_reason, socket) do
    if socket.assigns[:session] && socket.assigns[:window] do
      LayoutPoller.unsubscribe(socket.assigns.session, socket.assigns.window)
    end
  end

  # --- Grid computation ---

  defp compute_grid([]), do: %{cols: "1fr", rows: "1fr", col_bounds: [0], row_bounds: [0]}

  defp compute_grid(panes) do
    # Collect unique column and row boundaries
    col_bounds =
      panes
      |> Enum.flat_map(fn p -> [p.left, p.left + p.width] end)
      |> Enum.uniq()
      |> Enum.sort()

    row_bounds =
      panes
      |> Enum.flat_map(fn p -> [p.top, p.top + p.height] end)
      |> Enum.uniq()
      |> Enum.sort()

    # Compute track sizes as fr values
    col_tracks =
      col_bounds
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.map(fn [a, b] -> "#{b - a}fr" end)
      |> Enum.join(" ")

    row_tracks =
      row_bounds
      |> Enum.chunk_every(2, 1, :discard)
      |> Enum.map(fn [a, b] -> "#{b - a}fr" end)
      |> Enum.join(" ")

    %{
      cols: col_tracks || "1fr",
      rows: row_tracks || "1fr",
      col_bounds: col_bounds,
      row_bounds: row_bounds
    }
  end

  defp pane_grid_col(pane, grid) do
    start = Enum.find_index(grid.col_bounds, &(&1 == pane.left)) + 1
    finish = Enum.find_index(grid.col_bounds, &(&1 == pane.left + pane.width)) + 1
    "#{start} / #{finish}"
  end

  defp pane_grid_row(pane, grid) do
    start = Enum.find_index(grid.row_bounds, &(&1 == pane.top)) + 1
    finish = Enum.find_index(grid.row_bounds, &(&1 == pane.top + pane.height)) + 1
    "#{start} / #{finish}"
  end

  defp fetch_windows(session) do
    case TmuxManager.list_panes(session) do
      {:ok, panes_by_window} ->
        panes_by_window
        |> Map.keys()
        |> Enum.sort()
        |> Enum.map(fn idx -> %{index: idx, name: nil} end)

      {:error, _} ->
        []
    end
  end

  defp get_active_window(session) do
    case command_runner().run([
           "display-message",
           "-p",
           "-t",
           session,
           "\#{window_index}"
         ]) do
      {:ok, output} -> String.trim(output)
      {:error, _} -> "0"
    end
  end

  defp command_runner, do: Application.get_env(:tmux_rm, :command_runner)
end
