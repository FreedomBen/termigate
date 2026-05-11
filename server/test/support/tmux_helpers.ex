defmodule Termigate.TmuxHelpers do
  @moduledoc "Helpers for tmux integration tests."
  import ExUnit.Callbacks, only: [on_exit: 1]

  def create_test_session(name \\ nil) do
    name = name || "test-#{:rand.uniform(100_000)}"
    {_, 0} = System.cmd("tmux", socket_args() ++ ["new-session", "-d", "-s", name])
    name
  end

  def destroy_test_session(name) do
    System.cmd("tmux", socket_args() ++ ["kill-session", "-t", name])
  end

  def setup_tmux(_context) do
    name = create_test_session()
    on_exit(fn -> destroy_test_session(name) end)
    %{session: name}
  end

  # Mirror Termigate.Tmux.CommandRunner's socket handling so test sessions
  # live on the isolated test socket, not the developer's tmux server.
  defp socket_args do
    case Application.get_env(:termigate, :tmux_socket) do
      nil -> []
      socket -> ["-S", socket]
    end
  end
end
