defmodule TermigateWeb.ConfigController do
  use TermigateWeb, :controller

  alias Termigate.Config

  def show(conn, _params) do
    config = Config.get()
    json(conn, config)
  end
end
