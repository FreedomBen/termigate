defmodule TermigateWeb.SessionController do
  use TermigateWeb, :controller

  alias Termigate.{SessionPoller, TmuxManager}

  require Logger

  def index(conn, _params) do
    sessions = SessionPoller.get()

    json(conn, %{
      sessions:
        Enum.map(sessions, fn session ->
          panes =
            session
            |> Map.get(:panes, %{})
            |> Enum.flat_map(fn {_window, panes} -> panes end)
            |> Enum.map(&pane_to_json/1)

          %{
            name: session.name,
            windows: session.windows,
            created: session.created && DateTime.to_unix(session.created),
            attached: session.attached?,
            panes: panes
          }
        end)
    })
  end

  def create(conn, %{"name" => name} = params) do
    opts =
      if command = params["command"] do
        [command: command]
      else
        []
      end

    case TmuxManager.create_session(name, opts) do
      {:ok, _} ->
        conn
        |> put_status(:created)
        |> json(%{name: name, status: "created"})

      {:error, :invalid_name} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "invalid_name", message: "Session name must match ^[a-zA-Z0-9_-]+$"})

      {:error, msg} when is_binary(msg) ->
        status = if String.contains?(msg, "duplicate"), do: :conflict, else: :unprocessable_entity

        conn
        |> put_status(status)
        |> json(%{error: "creation_failed", message: msg})
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "validation_failed", message: "Missing required field: name"})
  end

  def delete(conn, %{"name" => name}) do
    case TmuxManager.kill_session(name) do
      :ok ->
        json(conn, %{status: "ok"})

      {:error, msg} ->
        status =
          if String.contains?(to_string(msg), "not found") or
               String.contains?(to_string(msg), "can't find"),
             do: :not_found,
             else: :unprocessable_entity

        conn
        |> put_status(status)
        |> json(%{error: "not_found", message: "Session '#{name}' not found"})
    end
  end

  def update(conn, %{"name" => old_name} = params) do
    # "new_name" from body takes priority; "name" in body is the URL param
    new_name = params["new_name"] || old_name

    case TmuxManager.rename_session(old_name, new_name) do
      :ok ->
        json(conn, %{name: new_name, status: "renamed"})

      {:error, :invalid_name} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "invalid_name", message: "Session name must match ^[a-zA-Z0-9_-]+$"})

      {:error, msg} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "rename_failed", message: to_string(msg)})
    end
  end

  def create_window(conn, %{"name" => session}) do
    case TmuxManager.create_window(session) do
      :ok ->
        conn
        |> put_status(:created)
        |> json(%{status: "created"})

      {:error, msg} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "creation_failed", message: to_string(msg)})
    end
  end

  defp pane_to_json(pane) do
    %{
      session_name: pane.session_name,
      window_index: pane.window_index,
      index: pane.index,
      width: pane.width,
      height: pane.height,
      command: pane.command,
      pane_id: pane.pane_id
    }
  end
end
