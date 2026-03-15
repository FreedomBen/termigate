defmodule Termigate.MCP.Workflows.RunCommandTest do
  use ExUnit.Case, async: false

  import Mox

  setup do
    original = Application.get_env(:termigate, :command_runner)
    Application.put_env(:termigate, :command_runner, Termigate.MockCommandRunner)
    Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)
    on_exit(fn -> Application.put_env(:termigate, :command_runner, original) end)
    :ok
  end

  setup :verify_on_exit!

  describe "output collection via PubSub" do
    test "detects marker in streamed output" do
      target = "pubsub-test:0.0"
      marker = "__MCP_DONE_testid123"
      marker_regex = ~r/#{Regex.escape(marker)}_(\d+)__/

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "line 1\nline 2\n"}
          )

          Process.sleep(10)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "#{marker}_0__\n"}
          )
        end)

      Phoenix.PubSub.subscribe(Termigate.PubSub, "pane:#{target}")
      result = do_collect(target, marker_regex, 2000, [])

      assert {:ok, output, 0} = result
      assert output =~ "line 1"
      assert output =~ "line 2"

      Task.await(task)
    end

    test "detects non-zero exit code" do
      target = "exitcode-test:0.0"
      marker = "__MCP_DONE_testid456"
      marker_regex = ~r/#{Regex.escape(marker)}_(\d+)__/

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "error output\n#{marker}_1__\n"}
          )
        end)

      Phoenix.PubSub.subscribe(Termigate.PubSub, "pane:#{target}")
      result = do_collect(target, marker_regex, 2000, [])

      assert {:ok, output, 1} = result
      assert output =~ "error output"

      Task.await(task)
    end

    test "returns timeout with partial output when deadline passes" do
      target = "timeout-collect:0.0"
      marker_regex = ~r/__MCP_DONE_nevermatches_(\d+)__/

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "partial data"}
          )
        end)

      Phoenix.PubSub.subscribe(Termigate.PubSub, "pane:#{target}")
      result = do_collect(target, marker_regex, 200, [])

      assert {:timeout, partial} = result
      assert partial =~ "partial data"

      Task.await(task)
    end

    test "handles split marker across chunks" do
      target = "split-marker:0.0"
      marker = "__MCP_DONE_splitid"
      marker_regex = ~r/#{Regex.escape(marker)}_(\d+)__/

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "output\n__MCP_DONE_"}
          )

          Process.sleep(10)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "splitid_42__\n"}
          )
        end)

      Phoenix.PubSub.subscribe(Termigate.PubSub, "pane:#{target}")
      result = do_collect(target, marker_regex, 2000, [])

      assert {:ok, _output, 42} = result

      Task.await(task)
    end

    test "handles empty output before marker" do
      target = "empty-output:0.0"
      marker = "__MCP_DONE_emptyid"
      marker_regex = ~r/#{Regex.escape(marker)}_(\d+)__/

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_output, target, "#{marker}_0__\n"}
          )
        end)

      Phoenix.PubSub.subscribe(Termigate.PubSub, "pane:#{target}")
      result = do_collect(target, marker_regex, 2000, [])

      assert {:ok, "", 0} = result

      Task.await(task)
    end

    test "handles pane death during collection" do
      target = "dead-pane:0.0"
      marker_regex = ~r/__MCP_DONE_dead_(\d+)__/

      task =
        Task.async(fn ->
          Process.sleep(20)

          Phoenix.PubSub.broadcast(
            Termigate.PubSub,
            "pane:#{target}",
            {:pane_dead, target}
          )
        end)

      Phoenix.PubSub.subscribe(Termigate.PubSub, "pane:#{target}")
      result = do_collect(target, marker_regex, 2000, [])

      assert {:error, :pane_dead} = result

      Task.await(task)
    end
  end

  # Mirrors RunCommand.do_collect/4 for direct testing of the receive loop
  defp do_collect(target, marker_regex, timeout_ms, acc) do
    deadline = System.monotonic_time(:millisecond) + timeout_ms
    do_collect_loop(target, marker_regex, deadline, acc)
  end

  defp do_collect_loop(target, marker_regex, deadline, acc) do
    remaining = deadline - System.monotonic_time(:millisecond)

    if remaining <= 0 do
      {:timeout, IO.iodata_to_binary(acc)}
    else
      receive do
        {:pane_output, ^target, data} ->
          new_acc = acc ++ [data]
          combined = IO.iodata_to_binary(new_acc)

          case Regex.run(marker_regex, combined) do
            [full_match, exit_code_str] ->
              {exit_code, _} = Integer.parse(exit_code_str)
              output = String.split(combined, full_match) |> List.first() || ""
              {:ok, output, exit_code}

            _ ->
              do_collect_loop(target, marker_regex, deadline, new_acc)
          end

        {:pane_dead, ^target} ->
          {:error, :pane_dead}
      after
        min(remaining, 100) ->
          do_collect_loop(target, marker_regex, deadline, acc)
      end
    end
  end
end
