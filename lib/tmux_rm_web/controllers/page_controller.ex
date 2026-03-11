defmodule TmuxRmWeb.PageController do
  use TmuxRmWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
