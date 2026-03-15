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

    test "initialize includes resources capability", %{conn: conn} do
      conn =
        conn
        |> mcp_conn()
        |> post("/mcp", init_payload())

      assert conn.status == 200
      body = Jason.decode!(conn.resp_body)
      assert body["result"]["capabilities"]["resources"] != nil
    end

    test "resources/list returns static resources", %{conn: conn} do
      session_id = init_session(conn)

      list_conn =
        conn
        |> mcp_conn()
        |> put_req_header("mcp-session-id", session_id)
        |> post("/mcp", %{
          "jsonrpc" => "2.0",
          "id" => 3,
          "method" => "resources/list",
          "params" => %{}
        })

      assert list_conn.status == 200
      body = Jason.decode!(list_conn.resp_body)
      resources = body["result"]["resources"]
      assert is_list(resources)

      names = Enum.map(resources, & &1["name"])
      assert "tmux_sessions" in names

      sessions_resource = Enum.find(resources, &(&1["name"] == "tmux_sessions"))
      assert sessions_resource["uri"] == "tmux://sessions"
      assert sessions_resource["mimeType"] == "application/json"
    end

    test "resource templates are defined for discovery" do
      # Verify our server defines the expected resource templates.
      # Templates are served via handle_request override since the Hermes
      # StreamableHTTP transport has issues routing resources/templates/list.
      templates = Termigate.MCP.Server.resource_templates()
      assert length(templates) == 2

      names = Enum.map(templates, & &1.name)
      assert "session_panes" in names
      assert "pane_screen" in names

      session_panes = Enum.find(templates, &(&1.name == "session_panes"))
      assert session_panes.uri_template == "tmux://session/{name}/panes"
      assert session_panes.mime_type == "application/json"

      pane_screen = Enum.find(templates, &(&1.name == "pane_screen"))
      assert pane_screen.uri_template == "tmux://pane/{target}/screen"
      assert pane_screen.mime_type == "text/plain"
    end

    test "tools have correct annotations", %{conn: conn} do
      session_id = init_session(conn)

      list_conn =
        conn
        |> mcp_conn()
        |> put_req_header("mcp-session-id", session_id)
        |> post("/mcp", %{
          "jsonrpc" => "2.0",
          "id" => 5,
          "method" => "tools/list",
          "params" => %{}
        })

      assert list_conn.status == 200
      body = Jason.decode!(list_conn.resp_body)
      tools = body["result"]["tools"]

      # Read-only tools should have readOnlyHint
      read_only_tools =
        ~w(tmux_list_sessions tmux_list_panes tmux_read_pane tmux_read_history tmux_wait_for_output)

      for tool_name <- read_only_tools do
        tool = Enum.find(tools, &(&1["name"] == tool_name))

        assert tool["annotations"]["readOnlyHint"] == true,
               "Expected #{tool_name} to have readOnlyHint: true"
      end

      # Destructive tools should have destructiveHint
      destructive_tools = ~w(tmux_kill_session tmux_kill_pane)

      for tool_name <- destructive_tools do
        tool = Enum.find(tools, &(&1["name"] == tool_name))

        assert tool["annotations"]["destructiveHint"] == true,
               "Expected #{tool_name} to have destructiveHint: true"
      end
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

  defp init_session(conn) do
    init_conn =
      conn
      |> mcp_conn()
      |> post("/mcp", init_payload())

    session_id = get_resp_header(init_conn, "mcp-session-id") |> hd()

    conn
    |> mcp_conn()
    |> put_req_header("mcp-session-id", session_id)
    |> post("/mcp", %{
      "jsonrpc" => "2.0",
      "method" => "notifications/initialized"
    })

    session_id
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
