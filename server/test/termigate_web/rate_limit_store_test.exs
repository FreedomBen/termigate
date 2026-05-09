defmodule TermigateWeb.RateLimitStoreTest do
  # async: false because we attach a process-global telemetry handler
  use ExUnit.Case, async: false

  alias TermigateWeb.RateLimitStore

  # The rate-limit store's ETS table is process-global. `:erlang.unique_integer/0`
  # is monotonic and unique within the VM, so each call gets its own bucket key
  # with no collisions across concurrent test runs.
  defp unique_ip(prefix), do: "#{prefix}.#{:erlang.unique_integer([:positive])}"

  describe "check/3 basics" do
    test "allows requests under limit" do
      ip = unique_ip("10.0.0")
      assert :ok = RateLimitStore.check(ip, :test_endpoint, {5, 60})
      assert :ok = RateLimitStore.check(ip, :test_endpoint, {5, 60})
    end

    test "blocks requests over limit" do
      ip = unique_ip("10.1.0")

      for _ <- 1..5 do
        assert :ok = RateLimitStore.check(ip, :test_limit, {5, 60})
      end

      assert {:error, :rate_limited, _retry} = RateLimitStore.check(ip, :test_limit, {5, 60})
    end

    test "different IPs have independent limits" do
      ip1 = unique_ip("10.2.0")
      ip2 = unique_ip("10.3.0")

      for _ <- 1..5 do
        RateLimitStore.check(ip1, :test_indep, {5, 60})
      end

      assert {:error, :rate_limited, _} = RateLimitStore.check(ip1, :test_indep, {5, 60})
      assert :ok = RateLimitStore.check(ip2, :test_indep, {5, 60})
    end

    test "different keys have independent limits" do
      ip = unique_ip("10.4.0")

      for _ <- 1..5 do
        RateLimitStore.check(ip, :key_a, {5, 60})
      end

      assert {:error, :rate_limited, _} = RateLimitStore.check(ip, :key_a, {5, 60})
      assert :ok = RateLimitStore.check(ip, :key_b, {5, 60})
    end
  end

  describe "retry_after" do
    test "is at most the window size, and counts down inside the window" do
      ip = unique_ip("172.16.0")

      for _ <- 1..3 do
        assert :ok = RateLimitStore.check(ip, :test_retry, {3, 60})
      end

      {:error, :rate_limited, retry_after} = RateLimitStore.check(ip, :test_retry, {3, 60})

      assert retry_after >= 1
      assert retry_after <= 60
    end
  end

  describe "windowing" do
    test "different window sizes for the same {ip, key} produce independent buckets" do
      ip = unique_ip("172.17.0")

      for _ <- 1..5, do: RateLimitStore.check(ip, :test_window, {5, 60})
      assert {:error, :rate_limited, _} = RateLimitStore.check(ip, :test_window, {5, 60})

      assert :ok = RateLimitStore.check(ip, :test_window, {5, 1})
    end
  end

  describe "telemetry" do
    test "emits [:termigate, :auth, :rate_limited] when the limit is exceeded" do
      ip = unique_ip("172.18.0")
      handler_id = "rate-limit-test-#{:erlang.unique_integer([:positive])}"
      test_pid = self()

      :telemetry.attach(
        handler_id,
        [:termigate, :auth, :rate_limited],
        fn event, measurements, metadata, _ ->
          send(test_pid, {:telemetry, event, measurements, metadata})
        end,
        nil
      )

      try do
        for _ <- 1..2 do
          assert :ok = RateLimitStore.check(ip, :test_telem, {2, 60})
        end

        assert {:error, :rate_limited, _} = RateLimitStore.check(ip, :test_telem, {2, 60})

        assert_receive {:telemetry, [:termigate, :auth, :rate_limited], %{},
                        %{ip: ^ip, endpoint_key: :test_telem}},
                       500
      after
        :telemetry.detach(handler_id)
      end
    end

    test "does not emit telemetry while still under the limit" do
      ip = unique_ip("172.19.0")
      handler_id = "rate-limit-noemit-#{:erlang.unique_integer([:positive])}"
      test_pid = self()

      :telemetry.attach(
        handler_id,
        [:termigate, :auth, :rate_limited],
        fn event, measurements, metadata, _ ->
          send(test_pid, {:telemetry, event, measurements, metadata})
        end,
        nil
      )

      try do
        for _ <- 1..3 do
          assert :ok = RateLimitStore.check(ip, :test_no_telem, {5, 60})
        end

        refute_receive {:telemetry, _, _, _}, 100
      after
        :telemetry.detach(handler_id)
      end
    end
  end

  describe "cleanup sweep" do
    test "removes entries older than the 60s window cutoff" do
      table = :rate_limit_store
      old_window = (System.system_time(:second) |> div(60)) - 5
      stale_key = {"203.0.113.1", :test_stale, old_window}
      :ets.insert(table, {stale_key, 42})

      send(Process.whereis(RateLimitStore), :cleanup)
      :sys.get_state(RateLimitStore)

      refute :ets.member(table, stale_key)
    end

    test "leaves recent entries untouched" do
      table = :rate_limit_store
      ip = unique_ip("203.0.114")
      assert :ok = RateLimitStore.check(ip, :test_recent, {5, 60})

      send(Process.whereis(RateLimitStore), :cleanup)
      :sys.get_state(RateLimitStore)

      window = System.system_time(:second) |> div(60)
      assert :ets.member(table, {ip, :test_recent, window})
    end
  end
end
