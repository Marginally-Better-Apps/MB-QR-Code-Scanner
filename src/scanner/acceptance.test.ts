import {
  createInitialScanAcceptanceState,
  normalizeScanPayload,
  SCAN_RESET_MS,
  SCAN_STABLE_MS,
  updateScanAcceptance,
} from './acceptance';
import { ScannerObservationFixtureSource } from './fixtures';

const BASE_MS = 1_728_000_000_000;

function at(msOffset: number): Date {
  return new Date(BASE_MS + msOffset);
}

describe('scan acceptance reducer', () => {
  test('accepts after two consecutive observations before the stable window', () => {
    let state = createInitialScanAcceptanceState();
    const first = updateScanAcceptance(state, ['https://example.com/a'], at(0));
    expect(first.accepted).toEqual([]);
    state = first.state;

    const second = updateScanAcceptance(state, ['https://example.com/a'], at(50));
    expect(second.accepted).toHaveLength(1);
    expect(second.accepted[0]).toMatchObject({
      payload: 'https://example.com/a',
      normalized: 'https://example.com/a',
    });
    expect(second.accepted[0].acceptedAt).toEqual(at(50));
  });

  test('accepts after 250ms of stable presence even without consecutive frames', () => {
    let state = createInitialScanAcceptanceState();
    const first = updateScanAcceptance(state, ['https://example.com/a'], at(0));
    expect(first.accepted).toEqual([]);
    state = first.state;

    const removed = updateScanAcceptance(state, [], at(100));
    expect(removed.accepted).toEqual([]);
    state = removed.state;

    const reappeared = updateScanAcceptance(state, ['https://example.com/a'], at(300));
    expect(reappeared.accepted).toHaveLength(1);
    expect(reappeared.accepted[0].payload).toBe('https://example.com/a');
  });

  test('one continuously visible payload produces one event', () => {
    let state = createInitialScanAcceptanceState();
    let hapticRequests = 0;
    let totalAccepted = 0;
    const frames = [0, 50, 100, 150, 200].map((offset) => at(offset));
    for (const now of frames) {
      const result = updateScanAcceptance(state, ['https://example.com/steady'], now);
      state = result.state;
      totalAccepted += result.accepted.length;
      hapticRequests += result.accepted.length;
    }
    expect(totalAccepted).toBe(1);
    expect(hapticRequests).toBe(1);
  });

  test('removal alone never produces an accepted event', () => {
    let state = createInitialScanAcceptanceState();
    const first = updateScanAcceptance(state, ['https://example.com/a'], at(0));
    state = first.state;
    const removed = updateScanAcceptance(state, [], at(100));
    expect(removed.accepted).toEqual([]);
    const stillGone = updateScanAcceptance(removed.state, [], at(200));
    expect(stillGone.accepted).toEqual([]);

    const emptyStart = updateScanAcceptance(
      createInitialScanAcceptanceState(),
      [],
      at(0),
    );
    expect(emptyStart.accepted).toEqual([]);
  });

  test('absent for less than 2s suppresses a new event, absent >=2s allows it', () => {
    let state = createInitialScanAcceptanceState();
    state = updateScanAcceptance(state, ['https://example.com/a'], at(0)).state;
    state = updateScanAcceptance(state, ['https://example.com/a'], at(50)).state;

    // Brief absence then stable reappearance stays deduplicated.
    state = updateScanAcceptance(state, [], at(100)).state;
    state = updateScanAcceptance(state, ['https://example.com/a'], at(600)).state;
    const quickRepeat = updateScanAcceptance(state, ['https://example.com/a'], at(650));
    expect(quickRepeat.accepted).toEqual([]);
    state = quickRepeat.state;

    // Long absence expires the dedup window.
    state = updateScanAcceptance(state, [], at(700)).state;
    const reappearedOnce = updateScanAcceptance(
      state,
      ['https://example.com/a'],
      at(700 + SCAN_RESET_MS + 100),
    );
    expect(reappearedOnce.accepted).toEqual([]);
    state = reappearedOnce.state;

    const reappearedTwice = updateScanAcceptance(
      state,
      ['https://example.com/a'],
      at(700 + SCAN_RESET_MS + 150),
    );
    expect(reappearedTwice.accepted).toHaveLength(1);
    expect(reappearedTwice.accepted[0].payload).toBe('https://example.com/a');
  });

  test('a different stable payload accepts without waiting for the old reset window', () => {
    let state = createInitialScanAcceptanceState();
    state = updateScanAcceptance(state, ['https://example.com/a'], at(0)).state;
    const acceptedA = updateScanAcceptance(state, ['https://example.com/a'], at(50));
    expect(acceptedA.accepted).toHaveLength(1);
    state = acceptedA.state;

    const firstB = updateScanAcceptance(state, ['https://example.com/b'], at(100));
    expect(firstB.accepted).toEqual([]);
    state = firstB.state;

    const secondB = updateScanAcceptance(state, ['https://example.com/b'], at(150));
    expect(secondB.accepted).toHaveLength(1);
    expect(secondB.accepted[0].payload).toBe('https://example.com/b');
    expect(secondB.accepted[0].acceptedAt.getTime() - BASE_MS).toBeLessThan(SCAN_RESET_MS);
  });

  test('normalizes whitespace and Unicode for identity while preserving original', () => {
    expect(normalizeScanPayload('  https://example.com  ')).toBe('https://example.com');
    expect(normalizeScanPayload('caf\u00e9')).toBe(normalizeScanPayload('cafe\u0301'));
    expect(normalizeScanPayload('   ')).toBe('');

    let state = createInitialScanAcceptanceState();
    state = updateScanAcceptance(state, ['hello'], at(0)).state;
    const accepted = updateScanAcceptance(state, ['  hello  '], at(50));
    expect(accepted.accepted).toHaveLength(1);
    expect(accepted.accepted[0].payload).toBe('  hello  ');
    expect(accepted.accepted[0].normalized).toBe('hello');

    const composed = 'caf\u00e9';
    const decomposed = 'cafe\u0301';
    let unicodeState = createInitialScanAcceptanceState();
    unicodeState = updateScanAcceptance(unicodeState, [composed], at(0)).state;
    const unicodeAccepted = updateScanAcceptance(unicodeState, [decomposed], at(50));
    expect(unicodeAccepted.accepted).toHaveLength(1);
    expect(unicodeAccepted.accepted[0].payload).toBe(decomposed);

    const whitespaceOnly = updateScanAcceptance(
      updateScanAcceptance(createInitialScanAcceptanceState(), ['   '], at(0)).state,
      ['\t\n '],
      at(50),
    );
    expect(whitespaceOnly.accepted).toEqual([]);
  });

  test('fixture integration deduplicates haptic and event for one continuous payload', () => {
    let now = at(0);
    const clock = {
      get now() {
        return now;
      },
    };
    const source = new ScannerObservationFixtureSource({
      engineID: 'fixture.acceptance',
      clock: clock as unknown as { now: Date },
    });
    const received: { payload: string; at: Date }[][] = [];
    source.start((frame) => {
      received.push(frame.map((item) => ({ payload: item.rawPayload, at: item.timestamp })));
    });

    let state = createInitialScanAcceptanceState();
    let hapticRequests = 0;
    let acceptedEvents = 0;
    const step = (detections: { rawPayload: string; displayBounds: never }[] | string[], nowValue: Date) => {
      now = nowValue;
      const rawPayloads =
        typeof detections[0] === 'string'
          ? (detections as string[])
          : (detections as { rawPayload: string }[]).map((d) => d.rawPayload);
      // Emit through the real fixture source so timestamps come from the injected clock.
      source.emit(
        rawPayloads.map((rawPayload) => ({
          rawPayload,
          displayBounds: { x: 0.2, y: 0.3, width: 0.6, height: 0.25 },
        })),
      );
      const latest = received[received.length - 1] ?? [];
      const result = updateScanAcceptance(state, latest.map((item) => item.payload), now);
      state = result.state;
      acceptedEvents += result.accepted.length;
      hapticRequests += result.accepted.length;
    };

    const bounds = { x: 0.2, y: 0.3, width: 0.6, height: 0.25 } as never;
    step([{ rawPayload: 'https://example.com/fixture', displayBounds: bounds }], at(0));
    step([{ rawPayload: 'https://example.com/fixture', displayBounds: bounds }], at(50));
    step([{ rawPayload: 'https://example.com/fixture', displayBounds: bounds }], at(100));
    source.emit([]);
    const emptyResult = updateScanAcceptance(state, [], at(150));
    state = emptyResult.state;
    expect(emptyResult.accepted).toEqual([]);

    expect(acceptedEvents).toBe(1);
    expect(hapticRequests).toBe(1);
    expect(SCAN_STABLE_MS).toBe(250);
    expect(SCAN_RESET_MS).toBe(2000);
  });
});
