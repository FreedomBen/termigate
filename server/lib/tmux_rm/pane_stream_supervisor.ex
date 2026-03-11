defmodule TmuxRm.PaneStreamSupervisor do
  @moduledoc """
  Convenience module for the PaneStream DynamicSupervisor.

  The actual DynamicSupervisor is started in application.ex with the name
  TmuxRm.PaneStreamSupervisor. This module provides helper functions.
  """

  @doc "Start a PaneStream child for the given target."
  def start_child(target) do
    DynamicSupervisor.start_child(TmuxRm.PaneStreamSupervisor, {TmuxRm.PaneStream, target})
  end

  @doc "Count active PaneStream children."
  def count_children do
    DynamicSupervisor.count_children(TmuxRm.PaneStreamSupervisor)
  end
end
