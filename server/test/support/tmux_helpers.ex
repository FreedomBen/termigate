defmodule TmuxRm.TmuxHelpers do
  @moduledoc "Helpers for tmux integration tests."
  import ExUnit.Callbacks, only: [on_exit: 1]

  def create_test_session(name \\ nil) do
    name = name || "test-#{:rand.uniform(100_000)}"
    {_, 0} = System.cmd("tmux", ["new-session", "-d", "-s", name])
    name
  end

  def destroy_test_session(name) do
    System.cmd("tmux", ["kill-session", "-t", name])
  end

  def setup_tmux(_context) do
    name = create_test_session()
    on_exit(fn -> destroy_test_session(name) end)
    %{session: name}
  end
end
