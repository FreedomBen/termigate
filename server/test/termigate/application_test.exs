defmodule Termigate.ApplicationTest do
  # async: false — touches global app env (auth_token, endpoint config)
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  setup do
    original_token = Application.get_env(:termigate, :auth_token)
    original_endpoint = Application.get_env(:termigate, TermigateWeb.Endpoint)

    # Test config pins Logger to :error; lower it for this module only so
    # capture_log can see the :warning emitted by check_auth_warning/0.
    Logger.put_module_level(Termigate.Application, :warning)

    on_exit(fn ->
      Logger.delete_module_level(Termigate.Application)

      if original_token,
        do: Application.put_env(:termigate, :auth_token, original_token),
        else: Application.delete_env(:termigate, :auth_token)

      Application.put_env(:termigate, TermigateWeb.Endpoint, original_endpoint || [])
    end)

    :ok
  end

  defp set_endpoint_ip(ip) do
    base = Application.get_env(:termigate, TermigateWeb.Endpoint, [])
    http = Keyword.get(base, :http, []) |> Keyword.put(:ip, ip)
    Application.put_env(:termigate, TermigateWeb.Endpoint, Keyword.put(base, :http, http))
  end

  describe "check_auth_warning/0" do
    test "does not warn when auth is enabled (token set)" do
      Application.put_env(:termigate, :auth_token, "any-token")
      set_endpoint_ip({0, 0, 0, 0})

      log = capture_log([level: :warning], &Termigate.Application.check_auth_warning/0)
      refute log =~ "Listening on 0.0.0.0"
    end

    test "does not warn on a loopback bind even without auth" do
      Application.delete_env(:termigate, :auth_token)
      set_endpoint_ip({127, 0, 0, 1})

      log = capture_log([level: :warning], &Termigate.Application.check_auth_warning/0)
      refute log =~ "Listening on 0.0.0.0"
    end

    test "warns on IPv4 0.0.0.0 with auth disabled" do
      Application.delete_env(:termigate, :auth_token)
      set_endpoint_ip({0, 0, 0, 0})

      log = capture_log([level: :warning], &Termigate.Application.check_auth_warning/0)

      assert log =~ "Listening on 0.0.0.0 with no authentication configured"
      assert log =~ "mix termigate.setup"
      assert log =~ "TERMIGATE_AUTH_TOKEN"
    end

    test "warns on the IPv6 wildcard bind with auth disabled" do
      Application.delete_env(:termigate, :auth_token)
      set_endpoint_ip({0, 0, 0, 0, 0, 0, 0, 0})

      log = capture_log([level: :warning], &Termigate.Application.check_auth_warning/0)
      assert log =~ "Listening on 0.0.0.0 with no authentication configured"
    end
  end
end
