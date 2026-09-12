import { parseQRPayload } from '@/scanner/payloadParser';

import { HistoryStore } from './historyStore';

const GROUPED_TODAY = 'https://example.com/today';
const GROUPED_YESTERDAY = 'https://example.com/yesterday';
const GROUPED_WEEKDAY = 'https://example.com/weekday';
const GROUPED_OLDER = 'https://example.com/older';
const GROUPED_OTP =
  'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example';
const GROUPED_WIFI = 'WIFI:T:WPA;S:demo-net;P:not-a-real-password;;';

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Debug-only seed used by `--history-fixture grouped`. Production builds
 * never call this unless fixtures are explicitly enabled.
 */
export async function seedGroupedHistoryFixture(
  store: HistoryStore,
  options: { now: Date; fixturesEnabled: boolean },
): Promise<void> {
  if (!options.fixturesEnabled) {
    return;
  }
  if ((await store.list()).length > 0) {
    return;
  }

  const { now } = options;
  await store.recordAccepted(parseQRPayload(GROUPED_OLDER), daysAgo(now, 10));
  await store.recordAccepted(parseQRPayload(GROUPED_WEEKDAY), daysAgo(now, 3));
  await store.recordAccepted(parseQRPayload(GROUPED_YESTERDAY), daysAgo(now, 1));
  await store.recordAccepted(parseQRPayload(GROUPED_WIFI), daysAgo(now, 1));
  await store.recordAccepted(parseQRPayload(GROUPED_OTP), now);
  await store.recordAccepted(parseQRPayload(GROUPED_TODAY), now);
}
