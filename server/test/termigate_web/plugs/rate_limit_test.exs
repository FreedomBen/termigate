defmodule TermigateWeb.Plugs.RateLimitTest do
  use TermigateWeb.ConnCase, async: false

  alias TermigateWeb.Plugs.RateLimit

  setup do
    original = Application.get_env(:termigate, :rate_limits)
    on_exit(fn -> Application.put_env(:termigate, :rate_limits, original) end)
    %{original_limits: original}
  end

  defp build_conn_with_ip(ip_tuple, format \\ "json") do
    Phoenix.ConnTest.build_conn()
    |> Map.put(:remote_ip, ip_tuple)
    |> Plug.Conn.put_private(:phoenix_format, format)
    |> Plug.Conn.fetch_query_params()
  end

  defp install_limit(original_limits, key, limit) do
    base = original_limits || %{}
    Application.put_env(:termigate, :rate_limits, Map.put(base, key, limit))
  end

  defp unique_test_key, do: :"plug_test_#{:erlang.unique_integer([:positive])}"

  describe "init/1" do
    test "passes options through unchanged" do
      assert RateLimit.init(key: :login) == [key: :login]
    end
  end

  describe "call/2 — under limit" do
    test "passes the conn through without halting", %{original_limits: original} do
      key = unique_test_key()
      install_limit(original, key, {3, 60})

      conn = build_conn_with_ip({192, 168, 50, 1}) |> RateLimit.call(key: key)

      refute conn.halted
      assert conn.status == nil
    end
  end

  describe "call/2 — over limit, JSON format" do
    test "responds 429 with JSON body and retry_after", %{original_limits: original} do
      key = unique_test_key()
      install_limit(original, key, {1, 60})
      ip = {192, 168, 51, :erlang.unique_integer([:positive]) |> rem(250) |> Kernel.+(1)}

      build_conn_with_ip(ip) |> RateLimit.call(key: key)
      conn = build_conn_with_ip(ip) |> RateLimit.call(key: key)

      assert conn.halted
      assert conn.status == 429

      body = Jason.decode!(conn.resp_body)
      assert body["error"] == "rate_limited"
      assert is_integer(body["retry_after"])
      assert body["retry_after"] >= 1

      assert Plug.Conn.get_resp_header(conn, "retry-after") != []
    end
  end

  describe "call/2 — over limit, HTML format" do
    test "redirects to /login with a flash and retry-after header",
         %{original_limits: original} do
      key = unique_test_key()
      install_limit(original, key, {1, 60})
      ip = {192, 168, 52, :erlang.unique_integer([:positive]) |> rem(250) |> Kernel.+(1)}

      build_html_conn = fn ->
        build_conn_with_ip(ip, "html")
        |> Plug.Test.init_test_session(%{})
        |> Phoenix.Controller.fetch_flash()
      end

      build_html_conn.() |> RateLimit.call(key: key)
      conn = build_html_conn.() |> RateLimit.call(key: key)

      assert conn.halted
      assert redirected_to(conn) == "/login"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "Too many login attempts"
      assert Plug.Conn.get_resp_header(conn, "retry-after") != []
    end
  end

  describe "call/2 — unknown key falls back to default {10, 60}" do
    test "an unrecognised key still goes through the default limit" do
      ip = {192, 168, 53, :erlang.unique_integer([:positive]) |> rem(250) |> Kernel.+(1)}

      conn = build_conn_with_ip(ip) |> RateLimit.call(key: :totally_unconfigured)

      refute conn.halted
    end
  end
end
