defmodule TermigateWeb.PaneController do
  use TermigateWeb, :controller

  alias Termigate.TmuxManager

  def split(conn, %{"target" => target} = params) do
    direction =
      case params["direction"] do
        "vertical" -> :vertical
        _ -> :horizontal
      end

    case TmuxManager.split_pane(target, direction) do
      {:ok, _output} ->
        conn
        |> put_status(:created)
        |> json(%{status: "created"})

      {:error, msg} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "split_failed", message: to_string(msg)})
    end
  end

  def delete(conn, %{"target" => target}) do
    case TmuxManager.kill_pane(target) do
      :ok ->
        json(conn, %{status: "ok"})

      {:error, msg} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "kill_failed", message: to_string(msg)})
    end
  end
end
