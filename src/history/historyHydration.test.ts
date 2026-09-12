import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { ScannerObservationFixtureSource, SINGLE_CODE_FIXTURE } from '@/scanner/fixtures';
import { parseQRPayload } from '@/scanner/payloadParser';
import { ScannerSessionStore } from '@/scanner/session';

import { hydrateHistoryForSession } from './historyHydration';
import { HistoryStore, InMemoryHistoryFileIO } from './historyStore';

const NOW = new Date('2026-09-12T18:00:00.000Z');

async function waitForRowCount(store: HistoryStore, count: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((await store.list()).length >= count) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`history store stayed below ${count} rows`);
}

async function openStore(): Promise<HistoryStore> {
  return HistoryStore.open({
    fileIO: new InMemoryHistoryFileIO(),
    directory: '/tmp/history-hydration-test',
  });
}

describe('hydrateHistoryForSession', () => {
  test('does not seed grouped rows unless fixtures are enabled', async () => {
    const store = await openStore();
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: new ScannerObservationFixtureSource({
        engineID: 'fixture.hydration',
      }),
    });
    const seen: number[] = [];

    await hydrateHistoryForSession({
      store,
      session,
      fixturesEnabled: false,
      historyFixture: 'grouped',
      now: NOW,
      onEvents: (events) => seen.push(events.length),
    });

    expect(seen).toEqual([0]);
    await expect(store.list()).resolves.toEqual([]);
  });

  test('loads grouped fixture rows when fixtures are enabled', async () => {
    const store = await openStore();
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: new ScannerObservationFixtureSource({
        engineID: 'fixture.hydration',
      }),
    });
    let loaded = 0;

    await hydrateHistoryForSession({
      store,
      session,
      fixturesEnabled: true,
      historyFixture: 'grouped',
      now: NOW,
      onEvents: (events) => {
        loaded = events.length;
      },
    });

    expect(loaded).toBeGreaterThan(0);
    await expect(store.list()).resolves.toHaveLength(loaded);
  });

  test('forwards a later accepted scan into the opened store', async () => {
    const store = await openStore();
    const source = new ScannerObservationFixtureSource({
      engineID: 'fixture.hydration-accept',
    });
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: source,
    });
    const snapshots: string[][] = [];

    await hydrateHistoryForSession({
      store,
      session,
      fixturesEnabled: false,
      now: NOW,
      onEvents: (events) => {
        snapshots.push(events.map((event) => event.summary ?? event.kind));
      },
    });

    await session.activateScanner();
    source.emit(SINGLE_CODE_FIXTURE);
    source.emit(SINGLE_CODE_FIXTURE);
    await waitForRowCount(store, 1);

    const events = await store.list();
    expect(events[0]?.summary).toContain('example.com/fixture');
    expect(snapshots.at(-1)?.some((value) => value.includes('example.com/fixture'))).toBe(
      true,
    );
  });

  test('keeps previously persisted rows when hydrating without a fixture', async () => {
    const store = await openStore();
    await store.recordAccepted(
      parseQRPayload('https://example.com/kept'),
      NOW,
    );
    const session = new ScannerSessionStore({
      cameraAccess: new CameraAccessFixtureProvider({ authorization: 'authorized' }),
      observationSource: new ScannerObservationFixtureSource({
        engineID: 'fixture.hydration-keep',
      }),
    });
    let loaded: string[] = [];

    await hydrateHistoryForSession({
      store,
      session,
      fixturesEnabled: true,
      now: NOW,
      onEvents: (events) => {
        loaded = events.map((event) => event.summary ?? '');
      },
    });

    expect(loaded.some((summary) => summary.includes('example.com/kept'))).toBe(true);
  });
});
