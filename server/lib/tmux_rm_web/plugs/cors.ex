defmodule TmuxRmWeb.Plugs.Cors do
  @moduledoc "Conditionally applies CORS headers when RCA_CORS_ORIGIN is configured."

  @behaviour Plug

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    case Application.get_env(:tmux_rm, :cors_origin) do
      nil ->
        conn

      origin ->
        opts =
          Corsica.init(
            origins: origin,
            allow_headers: ["authorization", "content-type"],
            allow_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
          )

        Corsica.call(conn, opts)
    end
  end
end
