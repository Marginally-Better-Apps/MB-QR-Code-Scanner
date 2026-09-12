import type { ScannerSessionStore } from '@/scanner/session';

import { seedGroupedHistoryFixture } from './historyFixtures';
import { recordAcceptedScan, type HistoryStore } from './historyStore';
import type { StoredHistoryEvent } from './historyPolicy';

export type HistoryHydrationInput = {
  store: HistoryStore;
  session: ScannerSessionStore;
  fixturesEnabled: boolean;
  historyFixture?: string;
  now?: Date;
  onEvents: (events: StoredHistoryEvent[]) => void;
};

/**
 * Loads persisted rows (and an optional debug seed), then records later
 * acceptance-gate events into the same store.
 */
export async function hydrateHistoryForSession(
  input: HistoryHydrationInput,
): Promise<void> {
  if (input.fixturesEnabled && input.historyFixture === 'grouped') {
    await seedGroupedHistoryFixture(input.store, {
      now: input.now ?? new Date(),
      fixturesEnabled: true,
    });
  }

  input.onEvents(await input.store.list());
  input.session.setAcceptedScanListener((accepted) => {
    void recordAcceptedScan(input.store, accepted)
      .then(() => input.store.list())
      .then(input.onEvents)
      .catch(() => {
        // History must never interrupt scanning.
      });
  });
}
