defmodule Termigate.MCP.ResourcesTest do
  use ExUnit.Case, async: false

  import Mox

  alias Hermes.Server.Frame

  setup do
    original = Application.get_env(:termigate, :command_runner)
    Application.put_env(:termigate, :command_runner, Termigate.MockCommandRunner)
    Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)
    on_exit(fn -> Application.put_env(:termigate, :command_runner, original) end)
    :ok
  end

  setup :verify_on_exit!

  defp frame, do: Frame.new()

  describe "Sessions resource" do
    test "returns session list as JSON" do
      Termigate.MockCommandRunner
      |> expect(:run, fn ["list-sessions", "-F", _] ->
        {:ok, "dev\t3\t1700000000\t1\ntest\t1\t1700000100\t0"}
      end)

      {:reply, response, _frame} =
        Termigate.MCP.Resources.Sessions.read(%{}, frame())

      assert response.type == :resource
      assert response.contents["text"] != nil
      sessions = Jason.decode!(response.contents["text"])
      assert length(sessions) == 2
      assert hd(sessions)["name"] == "dev"
    end

    test "returns empty list on error" do
      Termigate.MockCommandRunner
      |> expect(:run, fn ["list-sessions", "-F", _] ->
        {:error, {"no server running", 1}}
      end)

      {:reply, response, _frame} =
        Termigate.MCP.Resources.Sessions.read(%{}, frame())

      assert Jason.decode!(response.contents["text"]) == []
    end
  end

  describe "SessionPanes resource" do
    test "returns panes grouped by window" do
      Termigate.MockCommandRunner
      |> expect(:run, fn ["list-panes", "-s", "-t", "dev", "-F", _] ->
        {:ok, "dev\t0\t0\t120\t40\tbash\t%0\ndev\t0\t1\t60\t40\tvim\t%1"}
      end)

      {:reply, result, _frame} =
        Termigate.MCP.Resources.SessionPanes.read("dev", frame())

      assert [content] = result["contents"]
      assert content["uri"] == "tmux://session/dev/panes"
      assert content["mimeType"] == "application/json"

      data = Jason.decode!(content["text"])
      assert length(data) == 1
      window = hd(data)
      assert window["window"] == "0"
      assert length(window["panes"]) == 2
    end

    test "returns error for missing session" do
      Termigate.MockCommandRunner
      |> expect(:run, fn ["list-panes", "-s", "-t", "nope", "-F", _] ->
        {:error, {"can't find session nope", 1}}
      end)

      {:error, error, _frame} =
        Termigate.MCP.Resources.SessionPanes.read("nope", frame())

      assert error.reason == :resource_not_found
      assert error.data.message =~ "Session not found"
    end
  end

  describe "PaneScreen resource" do
    test "returns pane content with ANSI stripped" do
      Termigate.MockCommandRunner
      |> expect(:run, fn ["capture-pane", "-p", "-t", "dev:0.0"] ->
        {:ok, "\e[32m$ hello\e[0m\n"}
      end)

      {:reply, result, _frame} =
        Termigate.MCP.Resources.PaneScreen.read("dev:0.0", frame())

      assert [content] = result["contents"]
      assert content["uri"] == "tmux://pane/dev:0.0/screen"
      assert content["mimeType"] == "text/plain"
      assert content["text"] == "$ hello\n"
    end

    test "returns error for missing pane" do
      Termigate.MockCommandRunner
      |> expect(:run, fn ["capture-pane", "-p", "-t", "nope:0.0"] ->
        {:error, {"can't find pane", 1}}
      end)

      {:error, error, _frame} =
        Termigate.MCP.Resources.PaneScreen.read("nope:0.0", frame())

      assert error.reason == :resource_not_found
      assert error.data.message =~ "Pane not found"
    end
  end
end
