defmodule Mix.Tasks.Termigate.ChangePasswordTest do
  use ExUnit.Case, async: false

  alias Mix.Tasks.Termigate.ChangePassword, as: ChangePasswordTask
  alias Termigate.Auth

  setup do
    Application.ensure_all_started(:termigate)
    original = Mix.shell()
    Mix.shell(Mix.Shell.Process)

    on_exit(fn ->
      Mix.shell(original)

      if GenServer.whereis(Termigate.Config) do
        Termigate.Config.update(fn cfg -> Map.delete(cfg, "auth") end)
      end
    end)

    :ok
  end

  defp drain_shell_messages do
    receive do
      {:mix_shell, _, _} -> drain_shell_messages()
    after
      0 -> :ok
    end
  end

  defp seed_credentials(username, password) do
    :ok = Auth.write_credentials(username, password)
  end

  test "rotates the password when current password is correct" do
    seed_credentials("alice", "old-pw")

    send(self(), {:mix_shell_input, :prompt, "old-pw"})
    send(self(), {:mix_shell_input, :prompt, "new-pw"})
    send(self(), {:mix_shell_input, :prompt, "new-pw"})

    ChangePasswordTask.run([])

    assert :ok = Auth.verify_credentials("alice", "new-pw")
    assert :error = Auth.verify_credentials("alice", "old-pw")

    drain_shell_messages()
  end

  test "exits 1 with an error when current password is wrong" do
    seed_credentials("alice", "old-pw")

    send(self(), {:mix_shell_input, :prompt, "wrong"})

    assert catch_exit(ChangePasswordTask.run([])) == {:shutdown, 1}
    assert_received {:mix_shell, :error, ["Current password is incorrect."]}

    # Original password unchanged
    assert :ok = Auth.verify_credentials("alice", "old-pw")
  end

  test "exits 1 when no credentials exist" do
    if GenServer.whereis(Termigate.Config) do
      Termigate.Config.update(fn cfg -> Map.delete(cfg, "auth") end)
    end

    assert catch_exit(ChangePasswordTask.run([])) == {:shutdown, 1}

    assert_received {:mix_shell, :error,
                     ["No credentials found. Run `mix termigate.setup` first."]}
  end

  test "exits 1 when new password is empty" do
    seed_credentials("alice", "old-pw")

    send(self(), {:mix_shell_input, :prompt, "old-pw"})
    send(self(), {:mix_shell_input, :prompt, ""})

    assert catch_exit(ChangePasswordTask.run([])) == {:shutdown, 1}
    assert_received {:mix_shell, :error, ["Password cannot be empty."]}
  end

  test "exits 1 when new password and confirmation do not match" do
    seed_credentials("alice", "old-pw")

    send(self(), {:mix_shell_input, :prompt, "old-pw"})
    send(self(), {:mix_shell_input, :prompt, "first"})
    send(self(), {:mix_shell_input, :prompt, "second"})

    assert catch_exit(ChangePasswordTask.run([])) == {:shutdown, 1}
    assert_received {:mix_shell, :error, ["Passwords do not match."]}

    # Old password still works
    assert :ok = Auth.verify_credentials("alice", "old-pw")
  end
end
