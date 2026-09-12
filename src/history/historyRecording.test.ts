import { CameraAccessFixtureProvider } from '@/scanner/cameraFixtures';
import { ScannerObservationFixtureSource } from '@/scanner/fixtures';
import { ScannerSessionStore } from '@/scanner/session';
import type { AcceptedScan } from '@/scanner/acceptance';

import { HistoryStore, InMemoryHistoryFileIO, recordAcceptedScan } from './historyStore';

const URL_RAW = 'https://example.com/gated';
const OTP_RAW =
  'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example';
const OTP_SECRET = 'JBSWY3DPEHPK3PXP';
const WIFI_RAW = 'WIFI:T:WPA;S:home-network;P:supersecret123;;';

function bounds() {
  return { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
}

async function makeRecordingSession() {
  const source = new ScannerObservationFixtureSource({ engineID: 'fixture.history' });
  const store = await HistoryStore.open({
    fileIO: new InMemoryHistoryFileIO(),
    directory: '/tmp/history-recording-test',
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

describe('history recording downstream of the acceptance gate (HIS-01)', () => {
  test('observations that never stabilize create no rows', async () => {
    const { source, store, recorded } = await makeRecordingSession();

    // A single flicker frame never passes the acceptance gate.
    source.emit([{ rawPayload: URL_RAW, displayBounds: bounds() }]);
    // A different flicker also never stabilizes.
    source.emit([{ rawPayload: 'https://example.com/other', displayBounds: bounds() }]);

    expect(recorded).toEqual([]);
    await expect(store.list()).resolves.toEqual([]);
  });

  test('a stabilized observation is recorded exactly once with safe fields', async () => {
    const { source, store } = await makeRecordingSession();

    source.emit([{ rawPayload: URL_RAW, displayBounds: bounds() }]);
    source.emit([{ rawPayload: URL_RAW, displayBounds: bounds() }]);
    // Continuous presence must not duplicate the row.
    source.emit([{ rawPayload: URL_RAW, displayBounds: bounds() }]);
    source.emit([{ rawPayload: URL_RAW, displayBounds: bounds() }]);

    const events = await store.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('url');
    expect(events[0]?.original).toBe(URL_RAW);
    expect(events[0]?.summary).toContain('example.com');
  });

  test('a stabilized otp observation is recorded redacted without the secret', async () => {
    const { source, store } = await makeRecordingSession();

    source.emit([{ rawPayload: OTP_RAW, displayBounds: bounds() }]);
    source.emit([{ rawPayload: OTP_RAW, displayBounds: bounds() }]);

    const events = await store.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('redacted');
    expect(events[0]?.original).toBeNull();
    expect(JSON.stringify(events)).not.toContain(OTP_SECRET);
  });

  test('a stabilized wifi observation omits ssid and password', async () => {
    const { source, store } = await makeRecordingSession();

    source.emit([{ rawPayload: WIFI_RAW, displayBounds: bounds() }]);
    source.emit([{ rawPayload: WIFI_RAW, displayBounds: bounds() }]);

    const events = await store.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('wifi');
    expect(events[0]?.original).toBeNull();
    expect(JSON.stringify(events)).not.toContain('supersecret123');
    expect(JSON.stringify(events)).not.toContain('home-network');
  });
});
