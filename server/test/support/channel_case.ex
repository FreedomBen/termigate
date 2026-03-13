defmodule TermigateWeb.ChannelCase do
  @moduledoc """
  This module defines the test case to be used by channel tests.
  """
  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import TermigateWeb.ChannelCase

      @endpoint TermigateWeb.Endpoint
    end
  end
end
