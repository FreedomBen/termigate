defmodule Mix.Tasks.Termigate.ResetTest do
  # async: false because we mutate Mix.shell and the :reset_config_dir env
  use ExUnit.Case, async: false

  alias Mix.Tasks.Termigate.Reset, as: ResetTask

  setup do
    original_shell = Mix.shell()

    tmp_dir =
      Path.join(System.tmp_dir!(), "termigate-reset-test-#{:erlang.unique_integer([:positive])}")

    File.mkdir_p!(tmp_dir)
    Application.put_env(:termigate, :reset_config_dir, tmp_dir)
    Mix.shell(Mix.Shell.Process)

    on_exit(fn ->
      Mix.shell(original_shell)
      Application.delete_env(:termigate, :reset_config_dir)
      File.rm_rf(tmp_dir)
    end)

    %{tmp_dir: tmp_dir}
  end

  defp drain_shell_messages do
    receive do
      {:mix_shell, _, _} -> drain_shell_messages()
    after
      0 -> :ok
    end
  end

  defp seed(file, content), do: File.mkdir_p!(Path.dirname(file)) && File.write!(file, content)

  test "reports nothing to reset when no config files exist", %{tmp_dir: dir} do
    ResetTask.run([])

    assert_received {:mix_shell, :info, [msg]}
    assert msg =~ "Nothing to reset"
    assert msg =~ dir
  end

  test "deletes credentials and config when user confirms", %{tmp_dir: dir} do
    creds = Path.join(dir, "credentials")
    yaml = Path.join(dir, "config.yaml")
    seed(creds, "user: alice")
    seed(yaml, "ui:\n  theme: dark")

    send(self(), {:mix_shell_input, :yes?, true})
    ResetTask.run([])

    refute File.exists?(creds)
    refute File.exists?(yaml)
    drain_shell_messages()
  end

  test "preserves files when user declines confirmation", %{tmp_dir: dir} do
    creds = Path.join(dir, "credentials")
    seed(creds, "user: alice")

    send(self(), {:mix_shell_input, :yes?, false})
    ResetTask.run([])

    assert File.exists?(creds)
    assert_received {:mix_shell, :info, ["Aborted."]}
  end

  test "lists each existing file before prompting", %{tmp_dir: dir} do
    creds = Path.join(dir, "credentials")
    yaml = Path.join(dir, "config.yaml")
    seed(creds, "x")
    seed(yaml, "y")

    send(self(), {:mix_shell_input, :yes?, false})
    ResetTask.run([])

    assert_received {:mix_shell, :info, ["This will delete:"]}

    listed =
      Stream.repeatedly(fn ->
        receive do
          {:mix_shell, :info, [line]} -> line
        after
          0 -> nil
        end
      end)
      |> Enum.take_while(&(&1 != nil))
      |> Enum.map(&String.trim/1)

    assert creds in listed
    assert yaml in listed
  end
end
