defmodule Termigate.MCP.ServerTest do
  use ExUnit.Case, async: true

  alias Termigate.MCP.Server

  describe "parse_template_uri/1" do
    test "matches a session/{name}/panes URI" do
      assert Server.parse_template_uri("tmux://session/work/panes") ==
               {:session_panes, "work"}
    end

    test "matches session names with hyphens, underscores, and digits" do
      assert Server.parse_template_uri("tmux://session/my-app_2/panes") ==
               {:session_panes, "my-app_2"}
    end

    test "matches a pane/{target}/screen URI" do
      assert Server.parse_template_uri("tmux://pane/work:0.0/screen") ==
               {:pane_screen, "work:0.0"}
    end

    test "matches pane targets with multi-digit window/pane indices" do
      assert Server.parse_template_uri("tmux://pane/work:12.34/screen") ==
               {:pane_screen, "work:12.34"}
    end

    test "rejects pane URIs whose target lacks the window.pane suffix" do
      assert Server.parse_template_uri("tmux://pane/work/screen") == :not_template
    end

    test "rejects URIs with disallowed characters in the session name" do
      assert Server.parse_template_uri("tmux://session/work%20app/panes") ==
               :not_template

      assert Server.parse_template_uri("tmux://session/../etc/panes") ==
               :not_template
    end

    test "rejects URIs with no trailing slash + segment" do
      assert Server.parse_template_uri("tmux://session/work") == :not_template
      assert Server.parse_template_uri("tmux://pane/work:0.0") == :not_template
    end

    test "rejects schemes other than tmux://" do
      assert Server.parse_template_uri("file://session/work/panes") == :not_template
    end

    test "rejects empty session name" do
      assert Server.parse_template_uri("tmux://session//panes") == :not_template
    end

    test "rejects garbage input" do
      assert Server.parse_template_uri("") == :not_template
      assert Server.parse_template_uri("not a uri at all") == :not_template
    end
  end

  describe "resource_templates/0" do
    test "exposes both session_panes and pane_screen templates" do
      templates = Server.resource_templates()
      names = Enum.map(templates, & &1.name)

      assert "session_panes" in names
      assert "pane_screen" in names
    end

    test "uri_template strings actually parse via parse_template_uri/1" do
      # The example targets here just need to satisfy the regex shape.
      assert Server.parse_template_uri("tmux://session/example/panes") ==
               {:session_panes, "example"}

      assert Server.parse_template_uri("tmux://pane/example:0.0/screen") ==
               {:pane_screen, "example:0.0"}
    end
  end
end
