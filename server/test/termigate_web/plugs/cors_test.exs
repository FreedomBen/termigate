defmodule TermigateWeb.Plugs.CorsTest do
  # async: false — the :cors_origin app env is process-global
  use ExUnit.Case, async: false

  import Plug.Test
  import Plug.Conn

  alias TermigateWeb.Plugs.Cors

  setup do
    original = Application.get_env(:termigate, :cors_origin)

    on_exit(fn ->
      if original,
        do: Application.put_env(:termigate, :cors_origin, original),
        else: Application.delete_env(:termigate, :cors_origin)
    end)

    :ok
  end

  describe "call/2 — when :cors_origin is unset" do
    test "passes the conn through unchanged (no CORS headers, not halted)" do
      Application.delete_env(:termigate, :cors_origin)

      conn =
        conn(:get, "/api/sessions")
        |> put_req_header("origin", "https://example.com")
        |> Cors.call(Cors.init([]))

      refute conn.halted
      assert get_resp_header(conn, "access-control-allow-origin") == []
      assert get_resp_header(conn, "access-control-allow-methods") == []
    end
  end

  describe "call/2 — when :cors_origin is configured" do
    test "applies the configured origin to a matching same-origin request" do
      Application.put_env(:termigate, :cors_origin, "https://allowed.example.com")

      conn =
        conn(:get, "/api/sessions")
        |> put_req_header("origin", "https://allowed.example.com")
        |> Cors.call(Cors.init([]))

      assert get_resp_header(conn, "access-control-allow-origin") ==
               ["https://allowed.example.com"]
    end

    test "does not echo a non-matching origin" do
      Application.put_env(:termigate, :cors_origin, "https://allowed.example.com")

      conn =
        conn(:get, "/api/sessions")
        |> put_req_header("origin", "https://attacker.example.com")
        |> Cors.call(Cors.init([]))

      assert get_resp_header(conn, "access-control-allow-origin") == []
    end

    test "responds to a CORS preflight (OPTIONS) and halts" do
      Application.put_env(:termigate, :cors_origin, "https://allowed.example.com")

      conn =
        conn(:options, "/api/sessions")
        |> put_req_header("origin", "https://allowed.example.com")
        |> put_req_header("access-control-request-method", "POST")
        |> Cors.call(Cors.init([]))

      assert conn.halted
      assert conn.status in [200, 204]

      assert get_resp_header(conn, "access-control-allow-origin") ==
               ["https://allowed.example.com"]

      [methods] = get_resp_header(conn, "access-control-allow-methods")
      assert methods =~ "POST"
    end
  end

  describe "init/1" do
    test "passes options through unchanged" do
      assert Cors.init(foo: :bar) == [foo: :bar]
    end
  end
end
