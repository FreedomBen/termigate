defmodule Termigate.RingBufferTest do
  use ExUnit.Case, async: true

  alias Termigate.RingBuffer

  describe "new/1" do
    test "creates empty buffer with default capacity" do
      buf = RingBuffer.new()
      assert RingBuffer.size(buf) == 0
      assert RingBuffer.read(buf) == <<>>
    end

    test "creates buffer with specified capacity" do
      buf = RingBuffer.new(1_000_000)
      assert buf.capacity == 1_000_000
    end

    test "clamps capacity to min size" do
      buf = RingBuffer.new(100)
      min = Application.get_env(:termigate, :ring_buffer_min_size, 524_288)
      assert buf.capacity == min
    end

    test "clamps capacity to max size" do
      buf = RingBuffer.new(100_000_000)
      max = Application.get_env(:termigate, :ring_buffer_max_size, 8_388_608)
      assert buf.capacity == max
    end
  end

  describe "append/2 and read/1" do
    test "round-trip simple data" do
      buf =
        RingBuffer.new(524_288)
        |> RingBuffer.append("hello ")
        |> RingBuffer.append("world")

      assert RingBuffer.read(buf) == "hello world"
      assert RingBuffer.size(buf) == 11
    end

    test "appending empty binary is a no-op" do
      buf = RingBuffer.new(524_288) |> RingBuffer.append("data")
      buf2 = RingBuffer.append(buf, <<>>)
      assert RingBuffer.read(buf2) == "data"
      assert RingBuffer.size(buf2) == 4
    end

    test "single byte" do
      buf = RingBuffer.new(524_288) |> RingBuffer.append(<<42>>)
      assert RingBuffer.read(buf) == <<42>>
      assert RingBuffer.size(buf) == 1
    end
  end

  describe "overflow behavior" do
    test "drops oldest data when exceeding capacity" do
      # Use minimum allowed capacity
      min = Application.get_env(:termigate, :ring_buffer_min_size, 524_288)
      buf = RingBuffer.new(min)

      # Fill with data exceeding capacity
      chunk = :binary.copy("A", div(min, 2))
      buf = RingBuffer.append(buf, chunk)
      buf = RingBuffer.append(buf, chunk)
      assert RingBuffer.size(buf) == min

      # Adding more should drop from the front
      extra = "BBBBBBBB"
      buf = RingBuffer.append(buf, extra)
      assert RingBuffer.size(buf) == min

      result = RingBuffer.read(buf)
      assert byte_size(result) == min
      # The tail should contain our extra data
      assert String.ends_with?(result, extra)
    end

    test "handles single append larger than capacity" do
      min = Application.get_env(:termigate, :ring_buffer_min_size, 524_288)
      buf = RingBuffer.new(min)

      # Append data larger than capacity
      big = :binary.copy("X", min + 1000)
      buf = RingBuffer.append(buf, big)

      assert RingBuffer.size(buf) == min
      result = RingBuffer.read(buf)
      assert byte_size(result) == min
      # Should keep the tail of the data
      assert result == binary_part(big, 1000, min)
    end

    test "exactly fills capacity" do
      min = Application.get_env(:termigate, :ring_buffer_min_size, 524_288)
      buf = RingBuffer.new(min)
      data = :binary.copy("Z", min)
      buf = RingBuffer.append(buf, data)

      assert RingBuffer.size(buf) == min
      assert RingBuffer.read(buf) == data
    end
  end

  describe "clear/1" do
    test "clears buffer contents" do
      buf =
        RingBuffer.new(524_288)
        |> RingBuffer.append("some data")
        |> RingBuffer.clear()

      assert RingBuffer.size(buf) == 0
      assert RingBuffer.read(buf) == <<>>
    end
  end

  describe "size/1" do
    test "tracks size accurately across appends" do
      buf = RingBuffer.new(524_288)
      assert RingBuffer.size(buf) == 0

      buf = RingBuffer.append(buf, "hello")
      assert RingBuffer.size(buf) == 5

      buf = RingBuffer.append(buf, " world")
      assert RingBuffer.size(buf) == 11
    end
  end
end
