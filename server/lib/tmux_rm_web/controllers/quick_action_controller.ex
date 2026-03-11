defmodule TmuxRmWeb.QuickActionController do
  use TmuxRmWeb, :controller

  alias TmuxRm.Config

  def index(conn, _params) do
    config = Config.get()
    json(conn, %{quick_actions: config["quick_actions"] || []})
  end

  def create(conn, params) do
    action = build_action(params)

    case Config.upsert_action(action) do
      {:ok, config} ->
        conn
        |> put_status(:created)
        |> json(%{quick_actions: config["quick_actions"] || []})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "creation_failed", message: inspect(reason)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    action = params |> build_action() |> Map.put("id", id)

    case Config.upsert_action(action) do
      {:ok, config} ->
        json(conn, %{quick_actions: config["quick_actions"] || []})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "update_failed", message: inspect(reason)})
    end
  end

  def delete(conn, %{"id" => id}) do
    case Config.delete_action(id) do
      {:ok, _config} ->
        json(conn, %{status: "ok"})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "delete_failed", message: inspect(reason)})
    end
  end

  def reorder(conn, %{"ids" => ids}) when is_list(ids) do
    case Config.reorder_actions(ids) do
      {:ok, config} ->
        json(conn, %{quick_actions: config["quick_actions"] || []})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "reorder_failed", message: inspect(reason)})
    end
  end

  def reorder(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "validation_failed", message: "Missing required field: ids (array)"})
  end

  defp build_action(params) do
    %{
      "label" => params["label"] || "",
      "command" => params["command"] || "",
      "confirm" => params["confirm"] in [true, "true"],
      "color" => params["color"] || "default",
      "icon" => params["icon"]
    }
  end
end
