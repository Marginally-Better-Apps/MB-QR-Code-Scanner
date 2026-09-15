import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { makeObservationSource } from '@/scanner/factory';
import {
  ACCEPTANCE_FIRST_URL,
  ACCEPTANCE_SECOND_URL,
  ScannerObservationFixtureSource,
} from '@/scanner/fixtures';
import { ScannerSessionStore } from '@/scanner/session';
import { trailingEdge } from '@/history/historySwipe';
import { replayHistoryEvent } from '@/history/historyReplay';
import {
  HistoryStore,
  InMemoryHistoryFileIO,
  recordAcceptedScan,
} from '@/history/historyStore';
import type { AcceptedScan } from '@/scanner/acceptance';

function bounds() {
  return { x: 0.2, y: 0.3, width: 0.6, height: 0.25 };
}

async function makeJourneySession() {
  const source = new ScannerObservationFixtureSource({ engineID: 'fixture.journey' });
  const store = await HistoryStore.open({
    fileIO: new InMemoryHistoryFileIO(),
    directory: '/tmp/acceptance-journey-test',
  });
  const recorded: AcceptedScan[] = [];
  const session = new ScannerSessionStore({
    cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
    observationSource: source,
    onAcceptedScan: (accepted) => {
      recorded.push(accepted);
      void recordAcceptedScan(store, accepted).catch(() => {});
    },
  });
  await session.activateScanner();
  return { source, session, store, recorded };
}

describe('QR Scanner 1.0 acceptance journey (QLT-06)', () => {
  test('launch fixture injects the first safe URL', () => {
    const source = makeObservationSource({
      arguments: ['QRScanner', '--scanner-fixture', 'acceptance-first'],
      fixturesEnabled: true,
    });
    const frames: string[][] = [];
    source.start((frame) => frames.push(frame.map((item) => item.rawPayload)));

    expect(source.engineID).toBe('fixture.acceptance-first');
    expect(frames[0]).toEqual([ACCEPTANCE_FIRST_URL]);
  });

  test('sticky result survives removal, replacement wins, history replays and deletes', async () => {
    const { source, session, store } = await makeJourneySession();

    // Inject URL fixture: stabilized so it passes the acceptance gate.
    source.emit([{ rawPayload: ACCEPTANCE_FIRST_URL, displayBounds: bounds() }]);
    source.emit([{ rawPayload: ACCEPTANCE_FIRST_URL, displayBounds: bounds() }]);
    expect(session.currentResult?.rawPayload).toBe(ACCEPTANCE_FIRST_URL);

    // Remove the code: empty frame must never clear the sticky result.
    source.emit([]);
    expect(session.visibleObservations).toEqual([]);
    expect(session.currentResult?.rawPayload).toBe(ACCEPTANCE_FIRST_URL);

    // Inject a different code: replacement swaps in a single transition.
    source.emit([{ rawPayload: ACCEPTANCE_SECOND_URL, displayBounds: bounds() }]);
    source.emit([{ rawPayload: ACCEPTANCE_SECOND_URL, displayBounds: bounds() }]);
    expect(session.currentResult?.rawPayload).toBe(ACCEPTANCE_SECOND_URL);

    const events = await store.list();
    expect(events).toHaveLength(2);
    const first = events.find((event) => event.original === ACCEPTANCE_FIRST_URL);
    const second = events.find((event) => event.original === ACCEPTANCE_SECOND_URL);
    expect(first?.kind).toBe('url');
    expect(second?.kind).toBe('url');

    // Replay the first safe result with the current parser.
    const replay = replayHistoryEvent(first!);
    expect(replay.status).toBe('replayable');
    if (replay.status !== 'replayable') {
      throw new Error('expected replayable');
    }
    expect(replay.parsed.originalPayload).toBe(ACCEPTANCE_FIRST_URL);
    expect(replay.parsed.actions).toContain('openUrl');

    // Trailing swipe deletion removes the row and it stays gone.
    expect(trailingEdge('ltr')).toBe('right');
    await store.delete(second!.id);
    const remaining = await store.list();
    expect(remaining.map((event) => event.original)).toEqual([ACCEPTANCE_FIRST_URL]);
  });

  test('debug fixture controls drive the same journey without relaunch', async () => {
    const { session } = await makeJourneySession();

    session.debugFixtureInject(ACCEPTANCE_FIRST_URL);
    expect(session.currentResult?.rawPayload).toBe(ACCEPTANCE_FIRST_URL);

    session.debugFixtureClear();
    expect(session.visibleObservations).toEqual([]);
    expect(session.currentResult?.rawPayload).toBe(ACCEPTANCE_FIRST_URL);

    session.debugFixtureInject(ACCEPTANCE_SECOND_URL);
    expect(session.currentResult?.rawPayload).toBe(ACCEPTANCE_SECOND_URL);
  });
});
