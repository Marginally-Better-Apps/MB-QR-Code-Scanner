import {
  ACCEPTED_RESULT_BUDGET_MS,
  BoundedMetadataQueue,
  LOW_POWER_MIN_FRAME_INTERVAL_MS,
  MAX_METADATA_QUEUE_DEPTH,
  median,
  PerformanceSignposts,
  PREVIEW_BUDGET_MS,
  createBoundedParseCache,
  resolveVisionKitPerformanceConfiguration,
  shouldDeliverThrottledFrame,
} from './performance';
import {
  SCAN_STABLE_MS,
  createInitialScanAcceptanceState,
  updateScanAcceptance,
} from './acceptance';
import { CameraAccessFixtureProvider } from './cameraFixtures';
import { ScannerObservationFixtureSource } from './fixtures';
import { ScannerSessionStore } from './session';
import type {
  ScannerLifecyclePhase,
  ScannerObservation,
  ScannerObservationSource,
} from './types';

const BASE_MS = 1_728_000_000_000;

function detection(rawPayload: string) {
  return {
    rawPayload,
    displayBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  };
}

class CountingSource implements ScannerObservationSource {
  readonly engineID = 'counting.perf';
  hasPreview = true;
  startCount = 0;
  stopCount = 0;
  private receiveFrame: ((frame: ScannerObservation[]) => void) | null = null;

  start(receiveFrame: (frame: ScannerObservation[]) => void): void {
    this.startCount += 1;
    this.receiveFrame = receiveFrame;
  }

  stop(): void {
    this.stopCount += 1;
    this.receiveFrame = null;
  }

  handleLifecycle(_phase: ScannerLifecyclePhase): void {}

  emit(detections: { rawPayload: string; displayBounds: { x: number; y: number; width: number; height: number } }[]): void {
    const timestamp = new Date();
    this.receiveFrame?.(
      detections.map((item) => ({
        rawPayload: item.rawPayload,
        displayBounds: item.displayBounds,
        timestamp,
        engineID: this.engineID,
      })),
    );
  }
}

describe('performance budgets (QLT-04)', () => {
  test('budget constants match the agreed scanner budgets', () => {
    expect(PREVIEW_BUDGET_MS).toBe(700);
    expect(ACCEPTED_RESULT_BUDGET_MS).toBe(350);
  });

  test('stabilization window fits inside the accepted-result budget', () => {
    // If the acceptance gate ever needs longer than the result budget,
    // the 350ms median can never hold. This signpost catches that regression.
    expect(SCAN_STABLE_MS).toBeLessThanOrEqual(ACCEPTED_RESULT_BUDGET_MS);
  });

  test('median summarizes documented test runs', () => {
    expect(median([])).toBeNull();
    expect(median([500])).toBe(500);
    expect(median([500, 900, 700])).toBe(700);
    expect(median([100, 300])).toBe(200);
  });

  test('preview signpost measures authorization-to-preview latency against 700ms', () => {
    let nowMs = BASE_MS;
    const signposts = new PerformanceSignposts(() => nowMs);
    expect(signposts.previewLatencyMs()).toBeNull();

    signposts.markAuthorizationGranted();
    nowMs += 500;
    signposts.markPreviewReady();

    expect(signposts.previewLatencyMs()).toBe(500);
    expect(signposts.meetsPreviewBudget()).toBe(true);
  });

  test('preview signpost reports a budget miss above 700ms', () => {
    let nowMs = BASE_MS;
    const signposts = new PerformanceSignposts(() => nowMs);
    signposts.markAuthorizationGranted();
    nowMs += 900;
    signposts.markPreviewReady();

    expect(signposts.previewLatencyMs()).toBe(900);
    expect(signposts.meetsPreviewBudget()).toBe(false);
  });

  test('accepted-result signpost measures first-observation-to-acceptance against 350ms', () => {
    let nowMs = BASE_MS;
    const signposts = new PerformanceSignposts(() => nowMs);
    signposts.markFirstObservation();
    nowMs += 200;
    signposts.markAcceptedResult();

    expect(signposts.acceptedResultLatencyMs()).toBe(200);
    expect(signposts.meetsAcceptedResultBudget()).toBe(true);
  });

  test('stable single code accepts well inside 350ms from first observation', () => {
    // Two consecutive frames 50ms apart accept immediately.
    let state = createInitialScanAcceptanceState();
    const first = updateScanAcceptance(state, ['https://example.com/stable'], new Date(BASE_MS));
    expect(first.accepted).toEqual([]);
    state = first.state;

    const second = updateScanAcceptance(
      state,
      ['https://example.com/stable'],
      new Date(BASE_MS + 50),
    );
    expect(second.accepted).toHaveLength(1);
    const latencyMs =
      second.accepted[0].acceptedAt.getTime() -
      (first.state.tracks['https://example.com/stable']?.firstSeenAtMs ?? BASE_MS);
    expect(latencyMs).toBeLessThanOrEqual(ACCEPTED_RESULT_BUDGET_MS);
  });

  test('session records startup and acceptance signposts within budget', async () => {
    let nowMs = BASE_MS;
    const source = new ScannerObservationFixtureSource({ engineID: 'fixture.perf' });
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
      performanceNow: () => nowMs,
    });

    await session.activateScanner();
    nowMs += 500;
    session.setHasPreview(true);
    source.emit([detection('https://example.com/perf')]);
    nowMs += 50;
    source.emit([detection('https://example.com/perf')]);

    const metrics = session.performanceMetrics();
    expect(metrics.previewLatencyMs).toBe(500);
    expect(metrics.meetsPreviewBudget).toBe(true);
    expect(metrics.acceptedResultLatencyMs).toBe(50);
    expect(metrics.meetsAcceptedResultBudget).toBe(true);
  });
});

