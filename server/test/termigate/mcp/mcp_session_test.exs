defmodule Termigate.MCP.McpSessionTest do
  use ExUnit.Case, async: false

  import Mox

  alias Termigate.MCP.McpSession

  setup do
    original = Application.get_env(:termigate, :command_runner)
    Application.put_env(:termigate, :command_runner, Termigate.MockCommandRunner)
    Mox.set_mox_global()
    Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)
    on_exit(fn -> Application.put_env(:termigate, :command_runner, original) end)
    :ok
  end

  defp unique_session_id, do: "test-session-#{System.unique_integer([:positive])}"

  defp stop_session(id) do
    case Registry.lookup(Termigate.McpSessionRegistry, id) do
      [{pid, _}] -> GenServer.stop(pid, :shutdown)
      [] -> :ok
    end
  catch
    :exit, _ -> :ok
  end

  describe "track_session/2" do
    test "tracks a tmux session name" do
      id = unique_session_id()
      McpSession.track_session(id, "my-session")

      assert McpSession.tracked_sessions(id) == ["my-session"]
      stop_session(id)
    end

    test "tracks multiple sessions" do
      id = unique_session_id()
      McpSession.track_session(id, "session-a")
      McpSession.track_session(id, "session-b")

      tracked = McpSession.tracked_sessions(id) |> Enum.sort()
      assert tracked == ["session-a", "session-b"]
      stop_session(id)
    end
  end

  describe "untrack_session/2" do
    test "removes a tracked session" do
      id = unique_session_id()
      McpSession.track_session(id, "session-a")
      McpSession.track_session(id, "session-b")
      McpSession.untrack_session(id, "session-a")

      assert McpSession.tracked_sessions(id) == ["session-b"]
      stop_session(id)
    end

    test "no-ops for unknown MCP session" do
      assert McpSession.untrack_session("nonexistent", "whatever") == :ok
    end
  end

  describe "cleanup/1" do
    test "kills all tracked tmux sessions" do
      id = unique_session_id()
      McpSession.track_session(id, "mcp-abc")
      McpSession.track_session(id, "mcp-def")

      # Stub kill_session to succeed (don't use expect — terminate may also call it)
      killed = :ets.new(:killed, [:bag, :public])

      Termigate.MockCommandRunner
      |> stub(:run, fn
        ["kill-session", "-t", name] ->
          :ets.insert(killed, {name})
          {:ok, ""}

        args ->
          Termigate.StubCommandRunner.run(args)
      end)

      assert McpSession.cleanup(id) == :ok

      killed_names = :ets.tab2list(killed) |> Enum.map(&elem(&1, 0)) |> Enum.sort()
      assert "mcp-abc" in killed_names
      assert "mcp-def" in killed_names
      :ets.delete(killed)
    end

    test "no-ops for unknown MCP session" do
      assert McpSession.cleanup("nonexistent") == :ok
    end
  end

  describe "terminate cleanup" do
    test "cleans up tracked sessions when process stops" do
      id = unique_session_id()
      McpSession.track_session(id, "mcp-orphan")

      killed = :ets.new(:killed, [:bag, :public])

      Termigate.MockCommandRunner
      |> stub(:run, fn
        ["kill-session", "-t", name] ->
          :ets.insert(killed, {name})
          {:ok, ""}

        args ->
          Termigate.StubCommandRunner.run(args)
      end)

      [{pid, _}] = Registry.lookup(Termigate.McpSessionRegistry, id)
      GenServer.stop(pid, :normal)
      Process.sleep(10)

      killed_names = :ets.tab2list(killed) |> Enum.map(&elem(&1, 0))
      assert "mcp-orphan" in killed_names
      assert McpSession.tracked_sessions(id) == []
      :ets.delete(killed)
    end
  end
end
