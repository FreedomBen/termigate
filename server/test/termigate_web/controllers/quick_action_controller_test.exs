defmodule TermigateWeb.QuickActionControllerTest do
  use TermigateWeb.ConnCase, async: false

  describe "GET /api/quick-actions" do
    test "returns quick actions list", %{conn: conn} do
      conn = get(conn, "/api/quick-actions")
      assert %{"quick_actions" => actions} = json_response(conn, 200)
      assert is_list(actions)
    end
  end

  describe "POST /api/quick-actions" do
    test "creates a quick action", %{conn: conn} do
      conn = post(conn, "/api/quick-actions", %{label: "Test", command: "echo test"})
      assert %{"quick_actions" => actions} = json_response(conn, 201)
      assert Enum.any?(actions, &(&1["label"] == "Test"))
    end
  end

  describe "PUT /api/quick-actions/:id" do
    test "updates a quick action", %{conn: conn} do
      # Create first
      {:ok, config} = Termigate.Config.upsert_action(%{"label" => "Old", "command" => "old"})
      id = hd(config["quick_actions"])["id"]

      conn = put(conn, "/api/quick-actions/#{id}", %{label: "Updated", command: "new"})
      assert %{"quick_actions" => actions} = json_response(conn, 200)
      action = Enum.find(actions, &(&1["id"] == id))
      assert action["label"] == "Updated"
    end
  end

  describe "DELETE /api/quick-actions/:id" do
    test "deletes a quick action", %{conn: conn} do
      {:ok, config} = Termigate.Config.upsert_action(%{"label" => "Del", "command" => "del"})
      id = hd(config["quick_actions"])["id"]

      conn = delete(conn, "/api/quick-actions/#{id}")
      assert %{"status" => "ok"} = json_response(conn, 200)
    end
  end

  describe "PUT /api/quick-actions/order" do
    test "reorders quick actions", %{conn: conn} do
      {:ok, _} = Termigate.Config.upsert_action(%{"label" => "First", "command" => "1"})
      {:ok, config} = Termigate.Config.upsert_action(%{"label" => "Second", "command" => "2"})
      ids = Enum.map(config["quick_actions"], & &1["id"]) |> Enum.reverse()

      conn = put(conn, "/api/quick-actions/order", %{ids: ids})
      assert %{"quick_actions" => actions} = json_response(conn, 200)
      labels = Enum.map(actions, & &1["label"])
      assert hd(labels) == "Second"
    end

    test "returns error without ids", %{conn: conn} do
      conn = put(conn, "/api/quick-actions/order", %{})
      assert %{"error" => "validation_failed"} = json_response(conn, 400)
    end
  end

  describe "GET /api/config" do
    test "returns full config", %{conn: conn} do
      conn = get(conn, "/api/config")
      assert %{"quick_actions" => _} = json_response(conn, 200)
    end
  end
end
