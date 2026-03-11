defmodule TmuxRm.Tmux.Pane do
  @moduledoc "Represents a tmux pane."

  defstruct [:session_name, :window_index, :index, :width, :height, :command, :pane_id]

  @type t :: %__MODULE__{
          session_name: String.t(),
          window_index: non_neg_integer(),
          index: non_neg_integer(),
          width: non_neg_integer(),
          height: non_neg_integer(),
          command: String.t(),
          pane_id: String.t()
        }
end
