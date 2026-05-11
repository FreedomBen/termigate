defmodule TermigateWeb.SetupLiveTest do
  use TermigateWeb.ConnCase, async: false

  import Phoenix.LiveViewTest

  @moduletag :skip_auth

  setup do
    Application.delete_env(:termigate, :auth_token)
    Termigate.Setup.replace("good-token")

    config_path = Application.get_env(:termigate, :config_path)
    File.rm(config_path)

    on_exit(fn ->
      Termigate.Setup.replace(nil)

      # The "creates admin" test writes credentials via
      # Termigate.Auth.write_credentials/3, which routes through the Config
      # GenServer and leaves the auth section in its in-memory state. If we
      # only File.rm/1 the disk file, the next test that calls Config.update
      # (quick actions, settings, multi-pane, etc.) will write the whole
      # cached state — auth section included — back to disk, leaving
      # auth_enabled?/0 returning true for the rest of the run. Clear the
      # in-memory auth before the rm so the GenServer holds a clean state.
      if GenServer.whereis(Termigate.Config) do
        Termigate.Config.update(fn config -> Map.delete(config, "auth") end)
      end

      File.rm(config_path)
      Application.put_env(:termigate, :auth_token, "test-token")
    end)

    conn =
      Phoenix.ConnTest.build_conn()
      |> Plug.Test.init_test_session(%{})

    {:ok, conn: conn}
  end

  describe "mount" do
    test "renders setup form with valid token", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/setup?token=good-token")
      assert html =~ "Username"
      assert html =~ "Confirm Password"
    end

    test "renders landing page when token is missing", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/setup")
      assert html =~ "First-run setup required"
      assert html =~ "podman logs"
      refute html =~ "Confirm Password"
    end

    test "renders landing page when token is wrong", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/setup?token=wrong")
      assert html =~ "First-run setup required"
      refute html =~ "Confirm Password"
    end

    test "redirects to /login when admin already configured", %{conn: conn} do
      Application.put_env(:termigate, :auth_token, "test-token")

      assert {:error, {:live_redirect, %{to: "/login"}}} =
               live(conn, "/setup?token=good-token")
    end

    test "renders a password-visibility toggle for each password input (F7)", %{conn: conn} do
      {:ok, _view, html} = live(conn, "/setup?token=good-token")

      # Both the Password and Confirm Password inputs need their own
      # PasswordToggleHook button targeting the right input id.
      assert html =~ ~s(phx-hook="PasswordToggle")
      assert html =~ ~s(data-target="password")
      assert html =~ ~s(data-target="password_confirm")
    end

    test "password toggle buttons meet 44 px touch-target minimum (F1)", %{conn: conn} do
      # WCAG 2.5.5 / Material / Apple HIG: tap targets >= 44 CSS px.
      # Tailwind `w-11 h-11` = 44 px.
      {:ok, view, _html} = live(conn, "/setup?token=good-token")

      for id <- ["password-toggle", "password-confirm-toggle"] do
        button_html = view |> element("##{id}") |> render()

        assert button_html =~ ~r/class="[^"]*\bw-11\b/,
               "expected #{id} button to have w-11 (44 px) — got: #{button_html}"

        assert button_html =~ ~r/class="[^"]*\bh-11\b/,
               "expected #{id} button to have h-11 (44 px) — got: #{button_html}"
      end
    end

    test "session-duration select is at least 44 px tall (F2)", %{conn: conn} do
      # WCAG 2.5.5 touch-target minimum on a primary form control.
      {:ok, view, _html} = live(conn, "/setup?token=good-token")

      select_html = view |> element("#session_ttl_hours") |> render()

      assert select_html =~ ~r/class="[^"]*\bmin-h-11\b/,
             "expected select to have min-h-11 (44 px) — got: #{select_html}"
    end
  end

  describe "form submission" do
    test "rejects when assigned token has been consumed mid-session", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/setup?token=good-token")

      # Burn the token out from under the live session (e.g., another tab won
      # the race) — the next form submit must be rejected.
      Termigate.Setup.consume()

      assert {:error, {:live_redirect, %{to: "/login"}}} =
               view
               |> form("form", %{
                 "username" => "admin",
                 "password" => "password123",
                 "password_confirm" => "password123",
                 "session_ttl_hours" => "168"
               })
               |> render_submit()
    end

    test "creates admin and consumes token on success", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/setup?token=good-token")

      # Submitting the form should create the admin, consume the token, and
      # redirect to /post-setup with a one-time login token.
      assert {:error, {:redirect, %{to: "/post-setup?token=" <> _}}} =
               view
               |> form("form", %{
                 "username" => "admin",
                 "password" => "password123",
                 "password_confirm" => "password123",
                 "session_ttl_hours" => "168"
               })
               |> render_submit()

      refute Termigate.Setup.required?()
      refute Termigate.Setup.valid_token?("good-token")
    end
  end
end
