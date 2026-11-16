/**
 * When the image of a display is drawn again.
 * - "frame": at every rendered frame.
 * - `{ hz }`: at most that many times per second.
 * - "manual": only after `invalidate()`.
 */
export type DisplayRefresh = "frame" | "manual" | { hz: number };

/** Decides, frame after frame, whether the image of a display is due. */
export class RefreshClock {
  private elapsed = 0;
  /** The first image is always due. */
  private pending = true;

  constructor(public refresh: DisplayRefresh = "frame") {}

  /** Makes the image due at the next frame, whatever the refresh. */
  invalidate(): void {
    this.pending = true;
  }

  /** Advances by one rendered frame. True when the image is to be drawn at this frame. */
  tick(deltaSeconds: number): boolean {
    const refresh = this.refresh;
    const forced = this.pending;
    this.pending = false;
    if (refresh === "frame") return true;
    if (refresh === "manual") return forced;
    const period = refresh.hz > 0 ? 1 / refresh.hz : Infinity;
    if (forced) {
      this.elapsed = 0;
      return true;
    }
    this.elapsed += Math.max(0, deltaSeconds);
    // The margin absorbs the rounding of frame times that add up to a period.
    if (this.elapsed + 1e-9 < period) return false;
    // What is left over counts toward the next image, so that the rate holds on average.
    // After a stall the count starts over: late images do not pile up.
    this.elapsed = this.elapsed < 2 * period ? Math.max(0, this.elapsed - period) : 0;
    return true;
  }
}
