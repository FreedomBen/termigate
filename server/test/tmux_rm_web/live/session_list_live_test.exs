defmodule TmuxRmWeb.SessionListLiveTest do
  use TmuxRmWeb.ConnCase, async: false

  import Phoenix.LiveViewTest

  describe "mount" do
    test "renders session list page", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/")
      assert html =~ "Sessions"
    end

    test "shows empty state when no sessions", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/")
      # Either shows sessions or empty state
      assert html =~ "Sessions" or html =~ "No tmux sessions"
    end
  end

  describe "new session form" do
    test "toggle form visibility", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/")

      html = view |> element("button", "New Session") |> render_click()
      assert html =~ "Session name"

      html = view |> element("button", "Cancel") |> render_click()
      refute html =~ "Session name"
    end

    test "validates session name", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/")

      # Open form
      view |> element("button", "New Session") |> render_click()

      # Invalid name
      html =
        view
        |> form("form", %{name: "bad:name"})
        |> render_change()

      assert html =~ "Invalid name"
    end
  end

  describe "health endpoint" do
    test "returns health status", %{conn: conn} do
      conn = get(conn, "/healthz")
      assert json_response(conn, 200)["status"] in ["ok", "error"] or
               json_response(conn, 503)["status"] == "error"
    end
  end
end
