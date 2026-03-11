ExUnit.start(exclude: [:skip])

# Exclude tmux integration tests if tmux not installed
unless System.find_executable("tmux") do
  ExUnit.configure(exclude: [:tmux])
end
