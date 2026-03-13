defmodule TermigateWeb.Plugs.RequireAuthTest do
  use TermigateWeb.ConnCase, async: false

  alias TermigateWeb.Plugs.RequireAuth

  # This test manages auth_token directly — skip ConnCase auto-setup
  @moduletag :skip_auth

  describe "call/2" do
    test "redirects to /setup when auth is not enabled", %{conn: conn} do
      Application.delete_env(:termigate, :auth_token)

      conn =
        conn
        |> init_test_session(%{})
        |> RequireAuth.call(RequireAuth.init([]))

      assert conn.halted
      assert redirected_to(conn) == "/setup"
    end

    test "redirects to /login when no session and auth enabled", %{conn: conn} do
      Application.put_env(:termigate, :auth_token, "some-token")

      conn =
        conn
        |> init_test_session(%{})
        |> RequireAuth.call(RequireAuth.init([]))

      assert conn.halted
      assert redirected_to(conn) == "/login"
    end

    test "passes through when session has authenticated_at", %{conn: conn} do
      Application.put_env(:termigate, :auth_token, "some-token")

      conn =
        conn
        |> init_test_session(%{"authenticated_at" => System.system_time(:second)})
        |> RequireAuth.call(RequireAuth.init([]))

      refute conn.halted
    end
  end
end
