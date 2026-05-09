defmodule TermigateWeb.TerminalChannelTest do
  use TermigateWeb.ChannelCase, async: false

  describe "join" do
    test "returns error when pane not found", %{cookie_session: session} do
      {:ok, socket} = connect_user_socket(session)
      assert {:error, %{reason: _}} = subscribe_and_join(socket, "terminal:nonexistent:0:0")
    end

    test "parses topic into correct target format", %{cookie_session: session} do
      {:ok, socket} = connect_user_socket(session)
      # Will fail because no tmux, but should not crash
      result = subscribe_and_join(socket, "terminal:my-session:1:2")
      assert {:error, %{reason: _}} = result
    end

    test "scope token in join params rejects joins to a different session",
         %{cookie_session: session} do
      scope =
        Phoenix.Token.sign(TermigateWeb.Endpoint, "channel_scope", %{session: "alpha"})

      {:ok, socket} = connect_user_socket(session)

      assert {:error, %{reason: "forbidden"}} =
               subscribe_and_join(socket, "terminal:beta:0:0", %{"scope" => scope})
    end

    test "scope token in join params allows joins inside its session",
         %{cookie_session: session} do
      # The join still fails on PaneStream.subscribe (no tmux in tests),
      # but the failure must not be the authz "forbidden" — proving the
      # session-prefix check passed.
      scope =
        Phoenix.Token.sign(TermigateWeb.Endpoint, "channel_scope", %{session: "alpha"})

      {:ok, socket} = connect_user_socket(session)

      assert {:error, %{reason: reason}} =
               subscribe_and_join(socket, "terminal:alpha:0:0", %{"scope" => scope})

      refute reason == "forbidden"
    end

    test "invalid scope token is rejected with invalid_scope",
         %{cookie_session: session} do
      {:ok, socket} = connect_user_socket(session)

      assert {:error, %{reason: "invalid_scope"}} =
               subscribe_and_join(socket, "terminal:alpha:0:0", %{"scope" => "garbage"})
    end

    test "missing scope token leaves the channel unscoped (full access)",
         %{cookie_session: session} do
      # Without a scope token, the channel is not session-pinned. The join
      # still fails on PaneStream.subscribe (no tmux), but not on authz.
      {:ok, socket} = connect_user_socket(session)

      assert {:error, %{reason: reason}} = subscribe_and_join(socket, "terminal:alpha:0:0")
      refute reason == "forbidden"
      refute reason == "invalid_scope"
    end
  end

  describe "handle_in (direct module calls)" do
    test "resize with invalid bounds is a no-op" do
      socket = %Phoenix.Socket{assigns: %{target: "test:0.0"}}

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_in(
                 "resize",
                 %{"cols" => 0, "rows" => 0},
                 socket
               )
    end

    test "resize with out-of-range cols is a no-op" do
      socket = %Phoenix.Socket{assigns: %{target: "test:0.0"}}

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_in(
                 "resize",
                 %{"cols" => 501, "rows" => 40},
                 socket
               )
    end

    test "input exceeding max size is ignored" do
      large_input = String.duplicate("x", 131_073)
      socket = %Phoenix.Socket{assigns: %{target: "test:0.0"}}

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_in(
                 "input",
                 %{"data" => large_input},
                 socket
               )
    end

    test "binary input exceeding max size is ignored" do
      large_input = :binary.copy(<<0>>, 131_073)
      socket = %Phoenix.Socket{assigns: %{target: "test:0.0"}}

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_in(
                 "input",
                 {:binary, large_input},
                 socket
               )
    end

    test "unknown events are handled gracefully" do
      socket = %Phoenix.Socket{assigns: %{target: "test:0.0"}}

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_in("unknown_event", %{}, socket)
    end
  end

  describe "handle_info (direct module calls)" do
    # Build a socket whose `push/3` calls deliver to the test process so
    # `assert_push` can match on event + payload without a full join.
    defp pushable_socket(assigns \\ %{target: "test:0.0"}) do
      %Phoenix.Socket{
        topic: "terminal:test",
        endpoint: TermigateWeb.Endpoint,
        transport_pid: self(),
        serializer: Phoenix.ChannelTest.NoopSerializer,
        pubsub_server: Termigate.PubSub,
        join_ref: "1",
        ref: "1",
        joined: true,
        assigns: assigns
      }
    end

    test "unknown messages are handled gracefully" do
      socket = %Phoenix.Socket{assigns: %{target: "test:0.0"}}

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(:some_random_message, socket)
    end

    test "DOWN with non-matching ref is ignored" do
      ref = make_ref()
      other_ref = make_ref()

      socket = %Phoenix.Socket{
        assigns: %{target: "test:0.0", pane_stream_pid: self(), pane_stream_ref: ref}
      }

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:DOWN, other_ref, :process, self(), :normal},
                 socket
               )
    end

    test "pane_output pushes base64-encoded data" do
      socket = pushable_socket()

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:pane_output, "test:0.0", "hello"},
                 socket
               )

      assert_push "output", %{data: data}
      assert Base.decode64!(data) == "hello"
    end

    test "pane_dead pushes empty payload and flips :pane_dead assign" do
      socket = pushable_socket()

      assert {:noreply, new_socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:pane_dead, "test:0.0"},
                 socket
               )

      assert new_socket.assigns.pane_dead == true
      assert_push "pane_dead", %{}
    end

    test "pane_reconnected pushes reconnected with base64 history" do
      socket = pushable_socket()

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:pane_reconnected, "test:0.0", "scrollback"},
                 socket
               )

      assert_push "reconnected", %{data: data}
      assert Base.decode64!(data) == "scrollback"
    end

    test "pane_resized pushes resized with cols/rows" do
      socket = pushable_socket()

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:pane_resized, 80, 24},
                 socket
               )

      assert_push "resized", %{cols: 80, rows: 24}
    end

    test "pane_superseded pushes superseded with new_target" do
      socket = pushable_socket()

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:pane_superseded, "old:0.0", "new:0.0"},
                 socket
               )

      assert_push "superseded", %{new_target: "new:0.0"}
    end

    test "DOWN with matching ref short-circuits when pane_dead is already set" do
      ref = make_ref()

      socket =
        pushable_socket(%{
          target: "test:0.0",
          pane_stream_pid: self(),
          pane_stream_ref: ref,
          pane_dead: true
        })

      assert {:noreply, ^socket} =
               TermigateWeb.TerminalChannel.handle_info(
                 {:DOWN, ref, :process, self(), :killed},
                 socket
               )

      # No re-subscribe attempted, no push emitted
      refute_received %Phoenix.Socket.Message{}
    end
  end
end
