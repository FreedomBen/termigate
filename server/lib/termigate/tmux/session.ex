defmodule Termigate.Tmux.Session do
  @moduledoc "Represents a tmux session."

  defstruct [:name, :windows, :created, :attached?]

  @type t :: %__MODULE__{
          name: String.t(),
          windows: non_neg_integer(),
          created: DateTime.t() | nil,
          attached?: boolean()
        }
end
