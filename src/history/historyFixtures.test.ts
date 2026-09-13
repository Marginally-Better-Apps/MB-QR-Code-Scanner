import { HistoryStore, InMemoryHistoryFileIO } from './historyStore';
import { seedGroupedHistoryFixture } from './historyFixtures';

const NOW = new Date('2026-09-12T18:00:00.000Z');

async function openStore(): Promise<HistoryStore> {
  return HistoryStore.open({
    fileIO: new InMemoryHistoryFileIO(),
    directory: '/tmp/history-fixture-test',
  });
}

describe('grouped history fixture', () => {
  test('does not invent rows when fixtures are disabled', async () => {
    const store = await openStore();
    await seedGroupedHistoryFixture(store, { now: NOW, fixturesEnabled: false });
    await expect(store.list()).resolves.toEqual([]);
  });

  test('seeds today, yesterday, weekday, older, wifi, and redacted rows when enabled', async () => {
    const store = await openStore();
    await seedGroupedHistoryFixture(store, { now: NOW, fixturesEnabled: true });

    const events = await store.list();
    expect(events.map((event) => event.kind).sort()).toEqual(
      ['redacted', 'url', 'url', 'url', 'url', 'wifi'].sort(),
    );
    expect(events.some((event) => event.summary?.includes('example.com/today'))).toBe(true);
    expect(events.some((event) => event.kind === 'redacted' && event.original == null)).toBe(
      true,
    );
    expect(JSON.stringify(events)).not.toContain('JBSWY3DPEHPK3PXP');
    expect(JSON.stringify(events)).not.toContain('not-a-real-password');
    expect(JSON.stringify(events)).not.toContain('demo-net');
  });

  test('does not add a second copy on a later seed of the same store', async () => {
    const store = await openStore();
    await seedGroupedHistoryFixture(store, { now: NOW, fixturesEnabled: true });
    await seedGroupedHistoryFixture(store, { now: NOW, fixturesEnabled: true });
    await expect(store.list()).resolves.toHaveLength(6);
  });
});
