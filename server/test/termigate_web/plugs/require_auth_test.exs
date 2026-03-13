defmodule TermigateWeb.Plugs.RequireAuthTest do
  use TermigateWeb.ConnCase, async: false

  alias TermigateWeb.Plugs.RequireAuth

  describe "call/2" do
    test "passes through when auth is not enabled", %{conn: conn} do
      original = Application.get_env(:termigate, :auth_token)

      try do
        Application.delete_env(:termigate, :auth_token)
        # Ensure no credentials file affects this test
        conn =
          conn
          |> init_test_session(%{})
          |> RequireAuth.call(RequireAuth.init([]))

        refute conn.halted
      after
        if original, do: Application.put_env(:termigate, :auth_token, original)
      end
    end

    test "redirects to /login when no session and auth enabled", %{conn: conn} do
      original = Application.get_env(:termigate, :auth_token)

      try do
        Application.put_env(:termigate, :auth_token, "some-token")

        conn =
          conn
          |> init_test_session(%{})
          |> RequireAuth.call(RequireAuth.init([]))

        assert conn.halted
        assert redirected_to(conn) == "/login"
      after
        if original,
          do: Application.put_env(:termigate, :auth_token, original),
          else: Application.delete_env(:termigate, :auth_token)
      end
    end

    test "passes through when session has authenticated_at", %{conn: conn} do
      original = Application.get_env(:termigate, :auth_token)

      try do
        Application.put_env(:termigate, :auth_token, "some-token")

        conn =
          conn
          |> init_test_session(%{"authenticated_at" => System.system_time(:second)})
          |> RequireAuth.call(RequireAuth.init([]))

        refute conn.halted
      after
        if original,
          do: Application.put_env(:termigate, :auth_token, original),
          else: Application.delete_env(:termigate, :auth_token)
      end
    end
  end
end