describe('bounded metadata queue (QLT-04)', () => {
  test('burst backlog drops oldest frames and stays within capacity', () => {
    const queue = new BoundedMetadataQueue<string>(MAX_METADATA_QUEUE_DEPTH);
    for (let index = 0; index < 5; index += 1) {
      queue.push(`frame-${index}`);
    }

    expect(queue.depth).toBeLessThanOrEqual(MAX_METADATA_QUEUE_DEPTH);
    expect(queue.droppedTotal).toBe(5 - MAX_METADATA_QUEUE_DEPTH);
    // Coalescing keeps the freshest frames so the presented result never lags.
    expect(queue.drain()).toEqual(
      Array.from(
        { length: MAX_METADATA_QUEUE_DEPTH },
        (_, offset) => `frame-${5 - MAX_METADATA_QUEUE_DEPTH + offset}`,
      ),
    );
    expect(queue.depth).toBe(0);
  });

  test('session coalesces re-entrant metadata bursts instead of growing a backlog', async () => {
    const source = new ScannerObservationFixtureSource({ engineID: 'fixture.burst' });
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });
    await session.activateScanner();

    let burstFired = false;
    const unsubscribe = session.subscribe(() => {
      if (!burstFired) {
        burstFired = true;
        // A synchronous 5-frame burst inside one delivery: the queue must
        // coalesce instead of growing without bound.
        for (let index = 1; index <= 5; index += 1) {
          source.emit([detection(`payload-${index}`)]);
        }
      }
    });
    try {
      source.emit([detection('payload-0')]);
    } finally {
      unsubscribe();
    }

    const metrics = session.performanceMetrics();
    expect(session.visibleObservations.map((item) => item.rawPayload)).toEqual([
      'payload-5',
    ]);
    expect(metrics.backlogDepth).toBe(0);
    expect(metrics.droppedFrames).toBeGreaterThan(0);
    expect(metrics.backlogDepth).toBeLessThanOrEqual(MAX_METADATA_QUEUE_DEPTH);
  });
});

describe('parsing off the render path (QLT-04)', () => {
  test('bounded parse cache parses each unique payload once across high-rate frames', () => {
    let underlyingCalls = 0;
    const cache = createBoundedParseCache((raw: string) => {
      underlyingCalls += 1;
      return raw.toUpperCase();
    }, 50);

    for (let index = 0; index < 100; index += 1) {
      expect(cache.parse('https://example.com/repeated')).toBe(
        'HTTPS://EXAMPLE.COM/REPEATED',
      );
    }
    expect(underlyingCalls).toBe(1);
    expect(cache.size).toBe(1);
  });

  test('bounded parse cache evicts the oldest entry past capacity', () => {
    let underlyingCalls = 0;
    const cache = createBoundedParseCache((raw: string) => {
      underlyingCalls += 1;
      return raw;
    }, 2);

    cache.parse('a');
    cache.parse('b');
    cache.parse('c');
    expect(cache.size).toBe(2);
    cache.parse('a');
    // 'a' was evicted by 'c', so it parses again; 'c' is still cached.
    expect(underlyingCalls).toBe(4);
    cache.parse('c');
    expect(underlyingCalls).toBe(4);
  });
});

