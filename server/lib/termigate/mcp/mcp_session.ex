defmodule Termigate.MCP.McpSession do
  @moduledoc """
  Per-MCP-connection state tracker.

  Tracks tmux sessions created by MCP tools so they can be cleaned up
  when the MCP connection drops. One McpSession per Mcp-Session-Id.
  """

  use GenServer

  require Logger

  alias Termigate.TmuxManager

  @inactivity_timeout :timer.minutes(30)

  # --- Public API ---

  @doc "Start or get the McpSession for the given MCP session ID."
  def ensure_started(mcp_session_id) do
    case DynamicSupervisor.start_child(
           Termigate.McpSessionSupervisor,
           {__MODULE__, mcp_session_id}
         ) do
      {:ok, pid} -> {:ok, pid}
      {:error, {:already_started, pid}} -> {:ok, pid}
    end
  end

  @doc "Register a tmux session name for cleanup when the MCP connection ends."
  def track_session(mcp_session_id, tmux_session_name) do
    case ensure_started(mcp_session_id) do
      {:ok, pid} -> GenServer.cast(pid, {:track, tmux_session_name})
    end
  end

  @doc "Remove a tmux session from the cleanup list (e.g., after successful cleanup)."
  def untrack_session(mcp_session_id, tmux_session_name) do
    case whereis(mcp_session_id) do
      nil -> :ok
      pid -> GenServer.cast(pid, {:untrack, tmux_session_name})
    end
  end

  @doc "Force cleanup of all tracked sessions and stop the McpSession."
  def cleanup(mcp_session_id) do
    case whereis(mcp_session_id) do
      nil -> :ok
      pid -> GenServer.call(pid, :cleanup)
    end
  end

  @doc "List tracked tmux session names for the given MCP session."
  def tracked_sessions(mcp_session_id) do
    case whereis(mcp_session_id) do
      nil -> []
      pid -> GenServer.call(pid, :list)
    end
  end

  defp whereis(mcp_session_id) do
    case Registry.lookup(Termigate.McpSessionRegistry, mcp_session_id) do
      [{pid, _}] -> pid
      [] -> nil
    end
  end

  # --- GenServer ---

  def start_link(mcp_session_id) do
    GenServer.start_link(__MODULE__, mcp_session_id,
      name: {:via, Registry, {Termigate.McpSessionRegistry, mcp_session_id}}
    )
  end

  def child_spec(mcp_session_id) do
    %{
      id: {__MODULE__, mcp_session_id},
      start: {__MODULE__, :start_link, [mcp_session_id]},
      restart: :temporary
    }
  end

  @impl true
  def init(mcp_session_id) do
    state = %{
      mcp_session_id: mcp_session_id,
      pending_cleanup: MapSet.new()
    }

    {:ok, state, @inactivity_timeout}
  end

  @impl true
  def handle_cast({:track, tmux_session_name}, state) do
    state = %{state | pending_cleanup: MapSet.put(state.pending_cleanup, tmux_session_name)}
    {:noreply, state, @inactivity_timeout}
  end

  def handle_cast({:untrack, tmux_session_name}, state) do
    state = %{state | pending_cleanup: MapSet.delete(state.pending_cleanup, tmux_session_name)}
    {:noreply, state, @inactivity_timeout}
  end

  @impl true
  def handle_call(:cleanup, _from, state) do
    do_cleanup(state)
    {:stop, :normal, :ok, %{state | pending_cleanup: MapSet.new()}}
  end

  def handle_call(:list, _from, state) do
    {:reply, MapSet.to_list(state.pending_cleanup), state, @inactivity_timeout}
  end

  @impl true
  def handle_info(:timeout, state) do
    Logger.info("MCP session #{state.mcp_session_id} timed out, cleaning up")
    do_cleanup(state)
    {:stop, :normal, state}
  end

  @impl true
  def terminate(_reason, state) do
    do_cleanup(state)
  end

  defp do_cleanup(%{pending_cleanup: sessions, mcp_session_id: id}) do
    for name <- sessions do
      case TmuxManager.kill_session(name) do
        :ok ->
          Logger.info("MCP session #{id}: cleaned up tmux session '#{name}'")

        {:error, reason} ->
          Logger.debug(
            "MCP session #{id}: failed to clean up tmux session '#{name}': #{inspect(reason)}"
          )
      end
    end
  end
end
