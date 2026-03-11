defmodule TmuxRm.SessionPoller do
  @moduledoc "Stub GenServer for session polling. Implemented in Phase 2."
  use GenServer

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @impl true
  def init(:ok), do: {:ok, %{}}
end
