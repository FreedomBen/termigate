defmodule TmuxRmWeb.SessionListLive do
  use TmuxRmWeb, :live_view

  alias TmuxRm.{SessionPoller, TmuxManager}

  require Logger

  @state_topic "sessions:state"

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(TmuxRm.PubSub, @state_topic)
    end

    sessions = SessionPoller.get()
    tmux_status = SessionPoller.tmux_status()

    socket =
      socket
      |> assign(:sessions, sessions)
      |> assign(:tmux_status, tmux_status)
      |> assign(:expanded, MapSet.new())
      |> assign(:show_new_session_form, false)
      |> assign(:new_session_name, "")
      |> assign(:new_session_error, nil)

    {:ok, socket}
  end

  @impl true
  def handle_info({:sessions_updated, sessions}, socket) do
    {:noreply, assign(socket, :sessions, sessions)}
  end

  def handle_info({:tmux_status_changed, status}, socket) do
    {:noreply, assign(socket, :tmux_status, status)}
  end

  @impl true
  def handle_event("toggle_session", %{"name" => name}, socket) do
    expanded =
      if MapSet.member?(socket.assigns.expanded, name) do
        MapSet.delete(socket.assigns.expanded, name)
      else
        MapSet.put(socket.assigns.expanded, name)
      end

    {:noreply, assign(socket, :expanded, expanded)}
  end

  def handle_event("toggle_new_session_form", _params, socket) do
    {:noreply,
     socket
     |> assign(:show_new_session_form, !socket.assigns.show_new_session_form)
     |> assign(:new_session_name, "")
     |> assign(:new_session_error, nil)}
  end

  def handle_event("validate_session_name", %{"name" => name}, socket) do
    error =
      cond do
        name == "" -> nil
        not TmuxManager.valid_session_name?(name) -> "Invalid name. Use only letters, numbers, hyphens, and underscores."
        true -> nil
      end

    {:noreply,
     socket
     |> assign(:new_session_name, name)
     |> assign(:new_session_error, error)}
  end

  def handle_event("create_session", %{"name" => name}, socket) do
    name = String.trim(name)

    if name == "" do
      {:noreply, assign(socket, :new_session_error, "Session name is required.")}
    else
      case TmuxManager.create_session(name) do
        {:ok, _} ->
          {:noreply,
           socket
           |> assign(:show_new_session_form, false)
           |> assign(:new_session_name, "")
           |> assign(:new_session_error, nil)
           |> put_flash(:info, "Session \"#{name}\" created.")}

        {:error, :invalid_name} ->
          {:noreply, assign(socket, :new_session_error, "Invalid session name.")}

        {:error, msg} ->
          {:noreply, assign(socket, :new_session_error, "Failed: #{msg}")}
      end
    end
  end

  def handle_event("kill_session", %{"name" => name}, socket) do
    case TmuxManager.kill_session(name) do
      :ok ->
        {:noreply, put_flash(socket, :info, "Session \"#{name}\" killed.")}

      {:error, msg} ->
        {:noreply, put_flash(socket, :error, "Failed to kill session: #{msg}")}
    end
  end

  def handle_event("retry_tmux", _params, socket) do
    SessionPoller.force_poll()
    {:noreply, socket}
  end

  # --- Helpers ---

  defp session_expanded?(expanded, name), do: MapSet.member?(expanded, name)

  defp format_created(nil), do: ""

  defp format_created(%DateTime{} = dt) do
    Calendar.strftime(dt, "%Y-%m-%d %H:%M")
  end

  defp total_panes(session) do
    session
    |> Map.get(:panes, %{})
    |> Enum.reduce(0, fn {_window, panes}, acc -> acc + length(panes) end)
  end

  defp sorted_panes(session) do
    session
    |> Map.get(:panes, %{})
    |> Enum.sort_by(fn {window_idx, _} -> window_idx end)
    |> Enum.flat_map(fn {_window_idx, panes} ->
      Enum.sort_by(panes, & &1.index)
    end)
  end
end
