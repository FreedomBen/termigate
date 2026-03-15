defmodule Termigate.MCP.Workflows.WaitForOutputTest do
  use ExUnit.Case, async: false

  alias Termigate.MCP.Workflows.WaitForOutput

  describe "wait/3" do
    test "returns error for invalid regex" do
      assert {:error, msg} = WaitForOutput.wait("test:0.0", "[invalid", timeout_ms: 100)
      assert msg =~ "Invalid regex"
    end

    test "matches pattern in incoming PubSub output" do
      target = "wait-match:0.0"

      task =
        Task.async(fn ->
          Process.sleep(30)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "loading...\n"}
          )

          Process.sleep(10)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "server ready on port 3000\n"}
          )
        end)

      result = WaitForOutput.wait(target, "ready on port \\d+", timeout_ms: 2000)

      assert {:ok, data} = result
      assert data.matched == true
      assert data.match =~ "ready on port 3000"
      assert data.timed_out == false
      assert data.context =~ "server ready"

      Task.await(task)
    end

    test "returns timed_out when pattern not found" do
      target = "wait-timeout:0.0"

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "irrelevant output\n"}
          )
        end)

      result = WaitForOutput.wait(target, "never_gonna_match", timeout_ms: 200)

      assert {:ok, data} = result
      assert data.matched == false
      assert data.timed_out == true
      assert data.match == nil

      Task.await(task)
    end

    test "returns context lines around match" do
      target = "wait-context:0.0"

      lines =
        Enum.map(1..20, fn i -> "line #{i}" end)
        |> Enum.join("\n")

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, lines <> "\n"}
          )
        end)

      result = WaitForOutput.wait(target, "line 10", timeout_ms: 2000)

      assert {:ok, data} = result
      assert data.matched == true
      # Should include surrounding lines (5 before, 5 after)
      assert data.context =~ "line 5"
      assert data.context =~ "line 10"
      assert data.context =~ "line 15"

      Task.await(task)
    end

    test "handles pane death" do
      target = "wait-dead:0.0"

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_dead, target}
          )
        end)

      result = WaitForOutput.wait(target, "anything", timeout_ms: 2000)
      assert {:error, :pane_dead} = result

      Task.await(task)
    end

    test "strips ANSI when raw is false" do
      target = "wait-ansi:0.0"

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "\e[32mSUCCESS\e[0m done\n"}
          )
        end)

      result = WaitForOutput.wait(target, "SUCCESS", timeout_ms: 2000)
      assert {:ok, data} = result
      assert data.matched == true
      # ANSI stripped — match should be plain text
      assert data.match == "SUCCESS"

      Task.await(task)
    end
  end
end
