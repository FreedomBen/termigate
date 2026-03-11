defmodule TmuxRmWeb.HealthController do
  use TmuxRmWeb, :controller

  def healthz(conn, _params) do
    tmux_status = TmuxRm.SessionPoller.tmux_status()

    {http_status, body} =
      case tmux_status do
        :ok ->
          {200, %{status: "ok", tmux: "ok"}}

        :no_server ->
          {200, %{status: "ok", tmux: "no_server"}}

        :not_found ->
          {503, %{status: "error", tmux: "not_found"}}

        {:error, msg} ->
          {503, %{status: "error", tmux: "error", message: msg}}
      end

    conn
    |> put_status(http_status)
    |> json(body)
  end
end
