defmodule Mix.Tasks.Termigate.Reset do
  @moduledoc "Wipe all termigate configuration and credentials, restoring first-run state."
  @shortdoc "Reset termigate to first-run state"

  use Mix.Task

  @impl true
  def run(_args) do
    config_dir = Path.expand("~/.config/termigate")

    files = [
      Path.join(config_dir, "credentials"),
      Path.join(config_dir, "config.yaml")
    ]

    existing = Enum.filter(files, &File.exists?/1)

    if existing == [] do
      Mix.shell().info("Nothing to reset — no config files found in #{config_dir}")
    else
      Mix.shell().info("This will delete:")
      Enum.each(existing, &Mix.shell().info("  #{&1}"))

      if Mix.shell().yes?("\nContinue?") do
        Enum.each(existing, fn path ->
          case File.rm(path) do
            :ok -> Mix.shell().info("Deleted #{path}")
            {:error, reason} -> Mix.shell().error("Failed to delete #{path}: #{reason}")
          end
        end)

        Mix.shell().info("\nReset complete. On next server start you will be prompted to set up a new account.")
      else
        Mix.shell().info("Aborted.")
      end
    end
  end
end
