defmodule Mix.Tasks.Termigate.SetupTest do
  # async: false because we mutate Mix.shell and the global Termigate.Config GenServer
  use ExUnit.Case, async: false

  alias Mix.Tasks.Termigate.Setup, as: SetupTask
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

  test "writes credentials when prompts are answered consistently" do
    send(self(), {:mix_shell_input, :prompt, "alice"})
    send(self(), {:mix_shell_input, :prompt, "secret-pw"})
    send(self(), {:mix_shell_input, :prompt, "secret-pw"})

    SetupTask.run([])

    assert {:ok, {"alice", _hash}} = Auth.read_credentials()
    assert :ok = Auth.verify_credentials("alice", "secret-pw")

    drain_shell_messages()
  end

  test "blank username falls back to $USER (or 'admin')" do
    expected_user = System.get_env("USER") || "admin"

    send(self(), {:mix_shell_input, :prompt, ""})
    send(self(), {:mix_shell_input, :prompt, "pw"})
    send(self(), {:mix_shell_input, :prompt, "pw"})

    SetupTask.run([])

    assert {:ok, {^expected_user, _hash}} = Auth.read_credentials()

    drain_shell_messages()
  end

  test "exits with shutdown 1 when password is empty" do
    send(self(), {:mix_shell_input, :prompt, "alice"})
    send(self(), {:mix_shell_input, :prompt, ""})

    assert catch_exit(SetupTask.run([])) == {:shutdown, 1}
    assert_received {:mix_shell, :error, ["Password cannot be empty."]}
  end

  test "exits with shutdown 1 when confirmation does not match" do
    send(self(), {:mix_shell_input, :prompt, "alice"})
    send(self(), {:mix_shell_input, :prompt, "one"})
    send(self(), {:mix_shell_input, :prompt, "two"})

    assert catch_exit(SetupTask.run([])) == {:shutdown, 1}
    assert_received {:mix_shell, :error, ["Passwords do not match."]}
  end
end
