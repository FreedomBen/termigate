ExUnit.start(exclude: [:skip, :tmux])

# To run tmux integration tests: mix test --include tmux

# Set a global default stub so background processes (SessionPoller, LayoutPoller)
# don't crash with Mox.UnexpectedCallError when MockCommandRunner is active
Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)
