defmodule TmuxRmWeb.RateLimitStore do
  @moduledoc "Stub GenServer for rate limiting. Implemented in a later phase."
  use GenServer

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok), do: {:ok, %{}}
end
