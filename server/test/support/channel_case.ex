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

  setup _tags do
    # Ensure auth is enabled for channel tests (ConnCase also sets this for LiveView tests)
    Application.put_env(:termigate, :auth_token, "test-token")

    # Sign a channel token for socket connection
    channel_token = Phoenix.Token.sign(TermigateWeb.Endpoint, "channel", %{})
    {:ok, channel_token: channel_token}
  end
end
