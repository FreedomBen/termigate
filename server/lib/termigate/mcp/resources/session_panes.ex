defmodule Termigate.MCP.Resources.SessionPanes do
  @moduledoc "Pane layout for a tmux session."

  alias Hermes.MCP.Error
  alias Termigate.MCP.TargetHelper
  alias Termigate.TmuxManager

  @doc "Read panes for the given session name."
  def read(session_name, frame) do
    case TmuxManager.list_panes(session_name) do
      {:ok, panes_by_window} ->
        data =
          panes_by_window
          |> Enum.sort_by(fn {window_idx, _} -> window_idx end)
          |> Enum.map(fn {window_idx, panes} ->
            %{
              window: to_string(window_idx),
              panes: Enum.map(panes, &serialize_pane/1)
            }
          end)

        content = %{
          "uri" => "tmux://session/#{session_name}/panes",
          "mimeType" => "application/json",
          "text" => JSON.encode!(data)
        }

        {:reply, %{"contents" => [content]}, frame}

      {:error, :session_not_found} ->
        {:error, Error.resource(:not_found, %{message: "Session not found: #{session_name}"}),
         frame}

      {:error, reason} ->
        {:error, Error.resource(:not_found, %{message: "Failed to list panes: #{reason}"}), frame}
    end
  end

  defp serialize_pane(pane) do
    %{
      target: TargetHelper.pane_target(pane),
      index: pane.index,
      width: pane.width,
      height: pane.height,
      command: pane.command,
      pane_id: pane.pane_id
    }
  end
end
