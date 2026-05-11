defmodule TermigateWeb.AuthLiveTest do
  use TermigateWeb.ConnCase, async: false

  import Phoenix.LiveViewTest

  describe "login page" do
    test "renders login form when not authenticated", %{conn: _conn} do
      # Build a conn with auth enabled but no authenticated session
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Test.init_test_session(%{})

      {:ok, _view, html} = live(conn, "/login")
      assert html =~ "termigate"
      assert html =~ "Username"
      assert html =~ "Password"
    end

    test "redirects to home when already authenticated", %{conn: conn} do
      assert {:error, {:live_redirect, %{to: "/"}}} = live(conn, "/login")
    end

    @tag :skip_auth
    test "redirects to setup when auth not configured", %{conn: conn} do
      Application.delete_env(:termigate, :auth_token)
      assert {:error, {:live_redirect, %{to: "/setup"}}} = live(conn, "/login")
    end

    test "renders a password-visibility toggle wired to the password input (F7)", %{conn: _conn} do
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Test.init_test_session(%{})

      {:ok, _view, html} = live(conn, "/login")

      # PasswordToggleHook button referencing the password input by id, with
      # the accessible default state (`Show password`).
      assert html =~ ~s(phx-hook="PasswordToggle")
      assert html =~ ~s(data-target="password")
      assert html =~ ~s(aria-label="Show password")
    end

    test "password toggle button meets 44 px touch-target minimum (F3)", %{conn: _conn} do
      # WCAG 2.5.5 / Material / Apple HIG: tap targets >= 44 CSS px.
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Test.init_test_session(%{})

      {:ok, view, _html} = live(conn, "/login")

      button_html = view |> element("#password-toggle") |> render()

      assert button_html =~ ~r/class="[^"]*\bw-11\b/,
             "expected #password-toggle to have w-11 (44 px) — got: #{button_html}"

      assert button_html =~ ~r/class="[^"]*\bh-11\b/,
             "expected #password-toggle to have h-11 (44 px) — got: #{button_html}"
    end

    test "error-flash close button meets 44 px touch-target minimum (F4)" do
      # The error flash rendered after a wrong-password submit must have a
      # dismiss button large enough to tap without fat-fingering the form
      # below it (WCAG 2.5.5 — 44×44 CSS px minimum). The flash lives in
      # the shared CoreComponents.flash/1 component, so test it directly.
      html =
        render_component(&TermigateWeb.CoreComponents.flash/1,
          kind: :error,
          flash: %{"error" => "Invalid username or password."}
        )

      # The close button has aria-label="close". Match the class attribute
      # appearing before aria-label in the HEEX-rendered output.
      assert html =~ ~r/<button[^>]*class="[^"]*\bw-11\b[^"]*"[^>]*aria-label="close"/,
             "expected flash close button to have w-11 (44 px) — got: #{html}"

      assert html =~ ~r/<button[^>]*class="[^"]*\bh-11\b[^"]*"[^>]*aria-label="close"/,
             "expected flash close button to have h-11 (44 px) — got: #{html}"
    end
  end
end
