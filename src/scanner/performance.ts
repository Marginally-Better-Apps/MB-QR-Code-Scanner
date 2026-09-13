/**
 * Scanner performance budgets and signposts (QLT-04).
 *
 * Agreed budgets:
 * - usable preview within 700ms after authorization (median of documented run)
 * - stable single code presented within 350ms median from first observation
 *
 * The helpers here are deliberately clock-injectable so tests and the
 * documented measurement runs use the same code path as production.
 */

/** Usable preview appears within this long after authorization (median). */
export const PREVIEW_BUDGET_MS = 700;

/** A stable single code under good light presents within this long (median). */
export const ACCEPTED_RESULT_BUDGET_MS = 350;

/**
 * Upper bound for queued-but-unprocessed metadata frames. Past this depth the
 * queue drops the stalest frame (coalesce) instead of building an unbounded
 * backlog that would lag the presented result behind the camera.
 */
export const MAX_METADATA_QUEUE_DEPTH = 2;

/** Minimum interval between delivered frames while in low-power mode. */
export const LOW_POWER_MIN_FRAME_INTERVAL_MS = 120;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export type PerformanceClock = () => number;

export const systemPerformanceClock: PerformanceClock = () => Date.now();

/**
 * Records the timestamps that define the two budgeted latencies:
 * authorization -> preview ready, and first observation -> accepted result.
 * First mark wins so later lifecycle churn cannot rewrite the startup story;
 * call reset() to begin a new documented run.
 */
export class PerformanceSignposts {
  private authorizationGrantedAtMs: number | null = null;
  private previewReadyAtMs: number | null = null;
  private firstObservationAtMs: number | null = null;
  private acceptedResultAtMs: number | null = null;

  constructor(private readonly now: PerformanceClock = systemPerformanceClock) {}

  markAuthorizationGranted(): void {
    this.authorizationGrantedAtMs ??= this.now();
  }

  markPreviewReady(): void {
    this.previewReadyAtMs ??= this.now();
  }

  markFirstObservation(): void {
    this.firstObservationAtMs ??= this.now();
  }

  markAcceptedResult(): void {
    this.acceptedResultAtMs ??= this.now();
  }

  reset(): void {
    this.authorizationGrantedAtMs = null;
    this.previewReadyAtMs = null;
    this.firstObservationAtMs = null;
    this.acceptedResultAtMs = null;
  }

  previewLatencyMs(): number | null {
    if (this.authorizationGrantedAtMs == null || this.previewReadyAtMs == null) {
      return null;
    }
    return this.previewReadyAtMs - this.authorizationGrantedAtMs;
  }

  acceptedResultLatencyMs(): number | null {
    if (this.firstObservationAtMs == null || this.acceptedResultAtMs == null) {
      return null;
    }
    return this.acceptedResultAtMs - this.firstObservationAtMs;
  }

  meetsPreviewBudget(): boolean {
    const latency = this.previewLatencyMs();
    return latency != null && latency <= PREVIEW_BUDGET_MS;
  }

  meetsAcceptedResultBudget(): boolean {
    const latency = this.acceptedResultLatencyMs();
    return latency != null && latency <= ACCEPTED_RESULT_BUDGET_MS;
  }

  snapshot(): {
    previewLatencyMs: number | null;
    acceptedResultLatencyMs: number | null;
    previewBudgetMs: number;
    acceptedResultBudgetMs: number;
    meetsPreviewBudget: boolean;
    meetsAcceptedResultBudget: boolean;
  } {
    return {
      previewLatencyMs: this.previewLatencyMs(),
      acceptedResultLatencyMs: this.acceptedResultLatencyMs(),
      previewBudgetMs: PREVIEW_BUDGET_MS,
      acceptedResultBudgetMs: ACCEPTED_RESULT_BUDGET_MS,
      meetsPreviewBudget: this.meetsPreviewBudget(),
      meetsAcceptedResultBudget: this.meetsAcceptedResultBudget(),
    };
  }
}

/**
 * Bounded FIFO for metadata frames with a drop-oldest (coalesce) policy.
 * Delivery stays synchronous on the JS thread, so under normal flow the depth
 * never exceeds 1; the bound only matters for re-entrant bursts, where stale
 * frames are discarded in favor of the freshest observation.
 */
export class BoundedMetadataQueue<T> {
  private frames: T[] = [];
  private dropped = 0;

  constructor(private readonly capacity: number = MAX_METADATA_QUEUE_DEPTH) {}

  get depth(): number {
    return this.frames.length;
  }

  get droppedTotal(): number {
    return this.dropped;
  }

  push(frame: T): void {
    if (this.frames.length >= this.capacity) {
      this.frames.shift();
      this.dropped += 1;
    }
    this.frames.push(frame);
  }

  drain(): T[] {
    const pending = this.frames;
    this.frames = [];
    return pending;
  }

  clear(): void {
    this.frames = [];
  }
}

/**
 * Bounded memo cache so high-rate re-renders re-parse only payloads that
 * changed. Evicts the oldest entry past capacity to stay memory-flat across
 * long sessions with many distinct codes.
 */
export function createBoundedParseCache<T>(
  parse: (raw: string) => T,
  maxSize = 50,
): {
  parse(raw: string): T;
  clear(): void;
  readonly size: number;
} {
  const cache = new Map<string, T>();
  return {
    parse(raw: string): T {
      const hit = cache.get(raw);
      if (hit !== undefined) {
        return hit;
      }
      const value = parse(raw);
      if (cache.size >= maxSize) {
        const oldest = cache.keys().next();
        if (!oldest.done) {
          cache.delete(oldest.value);
        }
      }
      cache.set(raw, value);
      return value;
    },
    clear(): void {
      cache.clear();
    },
    get size(): number {
      return cache.size;
    },
  };
}

export type ScannerPerformanceMode = 'full' | 'lowPower';

/**
 * Derives the engine configuration for a performance mode. Low-power mode
 * disables high-frame-rate tracking — the highest-rate work that can be
 * switched off — while leaving recognition region and symbologies untouched.
 * Never mutates the base configuration.
 */
export function resolveVisionKitPerformanceConfiguration<
  T extends { isHighFrameRateTrackingEnabled: boolean },
>(base: T, mode: ScannerPerformanceMode): T {
  if (mode === 'full') {
    return { ...base };
  }
  return { ...base, isHighFrameRateTrackingEnabled: false };
}

/**
 * Low-power frame gate: deliver the first frame, then at most one per
 * minIntervalMs. Empty (loss) frames are the caller's responsibility —
 * session.ts only throttles frames that carry observations so disappearance
 * still propagates promptly.
 */
export function shouldDeliverThrottledFrame(
  lastDeliveredAtMs: number | null,
  nowMs: number,
  minIntervalMs: number = LOW_POWER_MIN_FRAME_INTERVAL_MS,
): boolean {
  if (lastDeliveredAtMs == null) {
    return true;
  }
  return nowMs - lastDeliveredAtMs >= minIntervalMs;
}
