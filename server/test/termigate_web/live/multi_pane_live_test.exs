defmodule TermigateWeb.MultiPaneLiveTest do
  use TermigateWeb.ConnCase, async: false

  import Phoenix.LiveViewTest
  import Mox

  @test_panes [
    %{
      pane_id: "%0",
      target: "test:0.0",
      left: 0,
      top: 0,
      width: 80,
      height: 24,
      index: 0,
      command: "bash"
    },
    %{
      pane_id: "%1",
      target: "test:0.1",
      left: 81,
      top: 0,
      width: 80,
      height: 24,
      index: 1,
      command: "vim"
    }
  ]

  @single_pane [
    %{
      pane_id: "%0",
      target: "test:0.0",
      left: 0,
      top: 0,
      width: 80,
      height: 24,
      index: 0,
      command: "bash"
    }
  ]

  describe "mount with window" do
    test "renders multi-pane view with session name", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/sessions/test/windows/0")
      assert html =~ "test"
    end

    test "renders empty state when no panes", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/sessions/nonexistent/windows/0")
      assert html =~ "No panes"
      assert html =~ "Back to Sessions"
    end

    test "renders back link to session list", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/sessions/test/windows/0")
      assert html =~ ~s(href="/")
    end
  end

  describe "session redirect" do
    test "redirects /sessions/:session to a window", %{conn: conn} do
      {:error, {:live_redirect, %{to: path}}} = live(conn, "/sessions/test")
      assert path =~ ~r|/sessions/test/windows/|
    end
  end

  describe "layout updates" do
    test "updates panes on layout_updated broadcast", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      assert html =~ "test:0.0"
      assert html =~ "test:0.1"
    end

    test "renders grid with correct template after pane update", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      assert html =~ "grid-template-columns"
      assert html =~ "grid-template-rows"
      assert html =~ "multi-pane-grid"
    end

    test "renders pane-tabs chips with index + command labels", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      # Pane-tabs row exists with one chip per pane.
      assert html =~ "pane-tabs"
      assert html =~ "pane-tab-active"
      assert html =~ "pane-tab-inactive"

      # Chip labels are "<index> <command>" derived from the pane target's
      # last segment and the running command (truncated).
      assert html =~ "0 bash"
      assert html =~ "1 vim"

      # Each chip wires up focus_pane with its target.
      assert html =~ ~s(phx-click="focus_pane")
      assert html =~ ~s(phx-value-pane="test:0.0")
      assert html =~ ~s(phx-value-pane="test:0.1")
    end

    test "pane containers have data-mode=multi", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      assert html =~ ~s(data-mode="multi")
    end

    test "resize event is ignored (passive mode)", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      render_hook(view, "resize", %{"cols" => 120, "rows" => 40})
    end
  end

  describe "mobile pane switching" do
    test "single pane: no pane-tabs row and no mobile card list", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @single_pane})
      html = render(view)

      # The pane-tabs switcher is suppressed when there's only one pane —
      # there's nothing to switch to.
      refute html =~ "pane-tabs"

      # The legacy mobile card list is gone for good.
      refute html =~ "mobile-pane-card"

      # The grid is always rendered (no more `hidden sm:grid`); the pane
      # itself mounts as a multi-mode terminal.
      refute html =~ "hidden sm:grid"
      assert html =~ ~s(data-target="test:0.0")
      assert html =~ ~s(data-mode="multi")
    end

    test "multi-pane: grid is always rendered (no more `hidden sm:grid`)", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      # The grid container is present at every viewport — mobile uses CSS
      # to collapse it to a single visible cell rather than hiding it.
      assert html =~ ~s(id="multi-pane-grid")
      refute html =~ "hidden sm:grid"
      refute html =~ "mobile-pane-card"
    end

    test "active_pane defaults to first pane after layout update", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      # First pane's wrapper is the one tagged data-mobile-visible="true";
      # the others are "false".
      assert html =~ ~s(id="pane-wrapper-test:0.0")
      assert html =~ ~r/pane-wrapper-test:0\.0[^>]*data-mobile-visible="true"/
      assert html =~ ~r/pane-wrapper-test:0\.1[^>]*data-mobile-visible="false"/
    end

    test "clicking a chip switches the active (and mobile-visible) pane", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      render_click(view, "focus_pane", %{"pane" => "test:0.1"})
      html = render(view)

      # The visible-pane data attribute moves with the active pane.
      assert html =~ ~r/pane-wrapper-test:0\.1[^>]*data-mobile-visible="true"/
      assert html =~ ~r/pane-wrapper-test:0\.0[^>]*data-mobile-visible="false"/
    end
  end

  describe "notification events" do
    setup %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      # Give the view some panes so it subscribes to pane topics
      send(view.pid, {:layout_updated, @test_panes})
      render(view)
      %{view: view}
    end

    test "forwards pane_idle event with correct payload when mode is activity", %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "activity", "idle_threshold" => 10})
      end)

      render(view)

      send(view.pid, {:pane_idle, "test:0.0", 15_000})

      assert_push_event(view, "notify_pane_idle", %{
        pane: "test:0.0",
        idle_seconds: 15
      })
    end

    test "does not push pane_idle event when mode is disabled", %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "disabled"})
      end)

      render(view)

      send(view.pid, {:pane_idle, "test:0.0", 15_000})
      render(view)

      refute_push_event(view, "notify_pane_idle", %{})
    end

    test "does not push pane_idle event when mode is shell", %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "shell"})
      end)

      render(view)

      send(view.pid, {:pane_idle, "test:0.0", 15_000})
      render(view)

      refute_push_event(view, "notify_pane_idle", %{})
    end

    test "forwards command_finished event with correct payload when mode is shell", %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "shell", "min_duration" => 5})
      end)

      render(view)

      send(
        view.pid,
        {:command_finished, "test:0.0",
         %{
           exit_code: 1,
           command: "make",
           duration_seconds: 30
         }}
      )

      assert_push_event(view, "notify_command_done", %{
        pane: "test:0.0",
        exit_code: 1,
        command: "make",
        duration_seconds: 30
      })
    end

    test "forwards all command_finished events regardless of duration (min_duration is JS-only)",
         %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "shell", "min_duration" => 60})
      end)

      render(view)

      # Duration 2s is below min_duration 60s, but LiveView should forward anyway.
      # Filtering by min_duration is the JS hook's responsibility.
      send(
        view.pid,
        {:command_finished, "test:0.0",
         %{
           exit_code: 0,
           command: "ls",
           duration_seconds: 2
         }}
      )

      assert_push_event(view, "notify_command_done", %{
        pane: "test:0.0",
        command: "ls",
        duration_seconds: 2
      })
    end

    test "does not push command_finished event when mode is activity", %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "activity"})
      end)

      render(view)

      send(
        view.pid,
        {:command_finished, "test:0.0",
         %{
           exit_code: 0,
           command: "make",
           duration_seconds: 30
         }}
      )

      render(view)

      refute_push_event(view, "notify_command_done", %{})
    end

    test "does not push command_finished event when mode is disabled", %{view: view} do
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "disabled"})
      end)

      render(view)

      send(
        view.pid,
        {:command_finished, "test:0.0",
         %{
           exit_code: 0,
           command: "make",
           duration_seconds: 30
         }}
      )

      render(view)

      refute_push_event(view, "notify_command_done", %{})
    end
  end

  describe "focus_pane" do
    test "sets active pane", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      render_click(view, "focus_pane", %{"pane" => "test:0.1"})
      # Should not crash, active pane is set
      render(view)
    end

    test "unmaximizes when focusing a different pane", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      # Maximize first pane
      render_click(view, "maximize_pane", %{"target" => "test:0.0"})
      html = render(view)
      assert html =~ "pane-maximized"

      # Focus second pane — should unmaximize
      render_click(view, "focus_pane", %{"pane" => "test:0.1"})
      html = render(view)
      refute html =~ "pane-maximized"
    end
  end

  describe "pane subscription management" do
    test "subscribes to new panes on layout update", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      # Initial layout with one pane
      send(view.pid, {:layout_updated, [hd(@test_panes)]})
      render(view)

      # Update with two panes — should subscribe to the new one
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      # Enable activity mode so we can verify events are forwarded
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "activity", "idle_threshold" => 10})
      end)

      render(view)

      # Send notification to the new pane — should forward correctly
      send(view.pid, {:pane_idle, "test:0.1", 10_000})

      assert_push_event(view, "notify_pane_idle", %{pane: "test:0.1", idle_seconds: 10})
    end

    test "unsubscribes from removed panes on layout update", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "activity", "idle_threshold" => 10})
      end)

      # Start with two panes
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      # Remove second pane from layout
      send(view.pid, {:layout_updated, [hd(@test_panes)]})
      render(view)

      # Send idle event for the removed pane — should be silently ignored
      # (the LiveView is no longer subscribed, so it won't receive it via PubSub,
      # but even if sent directly it should not crash)
      send(view.pid, {:pane_idle, "test:0.1", 10_000})
      render(view)

      # Verify the remaining pane still works
      send(view.pid, {:pane_idle, "test:0.0", 10_000})

      assert_push_event(view, "notify_pane_idle", %{pane: "test:0.0"})
    end
  end

  describe "grid computation" do
    test "computes correct grid for side-by-side panes", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      send(view.pid, {:layout_updated, @test_panes})
      html = render(view)

      # Should have two column tracks (80fr and 80fr) with a gap
      assert html =~ "grid-template-columns"
      # Both panes should have grid-column placement
      assert html =~ "grid-column:"
    end

    test "computes grid for stacked panes", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")

      stacked = [
        %{
          pane_id: "%0",
          target: "t:0.0",
          left: 0,
          top: 0,
          width: 120,
          height: 20,
          index: 0,
          command: "bash"
        },
        %{
          pane_id: "%1",
          target: "t:0.1",
          left: 0,
          top: 21,
          width: 120,
          height: 20,
          index: 1,
          command: "bash"
        }
      ]

      send(view.pid, {:layout_updated, stacked})
      html = render(view)

      assert html =~ "grid-template-rows"
      assert html =~ "t:0.0"
      assert html =~ "t:0.1"
    end
  end

  describe "fit_pane_width" do
    test "invokes tmux resize-pane with the requested column count", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      original = Application.get_env(:termigate, :command_runner)
      Application.put_env(:termigate, :command_runner, Termigate.MockCommandRunner)
      on_exit(fn -> Application.put_env(:termigate, :command_runner, original) end)

      Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)

      Termigate.MockCommandRunner
      |> expect(:run, fn ["resize-pane", "-t", "test:0.0", "-x", "40"] -> {:ok, ""} end)

      render_click(view, "fit_pane_width", %{"target" => "test:0.0", "cols" => 40})

      verify!(Termigate.MockCommandRunner)
    end

    test "clamps cols to a sane minimum", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/sessions/test/windows/0")
      send(view.pid, {:layout_updated, @test_panes})
      render(view)

      original = Application.get_env(:termigate, :command_runner)
      Application.put_env(:termigate, :command_runner, Termigate.MockCommandRunner)
      on_exit(fn -> Application.put_env(:termigate, :command_runner, original) end)

      Mox.stub_with(Termigate.MockCommandRunner, Termigate.StubCommandRunner)

      Termigate.MockCommandRunner
      |> expect(:run, fn ["resize-pane", "-t", "test:0.0", "-x", "2"] -> {:ok, ""} end)

      render_click(view, "fit_pane_width", %{"target" => "test:0.0", "cols" => 0})

      verify!(Termigate.MockCommandRunner)
    end
  end
end
