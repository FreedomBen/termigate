ExUnit.start(exclude: [:skip, :tmux])

# To run tmux integration tests: mix test --include tmux

# Set a global default stub so background processes (SessionPoller, LayoutPoller)
# don't crash with Mox.UnexpectedCallError when MockCommandRunner is active
Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)

# Tear down any leftover tmux server on the test socket so the run starts
# from a known-empty state, and kill it again at BEAM exit so subsequent
# runs don't inherit half-dead sessions. Together with the `-S <socket>`
# flag wired into CommandRunner and TmuxHelpers, this guarantees that no
# tmux command from a test ever touches the developer's tmux server.
case Application.get_env(:termigate, :tmux_socket) do
  nil ->
    :ok

  socket when is_binary(socket) ->
    System.cmd("tmux", ["-S", socket, "kill-server"], stderr_to_stdout: true)
    File.rm(socket)

    System.at_exit(fn _status ->
      System.cmd("tmux", ["-S", socket, "kill-server"], stderr_to_stdout: true)
      File.rm(socket)
    end)
end
