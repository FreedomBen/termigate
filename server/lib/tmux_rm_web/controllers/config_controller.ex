defmodule TmuxRmWeb.ConfigController do
  use TmuxRmWeb, :controller

  alias TmuxRm.Config

  def show(conn, _params) do
    config = Config.get()
    json(conn, config)
  end
end
