defmodule TermigateWeb.PageController do
  use TermigateWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
