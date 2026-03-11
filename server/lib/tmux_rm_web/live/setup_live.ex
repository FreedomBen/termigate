defmodule TmuxRmWeb.SetupLive do
  use TmuxRmWeb, :live_view

  alias TmuxRm.Auth

  @impl true
  def mount(_params, _session, socket) do
    # If auth is already configured, redirect to login
    if Auth.auth_enabled?() do
      {:ok, push_navigate(socket, to: "/login")}
    else
      socket =
        socket
        |> assign(:username, "")
        |> assign(:password, "")
        |> assign(:password_confirm, "")
        |> assign(:error, nil)
        |> assign(:page_title, "Setup")

      {:ok, socket}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="card bg-base-200 shadow-lg w-full max-w-sm">
        <div class="card-body">
          <h2 class="card-title text-center mb-2">Welcome to tmux-rm</h2>
          <p class="text-sm text-base-content/60 text-center mb-4">
            Create an account to secure your terminal access.
          </p>

          <form phx-submit="setup" class="space-y-4">
            <div>
              <label class="label" for="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                value={@username}
                class="input input-bordered w-full"
                autocomplete="username"
                autofocus
              />
            </div>
            <div>
              <label class="label" for="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                class="input input-bordered w-full"
                autocomplete="new-password"
              />
            </div>
            <div>
              <label class="label" for="password_confirm">Confirm Password</label>
              <input
                type="password"
                id="password_confirm"
                name="password_confirm"
                class="input input-bordered w-full"
                autocomplete="new-password"
              />
            </div>
            <p :if={@error} class="text-error text-sm">{@error}</p>
            <button type="submit" class="btn btn-primary w-full">Create Account</button>
          </form>
        </div>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("setup", params, socket) do
    username = String.trim(params["username"] || "")
    password = params["password"] || ""
    password_confirm = params["password_confirm"] || ""

    cond do
      username == "" ->
        {:noreply, assign(socket, :error, "Username is required.")}

      String.length(username) < 2 ->
        {:noreply, assign(socket, :error, "Username must be at least 2 characters.")}

      String.length(password) < 8 ->
        {:noreply, assign(socket, :error, "Password must be at least 8 characters.")}

      password != password_confirm ->
        {:noreply, assign(socket, :error, "Passwords do not match.")}

      Auth.auth_enabled?() ->
        # Race condition: someone else set it up
        {:noreply, push_navigate(socket, to: "/login")}

      true ->
        case Auth.write_credentials(username, password) do
          :ok ->
            {:noreply,
             socket
             |> put_flash(:info, "Account created. Please log in.")
             |> redirect(to: "/login")}

          {:error, reason} ->
            {:noreply, assign(socket, :error, "Failed to create account: #{inspect(reason)}")}
        end
    end
  end
end
