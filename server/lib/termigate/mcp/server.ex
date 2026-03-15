defmodule Termigate.MCP.Server do
  @moduledoc "MCP server for AI agent access to tmux sessions."

  use Hermes.Server,
    name: "termigate",
    version: "0.1.0",
    capabilities: [:tools, :resources]

  alias Hermes.Server.Component.Resource
  alias Hermes.Server.Handlers

  # Resources
  component(Termigate.MCP.Resources.Sessions, name: "tmux_sessions")

  # Tier 1: Core tmux operations
  component(Termigate.MCP.Tools.ListSessions, name: "tmux_list_sessions")
  component(Termigate.MCP.Tools.ListPanes, name: "tmux_list_panes")
  component(Termigate.MCP.Tools.CreateSession, name: "tmux_create_session")
  component(Termigate.MCP.Tools.KillSession, name: "tmux_kill_session")
  component(Termigate.MCP.Tools.SplitPane, name: "tmux_split_pane")
  component(Termigate.MCP.Tools.KillPane, name: "tmux_kill_pane")
  component(Termigate.MCP.Tools.SendKeys, name: "tmux_send_keys")
  component(Termigate.MCP.Tools.ReadPane, name: "tmux_read_pane")
  component(Termigate.MCP.Tools.ReadHistory, name: "tmux_read_history")
  component(Termigate.MCP.Tools.ResizePane, name: "tmux_resize_pane")

  # Tier 2: Workflow tools
  component(Termigate.MCP.Tools.RunCommand, name: "tmux_run_command")
  component(Termigate.MCP.Tools.RunCommandInNewSession, name: "tmux_run_command_in_new_session")
  component(Termigate.MCP.Tools.WaitForOutput, name: "tmux_wait_for_output")
  component(Termigate.MCP.Tools.SendAndRead, name: "tmux_send_and_read")

  @resource_templates [
    %Resource{
      uri_template: "tmux://session/{name}/panes",
      name: "session_panes",
      description: "Pane layout for a tmux session, grouped by window.",
      mime_type: "application/json"
    },
    %Resource{
      uri_template: "tmux://pane/{target}/screen",
      name: "pane_screen",
      description: "Current visible screen content for a tmux pane.",
      mime_type: "text/plain"
    }
  ]

  @doc "Returns the resource templates defined by this server."
  def resource_templates, do: @resource_templates

  @impl true
  def handle_request(
        %{"method" => "resources/read", "params" => %{"uri" => uri}} = request,
        frame
      ) do
    case parse_template_uri(uri) do
      {:session_panes, session_name} ->
        Termigate.MCP.Resources.SessionPanes.read(session_name, frame)

      {:pane_screen, target} ->
        Termigate.MCP.Resources.PaneScreen.read(target, frame)

      :not_template ->
        Handlers.handle(request, __MODULE__, frame)
    end
  end

  # Return template resources for discovery
  def handle_request(
        %{"method" => "resources/templates/list"} = _request,
        frame
      ) do
    {:reply, %{"resourceTemplates" => @resource_templates}, frame}
  end

  def handle_request(request, frame), do: Handlers.handle(request, __MODULE__, frame)

  # Parse template URIs into structured matches
  @session_panes_regex ~r"^tmux://session/([a-zA-Z0-9_-]+)/panes$"
  @pane_screen_regex ~r"^tmux://pane/([a-zA-Z0-9_-]+:[0-9]+\.[0-9]+)/screen$"

  defp parse_template_uri(uri) do
    cond do
      match = Regex.run(@session_panes_regex, uri) ->
        {:session_panes, Enum.at(match, 1)}

      match = Regex.run(@pane_screen_regex, uri) ->
        {:pane_screen, Enum.at(match, 1)}

      true ->
        :not_template
    end
  end
end
