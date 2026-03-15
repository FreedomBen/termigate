defmodule Termigate.MCP.Resources.PaneScreen do
  @moduledoc "Current visible screen content for a tmux pane."

  alias Hermes.MCP.Error
  alias Termigate.MCP.AnsiStripper
  alias Termigate.TmuxManager

  @doc "Read visible screen content for the given pane target."
  def read(target, frame) do
    case TmuxManager.capture_pane(target) do
      {:ok, content} ->
        content = AnsiStripper.strip(content)

        resource_content = %{
          "uri" => "tmux://pane/#{target}/screen",
          "mimeType" => "text/plain",
          "text" => content
        }

        {:reply, %{"contents" => [resource_content]}, frame}

      {:error, :pane_not_found} ->
        {:error, Error.resource(:not_found, %{message: "Pane not found: #{target}"}), frame}

      {:error, reason} ->
        {:error,
         Error.resource(:not_found, %{message: "Failed to read pane: #{inspect(reason)}"}), frame}
    end
  end
end