describe('memory returns to baseline (QLT-04)', () => {
  test('dispose stops capture, clears listeners and releases frame state', async () => {
    const source = new ScannerObservationFixtureSource({ engineID: 'fixture.dispose' });
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });
    await session.activateScanner();

    let emissions = 0;
    const unsubscribe = session.subscribe(() => {
      emissions += 1;
    });
    source.emit([detection('https://example.com/hold')]);
    expect(session.visibleObservations).toHaveLength(1);
    expect(session.currentResult?.rawPayload).toBe('https://example.com/hold');
    unsubscribe();

    const extra = session.subscribe(() => {
      emissions += 1;
    });
    void extra;

    session.dispose();

    expect(session.isDisposed).toBe(true);
    expect(session.listenerCount).toBe(0);
    expect(session.visibleObservations).toEqual([]);
    expect(session.currentResult).toBeNull();
    expect(session.performanceMetrics().backlogDepth).toBe(0);

    // The stopped source no longer delivers; nothing retained can fire.
    source.emit([detection('https://example.com/after-dispose')]);
    expect(session.visibleObservations).toEqual([]);
    expect(emissions).toBeGreaterThan(0);
    const frozen = emissions;
    source.emit([detection('https://example.com/after-dispose-2')]);
    expect(emissions).toBe(frozen);
  });

  test('repeated tab and background cycles keep start/stop balanced with no listener growth', async () => {
    const source = new CountingSource();
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });
    await session.activateScanner();
    expect(source.startCount).toBe(1);

    for (let cycle = 0; cycle < 10; cycle += 1) {
      const unsubscribe = session.subscribe(() => {});
      session.handlePresentation('obscured');
      session.handlePresentation('visible');
      session.handleLifecycle('background');
      session.handleLifecycle('active');
      unsubscribe();
    }

    expect(session.listenerCount).toBe(0);
    expect(source.startCount).toBe(source.stopCount + 1);
    expect(session.isCapturing).toBe(true);

    session.dispose();
    expect(source.stopCount).toBe(source.startCount);
    expect(session.isCapturing).toBe(false);
  });
});

describe('thermal-friendly continuous scanning (QLT-04)', () => {
  test('low-power mode disables high-frame-rate tracking work', () => {
    const base = {
      barcodeSymbologies: ['QR'],
      recognizesMultipleItems: true,
      isHighFrameRateTrackingEnabled: true,
      isGuidanceEnabled: false,
      isHighlightingEnabled: false,
      recognitionRegion: { x: 0, y: 0, width: 1, height: 1 },
    };

    expect(
      resolveVisionKitPerformanceConfiguration(base, 'full')
        .isHighFrameRateTrackingEnabled,
    ).toBe(true);
    expect(
      resolveVisionKitPerformanceConfiguration(base, 'lowPower')
        .isHighFrameRateTrackingEnabled,
    ).toBe(false);
    // The base product configuration is never mutated.
    expect(base.isHighFrameRateTrackingEnabled).toBe(true);
  });

  test('low-power throttle coalesces frames inside the minimum interval', () => {
    expect(shouldDeliverThrottledFrame(null, 1000)).toBe(true);
    expect(shouldDeliverThrottledFrame(1000, 1000)).toBe(false);
    expect(
      shouldDeliverThrottledFrame(1000, 1000 + LOW_POWER_MIN_FRAME_INTERVAL_MS - 1),
    ).toBe(false);
    expect(
      shouldDeliverThrottledFrame(1000, 1000 + LOW_POWER_MIN_FRAME_INTERVAL_MS),
    ).toBe(true);
  });

  test('session in low-power mode coalesces high-rate frames', async () => {
    let nowMs = BASE_MS;
    const source = new ScannerObservationFixtureSource({ engineID: 'fixture.thermal' });
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
      performanceNow: () => nowMs,
    });
    await session.activateScanner();
    session.setPerformanceMode('lowPower');
    expect(session.performanceMode).toBe('lowPower');

    source.emit([detection('frame-a')]);
    expect(session.visibleObservations.map((item) => item.rawPayload)).toEqual([
      'frame-a',
    ]);

    nowMs += 30;
    source.emit([detection('frame-b')]);
    nowMs += 30;
    source.emit([detection('frame-c')]);
    expect(session.visibleObservations.map((item) => item.rawPayload)).toEqual([
      'frame-a',
    ]);

    nowMs += LOW_POWER_MIN_FRAME_INTERVAL_MS;
    source.emit([detection('frame-d')]);
    expect(session.visibleObservations.map((item) => item.rawPayload)).toEqual([
      'frame-d',
    ]);

    const metrics = session.performanceMetrics();
    expect(metrics.throttledFrames).toBe(2);
    expect(metrics.mode).toBe('lowPower');
  });
});
