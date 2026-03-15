defmodule TermigateWeb.MCPEndpointTest do
  use TermigateWeb.ConnCase

  @mcp_accept "application/json, text/event-stream"

  defp mcp_conn(conn) do
    conn
    |> put_req_header("content-type", "application/json")
    |> put_req_header("accept", @mcp_accept)
  end

  defp init_payload do
    %{
      "jsonrpc" => "2.0",
      "id" => 1,
      "method" => "initialize",
      "params" => %{
        "protocolVersion" => "2025-03-26",
        "capabilities" => %{},
        "clientInfo" => %{"name" => "test", "version" => "1.0"}
      }
    }
  end

  describe "POST /mcp" do
    @tag :skip_auth
    test "rejects unauthenticated requests", %{conn: conn} do
      Application.put_env(:termigate, :auth_token, "real-token")

      conn =
        conn
        |> Plug.Conn.delete_req_header("authorization")
        |> mcp_conn()
        |> post("/mcp", init_payload())

      assert json_response(conn, 401) == %{"error" => "unauthorized"}
    end

    test "returns 406 without proper Accept header", %{conn: conn} do
      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> put_req_header("accept", "application/json")
        |> post("/mcp", init_payload())

      assert conn.status == 406
    end
  end

  describe "POST /mcp (with MCP server)" do
    setup do
      case start_mcp_server() do
        {:ok, _pid} -> :ok
        :already_running -> :ok
        {:error, reason} -> {:skip, "Could not start MCP server: #{inspect(reason)}"}
      end
    end

    test "handles JSON-RPC initialize request", %{conn: conn} do
      conn =
        conn
        |> mcp_conn()
        |> post("/mcp", init_payload())

      assert conn.status == 200

      body = Jason.decode!(conn.resp_body)
      assert body["jsonrpc"] == "2.0"
      assert body["id"] == 1
      assert body["result"]["serverInfo"]["name"] == "termigate"
      assert body["result"]["capabilities"]["tools"] != nil
    end

    test "tools/list returns all 14 tools", %{conn: conn} do
      # First initialize
      init_conn =
        conn
        |> mcp_conn()
        |> post("/mcp", init_payload())

      assert init_conn.status == 200
      session_id = get_resp_header(init_conn, "mcp-session-id") |> hd()

      # Send initialized notification
      conn
      |> mcp_conn()
      |> put_req_header("mcp-session-id", session_id)
      |> post("/mcp", %{
        "jsonrpc" => "2.0",
        "method" => "notifications/initialized"
      })

      # Now list tools
      list_conn =
        conn
        |> mcp_conn()
        |> put_req_header("mcp-session-id", session_id)
        |> post("/mcp", %{
          "jsonrpc" => "2.0",
          "id" => 2,
          "method" => "tools/list",
          "params" => %{}
        })

      assert list_conn.status == 200
      body = Jason.decode!(list_conn.resp_body)
      tools = body["result"]["tools"]
      assert length(tools) == 14

      tool_names = Enum.map(tools, & &1["name"]) |> Enum.sort()

      assert tool_names == [
               "tmux_create_session",
               "tmux_kill_pane",
               "tmux_kill_session",
               "tmux_list_panes",
               "tmux_list_sessions",
               "tmux_read_history",
               "tmux_read_pane",
               "tmux_resize_pane",
               "tmux_run_command",
               "tmux_run_command_in_new_session",
               "tmux_send_and_read",
               "tmux_send_keys",
               "tmux_split_pane",
               "tmux_wait_for_output"
             ]
    end

    test "rate limits excessive requests", %{conn: conn} do
      # Use a very low limit and clear the ETS table first
      original_limits = Application.get_env(:termigate, :rate_limits)
      Application.put_env(:termigate, :rate_limits, %{mcp: {2, 60}})
      :ets.delete_all_objects(:rate_limit_store)
      on_exit(fn -> Application.put_env(:termigate, :rate_limits, original_limits) end)

      auth_header = Plug.Conn.get_req_header(conn, "authorization") |> hd()

      make_conn = fn ->
        build_conn()
        |> Plug.Test.init_test_session(%{"authenticated_at" => System.system_time(:second)})
        |> Plug.Conn.put_req_header("authorization", auth_header)
        |> mcp_conn()
      end

      # First two requests should pass
      conn1 = make_conn.() |> post("/mcp", init_payload())
      refute conn1.status == 429

      conn2 = make_conn.() |> post("/mcp", init_payload())
      refute conn2.status == 429

      # Third should be rate limited
      conn3 = make_conn.() |> post("/mcp", init_payload())
      assert conn3.status == 429
      assert get_resp_header(conn3, "retry-after") != []
    end
  end

  defp start_mcp_server do
    if Hermes.Server.Registry.whereis_transport(Termigate.MCP.Server, :streamable_http) do
      :already_running
    else
      Hermes.Server.Supervisor.start_link(Termigate.MCP.Server,
        transport: {:streamable_http, start: true}
      )
    end
  end
end
