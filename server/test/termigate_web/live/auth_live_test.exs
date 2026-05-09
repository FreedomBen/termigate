defmodule TermigateWeb.AuthLiveTest do
  use TermigateWeb.ConnCase, async: false

  import Phoenix.LiveViewTest

  describe "login page" do
    test "renders login form when not authenticated", %{conn: _conn} do
      # Build a conn with auth enabled but no authenticated session
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Test.init_test_session(%{})

      {:ok, _view, html} = live(conn, "/login")
      assert html =~ "termigate"
      assert html =~ "Username"
      assert html =~ "Password"
    end

    test "redirects to home when already authenticated", %{conn: conn} do
      assert {:error, {:live_redirect, %{to: "/"}}} = live(conn, "/login")
    end

    @tag :skip_auth
    test "redirects to setup when auth not configured", %{conn: conn} do
      Application.delete_env(:termigate, :auth_token)
      assert {:error, {:live_redirect, %{to: "/setup"}}} = live(conn, "/login")
    end

    test "renders a password-visibility toggle wired to the password input (F7)", %{conn: _conn} do
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Test.init_test_session(%{})

      {:ok, _view, html} = live(conn, "/login")

      # PasswordToggleHook button referencing the password input by id, with
      # the accessible default state (`Show password`).
      assert html =~ ~s(phx-hook="PasswordToggle")
      assert html =~ ~s(data-target="password")
      assert html =~ ~s(aria-label="Show password")
    end
  end
end
