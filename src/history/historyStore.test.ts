import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { parseQRPayload } from '@/scanner/payloadParser';

import {
  HISTORY_SCHEMA_VERSION,
  HistoryStore,
  InMemoryHistoryFileIO,
  nodeHistoryFileIO,
} from './historyStore';

const URL_RAW = 'https://example.com/some/path?q=1';
const OTP_RAW =
  'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example';
const OTP_SECRET = 'JBSWY3DPEHPK3PXP';

function at(msOffset: number): Date {
  return new Date(Date.UTC(2026, 8, 12, 10, 0, 0) + msOffset);
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qr-history-test-'));
}

describe('history store (HIS-01)', () => {
  test('safe event round-trips through insert and fetch', async () => {
    const store = await HistoryStore.open({
      fileIO: new InMemoryHistoryFileIO(),
      directory: '/tmp/history-test',
    });

    const event = await store.recordAccepted(parseQRPayload(URL_RAW), at(0));
    expect(event.kind).toBe('url');
    expect(event.original).toBe(URL_RAW);

    const events = await store.list();
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  test('redacted otp event persists without the secret', async () => {
    const store = await HistoryStore.open({
      fileIO: new InMemoryHistoryFileIO(),
      directory: '/tmp/history-test',
    });

    await store.recordAccepted(parseQRPayload(OTP_RAW), at(0));
    const events = await store.list();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('redacted');
    expect(events[0]?.original).toBeNull();
    expect(JSON.stringify(events)).not.toContain(OTP_SECRET);
  });

  test('list returns newest first', async () => {
    const store = await HistoryStore.open({
      fileIO: new InMemoryHistoryFileIO(),
      directory: '/tmp/history-test',
    });

    await store.recordAccepted(parseQRPayload('https://example.com/first'), at(0));
    await store.recordAccepted(parseQRPayload('https://example.com/second'), at(1000));

    const events = await store.list();
    expect(events.map((event) => event.original)).toEqual([
      'https://example.com/second',
      'https://example.com/first',
    ]);
  });

  test('safe and redacted events survive relaunch and re-fetch', async () => {
    const directory = await makeTempDir();
    const fileIO = nodeHistoryFileIO(fs);

    const firstLaunch = await HistoryStore.open({ fileIO, directory });
    await firstLaunch.recordAccepted(parseQRPayload(URL_RAW), at(0));
    await firstLaunch.recordAccepted(parseQRPayload(OTP_RAW), at(1000));

    // Simulate relaunch: open a second store over the same file.
    const secondLaunch = await HistoryStore.open({ fileIO, directory });
    const events = await secondLaunch.list();

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.kind)).toEqual(['redacted', 'url']);
    expect(events.find((event) => event.kind === 'url')?.original).toBe(URL_RAW);
    expect(JSON.stringify(events)).not.toContain(OTP_SECRET);

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('on-disk envelope carries schema version 1', async () => {
    const directory = await makeTempDir();
    const fileIO = nodeHistoryFileIO(fs);

    const store = await HistoryStore.open({ fileIO, directory });
    await store.recordAccepted(parseQRPayload(URL_RAW), at(0));

    const raw = await fs.readFile(path.join(directory, 'history-v1.json'), 'utf8');
    const envelope = JSON.parse(raw) as { version: unknown; events: unknown };
    expect(envelope.version).toBe(HISTORY_SCHEMA_VERSION);
    expect(Array.isArray(envelope.events)).toBe(true);

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('corrupt file loads empty without throwing and heals on next write', async () => {
    const directory = await makeTempDir();
    const fileIO = nodeHistoryFileIO(fs);
    await fs.writeFile(path.join(directory, 'history-v1.json'), 'not-json{{{');

    let store: HistoryStore | null = null;
    await expect(
      HistoryStore.open({ fileIO, directory }).then((opened) => {
        store = opened;
      }),
    ).resolves.toBeUndefined();
    await expect(store!.list()).resolves.toEqual([]);
    await store!.recordAccepted(parseQRPayload(URL_RAW), at(0));
    await expect(store!.list()).resolves.toHaveLength(1);

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('unknown schema version loads empty without throwing', async () => {
    const directory = await makeTempDir();
    const fileIO = nodeHistoryFileIO(fs);
    await fs.writeFile(
      path.join(directory, 'history-v1.json'),
      JSON.stringify({ version: 999, events: [] }),
    );

    const store = await HistoryStore.open({ fileIO, directory });
    await expect(store.list()).resolves.toEqual([]);

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('clear removes every row and persists the empty state across relaunch', async () => {
    const directory = await makeTempDir();
    const fileIO = nodeHistoryFileIO(fs);

    const store = await HistoryStore.open({ fileIO, directory });
    await store.recordAccepted(parseQRPayload(URL_RAW), at(0));
    await store.clear();
    await expect(store.list()).resolves.toEqual([]);

    const relaunched = await HistoryStore.open({ fileIO, directory });
    await expect(relaunched.list()).resolves.toEqual([]);

    await fs.rm(directory, { recursive: true, force: true });
  });

  test('recording and fetching perform no network i/o', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no net'));
    try {
      const store = await HistoryStore.open({
        fileIO: new InMemoryHistoryFileIO(),
        directory: '/tmp/history-test',
      });
      await store.recordAccepted(parseQRPayload(URL_RAW), at(0));
      await store.list();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
