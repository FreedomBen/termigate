defmodule TermigateWeb.UserSocket do
  use Phoenix.Socket

  require Logger

  channel "terminal:*", TermigateWeb.TerminalChannel
  channel "sessions", TermigateWeb.SessionChannel

  @impl true
  def connect(params, socket, connect_info) do
    if Termigate.Auth.auth_enabled?() do
      max_age = Termigate.Auth.session_ttl_seconds()

      case Phoenix.Token.verify(TermigateWeb.Endpoint, "channel", params["token"],
             max_age: max_age
           ) do
        {:ok, _data} ->
          {:ok, socket}

        {:error, _reason} ->
          # Also try api_token for API clients
          case Phoenix.Token.verify(TermigateWeb.Endpoint, "api_token", params["token"],
                 max_age: max_age
               ) do
            {:ok, _data} ->
              {:ok, socket}

            {:error, _} ->
              ip = extract_ip(connect_info)
              Logger.info("WebSocket auth failed from #{ip}")
              :error
          end
      end
    else
      {:ok, socket}
    end
  end

  @impl true
  def id(_socket), do: nil

  defp extract_ip(%{peer_data: %{address: addr}}) do
    addr |> :inet.ntoa() |> to_string()
  end

  defp extract_ip(_), do: "unknown"
end
