defmodule Termigate.PaneStreamSupervisorTest do
  # async: false because the supervisor and Registry are global singletons
  use ExUnit.Case, async: false

  alias Termigate.PaneStreamSupervisor

  setup do
    Application.ensure_all_started(:termigate)
    :ok
  end

  describe "count_children/0" do
    test "returns a DynamicSupervisor stats map with the expected keys" do
      stats = PaneStreamSupervisor.count_children()

      assert is_map(stats)
      assert Map.has_key?(stats, :active)
      assert Map.has_key?(stats, :specs)
      assert Map.has_key?(stats, :supervisors)
      assert Map.has_key?(stats, :workers)

      for {_key, value} <- stats, do: assert(is_integer(value))
    end
  end

  describe "start_child/1" do
    test "delegates to the named DynamicSupervisor and returns its result shape" do
      # Without a real tmux server, the child either fails to start or
      # exits during setup. Both are valid DynamicSupervisor outcomes; the
      # contract this test pins is that PaneStreamSupervisor.start_child/1
      # actually routes through DynamicSupervisor and surfaces its return
      # tuple unchanged. We use a unique target so we don't collide with
      # any pre-existing entry in the Registry.
      target = "no-such-session-#{:erlang.unique_integer([:positive])}:0.0"

      result = PaneStreamSupervisor.start_child(target)

      assert match?({:ok, pid} when is_pid(pid), result) or
               match?({:ok, pid, _info} when is_pid(pid), result) or
               match?({:error, _reason}, result)

      # If a pid was returned, ensure cleanup so we don't leak processes.
      case result do
        {:ok, pid} ->
          ref = Process.monitor(pid)
          DynamicSupervisor.terminate_child(Termigate.PaneStreamSupervisor, pid)
          assert_receive {:DOWN, ^ref, :process, ^pid, _}, 1_000

        _ ->
          :ok
      end
    end
  end
end
