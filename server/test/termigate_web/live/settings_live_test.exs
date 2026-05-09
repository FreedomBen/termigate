defmodule TermigateWeb.SettingsLiveTest do
  use TermigateWeb.ConnCase, async: false

  import Phoenix.LiveViewTest

  setup do
    # Clear quick actions for each test, preserving auth and other config
    Termigate.Config.update(fn config -> Map.put(config, "quick_actions", []) end)

    on_exit(fn ->
      Termigate.Config.update(fn config -> Map.put(config, "quick_actions", []) end)
    end)

    :ok
  end

  describe "mount" do
    test "renders settings page", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/settings")
      assert html =~ "Settings"
      assert html =~ "Quick Actions"
    end
  end

  describe "config file section" do
    test "shows bare path when not in a container", %{conn: conn} do
      Application.put_env(:termigate, :in_container?, false)
      on_exit(fn -> Application.delete_env(:termigate, :in_container?) end)

      {:ok, _view, html} = live(conn, "/settings")
      assert html =~ "Stored at"
      refute html =~ "inside the container"
    end

    test "calls out the host mount when running in a container", %{conn: conn} do
      Application.put_env(:termigate, :in_container?, true)
      on_exit(fn -> Application.delete_env(:termigate, :in_container?) end)

      {:ok, _view, html} = live(conn, "/settings")
      assert html =~ "inside the container"
      assert html =~ "/var/lib/termigate"
      assert html =~ "~/.config/termigate"
    end
  end

  describe "mobile control bar section" do
    setup do
      on_exit(fn ->
        Termigate.Config.update(fn config ->
          put_in(config, ["terminal", "show_toolbar"], true)
        end)
      end)

      :ok
    end

    test "renders the section header, toggle, and Save button", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/settings")
      assert html =~ "Mobile Control Bar"
      assert html =~ "Show the control bar"
      assert html =~ ~s(form id="mobile-control-bar-form")
      assert html =~ ~s(<button type="submit" class="btn btn-primary btn-sm">Save</button>)
    end

    test "submitting form with show_toolbar=false persists false", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      view
      |> form("#mobile-control-bar-form", %{"show_toolbar" => "false"})
      |> render_submit()

      assert Termigate.Config.get()["terminal"]["show_toolbar"] == false
    end

    test "submitting form with show_toolbar=true flips it back to true", %{conn: conn} do
      Termigate.Config.update(fn config ->
        put_in(config, ["terminal", "show_toolbar"], false)
      end)

      {:ok, view, _html} = live(conn, "/settings")

      view
      |> form("#mobile-control-bar-form", %{"show_toolbar" => "true"})
      |> render_submit()

      assert Termigate.Config.get()["terminal"]["show_toolbar"] == true
    end
  end

  describe "notifications section" do
    setup do
      Termigate.Config.update(fn config -> Map.delete(config, "notifications") end)

      on_exit(fn ->
        Termigate.Config.update(fn config -> Map.delete(config, "notifications") end)
      end)

      :ok
    end

    test "renders notification mode selector and Save button", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/settings")
      assert html =~ "Notifications"
      assert html =~ "Detection Mode"
      assert html =~ "Disabled"
      assert html =~ "Activity-based"
      assert html =~ "Shell integration"
      assert html =~ ~s(form id="notifications-form")
      assert html =~ ~s(<button type="submit" class="btn btn-primary btn-sm">Save</button>)
    end

    test "Detection Mode option descriptions are wrapped to prevent mobile overflow",
         %{conn: conn} do
      # F1 (archived-docs/SERVER_MOBILE_DRIVE_2026-05-06_12-54-10.md): the helper
      # text under each Detection Mode radio must live inside a flex-constrained
      # wrapper (flex-1 + min-w-0) so it wraps within the radio's label rather
      # than forcing the settings page out to ~668px on a 375px mobile viewport.
      {:ok, view, _html} = live(conn, "/settings")

      for mode_label <- ["Activity-based", "Shell integration"] do
        assert has_element?(view, "label div.flex-1.min-w-0", mode_label),
               "Detection Mode option '#{mode_label}' must be wrapped in a " <>
                 "div.flex-1.min-w-0 so the helper text wraps on mobile " <>
                 "(see F1 in the 2026-05-06 mobile drive report)."
      end
    end

    test "validate updates draft state without persisting", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      html =
        render_change(view, "validate_notifications", %{
          "notifications" => %{"mode" => "activity"}
        })

      # UI reflects the draft mode...
      assert html =~ "Idle threshold"

      # ...but config is unchanged until Save is clicked.
      assert Termigate.Config.get()["notifications"]["mode"] == "disabled"
    end

    test "changing mode to activity shows idle threshold", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      html =
        render_change(view, "validate_notifications", %{
          "notifications" => %{"mode" => "activity"}
        })

      assert html =~ "Idle threshold"
      assert html =~ "Play sound"
      assert html =~ "Request permission"
    end

    test "changing mode to shell shows min duration and snippets", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      html =
        render_change(view, "validate_notifications", %{
          "notifications" => %{"mode" => "shell"}
        })

      assert html =~ "Minimum command duration"
      assert html =~ "Shell setup instructions"
    end

    test "changing mode to disabled hides options", %{conn: conn} do
      # First enable activity mode
      Termigate.Config.update(fn config ->
        Map.put(config, "notifications", %{"mode" => "activity"})
      end)

      {:ok, view, _html} = live(conn, "/settings")

      html =
        render_change(view, "validate_notifications", %{
          "notifications" => %{"mode" => "disabled"}
        })

      refute html =~ "Idle threshold"
      refute html =~ "Request permission"
    end

    test "Save persists notification settings to config", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"mode" => "activity"}
      })

      config = Termigate.Config.get()
      assert config["notifications"]["mode"] == "activity"
    end

    test "Save persists idle threshold", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"mode" => "activity", "idle_threshold" => "30"}
      })

      config = Termigate.Config.get()
      assert config["notifications"]["idle_threshold"] == 30
    end

    test "Save persists sound setting", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"mode" => "activity", "sound" => "true"}
      })

      config = Termigate.Config.get()
      assert config["notifications"]["sound"] == true
    end

    test "test_notification event does not crash", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_change(view, "validate_notifications", %{
        "notifications" => %{"mode" => "activity"}
      })

      # Should not crash
      render_click(view, "test_notification")
    end

    test "Save with invalid numeric idle_threshold falls back to default", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"idle_threshold" => "abc"}
      })

      # parse_int fails → falls back to current draft (default 10 on fresh mount)
      config = Termigate.Config.get()
      assert config["notifications"]["idle_threshold"] == 10
    end

    test "Save clamps out-of-range idle_threshold", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"idle_threshold" => "999"}
      })

      assert Termigate.Config.get()["notifications"]["idle_threshold"] == 120

      render_submit(view, "save_notifications", %{
        "notifications" => %{"idle_threshold" => "1"}
      })

      assert Termigate.Config.get()["notifications"]["idle_threshold"] == 3
    end

    test "Save clamps out-of-range min_duration", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"min_duration" => "9999"}
      })

      assert Termigate.Config.get()["notifications"]["min_duration"] == 600
    end

    test "Save with invalid mode falls back to disabled", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_submit(view, "save_notifications", %{
        "notifications" => %{"mode" => "invalid_mode"}
      })

      assert Termigate.Config.get()["notifications"]["mode"] == "disabled"
    end
  end

  describe "quick action CRUD" do
    test "add new action form", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      html = render_click(view, "new_action")
      assert html =~ "New Quick Action"
      assert html =~ "Label"
      assert html =~ "Command"
    end

    test "cancel edit", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_click(view, "new_action")
      html = render_click(view, "cancel_edit")
      refute html =~ "New Quick Action"
    end

    test "validates required fields", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_click(view, "new_action")

      html = render_click(view, "save_action", %{"action" => %{"label" => "", "command" => ""}})
      assert html =~ "required"
    end

    test "saves a new action", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/settings")

      render_click(view, "new_action")

      html =
        render_click(view, "save_action", %{
          "action" => %{"label" => "Test Action", "command" => "echo test", "color" => "green"}
        })

      # After save, the form should be gone and action should appear in list
      refute html =~ "New Quick Action"

      # Verify action was actually saved
      config = Termigate.Config.get()
      assert Enum.any?(config["quick_actions"], &(&1["label"] == "Test Action"))
    end

    test "edit existing action", %{conn: conn} do
      {:ok, _} = Termigate.Config.upsert_action(%{"label" => "Edit Me", "command" => "old"})
      config = Termigate.Config.get()
      id = hd(config["quick_actions"])["id"]

      {:ok, view, _html} = live(conn, "/settings")

      html = render_click(view, "edit_action", %{"id" => id})
      assert html =~ "Edit Quick Action"
    end

    test "delete action", %{conn: conn} do
      {:ok, _} = Termigate.Config.upsert_action(%{"label" => "ToDelete", "command" => "rm"})
      config = Termigate.Config.get()
      id = hd(config["quick_actions"])["id"]

      {:ok, view, html} = live(conn, "/settings")
      assert html =~ "ToDelete"

      render_click(view, "delete_action", %{"id" => id})

      # Verify deleted
      config = Termigate.Config.get()
      refute Enum.any?(config["quick_actions"], &(&1["label"] == "ToDelete"))
    end

    test "move actions up and down", %{conn: conn} do
      {:ok, _} = Termigate.Config.upsert_action(%{"label" => "First", "command" => "1"})
      {:ok, _} = Termigate.Config.upsert_action(%{"label" => "Second", "command" => "2"})
      config = Termigate.Config.get()
      second_id = Enum.at(config["quick_actions"], 1)["id"]

      {:ok, view, _html} = live(conn, "/settings")

      render_click(view, "move_up", %{"id" => second_id})

      config = Termigate.Config.get()
      assert hd(config["quick_actions"])["label"] == "Second"
    end
  end
end
