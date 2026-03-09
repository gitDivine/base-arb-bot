// rate-limiter.ts — KEPT (unchanged from Solana version)
export class RateLimiter {
  private queue:    number[] = [];
  private maxCalls: number;
  private windowMs: number;

  constructor(maxCallsPerWindow = 30, windowMs = 1000) {
    this.maxCalls = maxCallsPerWindow;
    this.windowMs = windowMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    this.queue = this.queue.filter(t => now - t < this.windowMs);
    if (this.queue.length >= this.maxCalls) {
      const wait = this.windowMs - (now - this.queue[0]);
      await new Promise(r => setTimeout(r, wait));
    }
    this.queue.push(Date.now());
  }
}
