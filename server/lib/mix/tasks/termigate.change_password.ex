defmodule Mix.Tasks.Termigate.ChangePassword do
  @moduledoc "Change the password for termigate."
  @shortdoc "Change termigate password"

  use Mix.Task

  @impl true
  def run(_args) do
    case Termigate.Auth.read_credentials() do
      {:ok, {username, _hash}} ->
        current = Mix.shell().prompt("Current password: ") |> String.trim()

        case Termigate.Auth.verify_credentials(username, current) do
          :ok ->
            new_password = Mix.shell().prompt("New password: ") |> String.trim()

            if new_password == "" do
              Mix.shell().error("Password cannot be empty.")
              exit({:shutdown, 1})
            end

            confirm = Mix.shell().prompt("Confirm new password: ") |> String.trim()

            if new_password != confirm do
              Mix.shell().error("Passwords do not match.")
              exit({:shutdown, 1})
            end

            # Preserve existing session TTL
            ttl = Termigate.Auth.session_ttl_hours()

            case Termigate.Auth.write_credentials(username, new_password, ttl) do
              :ok -> Mix.shell().info("Password changed successfully.")
              {:error, reason} -> Mix.shell().error("Failed: #{inspect(reason)}")
            end

          :error ->
            Mix.shell().error("Current password is incorrect.")
            exit({:shutdown, 1})
        end

      {:error, :not_found} ->
        Mix.shell().error("No credentials found. Run `mix termigate.setup` first.")
        exit({:shutdown, 1})
    end
  end
end
