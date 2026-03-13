defmodule Mix.Tasks.Termigate.Setup do
  @moduledoc "Set up authentication credentials for termigate."
  @shortdoc "Set up termigate credentials"

  use Mix.Task

  @impl true
  def run(_args) do
    default_user = System.get_env("USER") || "admin"

    username =
      Mix.shell().prompt("Username [#{default_user}]: ")
      |> String.trim()
      |> case do
        "" -> default_user
        name -> name
      end

    password = Mix.shell().prompt("Password: ") |> String.trim()

    if password == "" do
      Mix.shell().error("Password cannot be empty.")
      exit({:shutdown, 1})
    end

    confirm = Mix.shell().prompt("Confirm password: ") |> String.trim()

    if password != confirm do
      Mix.shell().error("Passwords do not match.")
      exit({:shutdown, 1})
    end

    case Termigate.Auth.write_credentials(username, password) do
      :ok ->
        Mix.shell().info("Credentials saved to #{Termigate.Auth.config_path()}")

      {:error, reason} ->
        Mix.shell().error("Failed to write credentials: #{inspect(reason)}")
        exit({:shutdown, 1})
    end
  end
end
