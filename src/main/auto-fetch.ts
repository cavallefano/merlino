/** Fetch automatico ogni N minuti; 0 lo ferma. Lo stesso intervallo non fa ripartire il conto. */
export class AutoFetch {
  private timer: ReturnType<typeof setInterval> | null = null
  private minutes = 0

  constructor(private readonly tick: () => void) {}

  schedule(minutes: number): void {
    if (minutes === this.minutes) return
    this.stop()
    this.minutes = minutes
    if (minutes > 0) this.timer = setInterval(this.tick, minutes * 60_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.minutes = 0
  }
}
