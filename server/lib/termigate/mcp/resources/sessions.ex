defmodule Termigate.MCP.Resources.Sessions do
  @moduledoc "Current list of all tmux sessions."

  use Hermes.Server.Component,
    type: :resource,
    uri: "tmux://sessions",
    mime_type: "application/json"

  alias Hermes.Server.Response
  alias Termigate.TmuxManager

  @impl true
  def read(_params, frame) do
    case TmuxManager.list_sessions() do
      {:ok, sessions} ->
        data = JSON.encode!(Enum.map(sessions, &serialize_session/1))
        {:reply, Response.resource() |> Response.text(data), frame}

      {:error, _reason} ->
        {:reply, Response.resource() |> Response.text("[]"), frame}
    end
  end

  defp serialize_session(session) do
    %{
      name: session.name,
      windows: session.windows,
      created: if(session.created, do: DateTime.to_iso8601(session.created)),
      attached: session.attached?
    }
  end
end
