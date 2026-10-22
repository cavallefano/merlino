import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoFetch } from '../../src/main/auto-fetch'

describe('AutoFetch', () => {
  afterEach(() => vi.useRealTimers())

  it('ogni N minuti; lo stesso intervallo non fa ripartire il timer; 0 lo ferma', () => {
    vi.useFakeTimers()
    const tick = vi.fn()
    const auto = new AutoFetch(tick)
    auto.schedule(10)
    vi.advanceTimersByTime(9 * 60_000)
    expect(tick).toHaveBeenCalledTimes(0)
    auto.schedule(10)
    vi.advanceTimersByTime(60_000)
    expect(tick).toHaveBeenCalledTimes(1)
    auto.schedule(2)
    vi.advanceTimersByTime(4 * 60_000)
    expect(tick).toHaveBeenCalledTimes(3)
    auto.schedule(0)
    vi.advanceTimersByTime(60 * 60_000)
    expect(tick).toHaveBeenCalledTimes(3)
  })
})
