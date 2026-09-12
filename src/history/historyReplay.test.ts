import { parseQRPayload } from '@/scanner/payloadParser';

import {
  REDACTED_HISTORY_KIND,
  WIFI_HISTORY_KIND,
  WIFI_STORAGE_SUMMARY,
  type StoredHistoryEvent,
} from './historyPolicy';
import { presentHistoryDetailTime, replayHistoryEvent } from './historyReplay';

const PARSER = 1;
const OTP_SECRET = 'JBSWY3DPEHPK3PXP';
const WIFI_PASSWORD = 'supersecret123';
const WIFI_SSID = 'home-network';
const URL_RAW = 'https://example.com/today';

function event(overrides: Partial<StoredHistoryEvent>): StoredHistoryEvent {
  return {
    id: 'evt',
    acceptedAt: '2026-09-12T17:04:00.000Z',
    kind: 'url',
    summary: 'example.com/today',
    original: URL_RAW,
    parserVersion: PARSER,
    ...overrides,
  };
}

describe('replayHistoryEvent', () => {
  test('reparses a stored original with the current parser, ignoring stale kind and summary', () => {
    const stale = event({
      kind: 'text',
      summary: 'stale stored summary',
      original: URL_RAW,
    });

    const replay = replayHistoryEvent(stale);

    expect(replay.status).toBe('replayable');
    if (replay.status !== 'replayable') {
      throw new Error('expected replayable');
    }

    const live = parseQRPayload(URL_RAW);
    expect(replay.parsed.content.kind).toBe('url');
    expect(replay.parsed.content.kind).toBe(live.content.kind);
    expect(replay.parsed.actions).toEqual(live.actions);
    expect(replay.parsed.actions).toContain('openUrl');
    expect(replay.parsed.displaySummary).toBe(live.displaySummary);
    expect(replay.parsed.displaySummary).not.toBe(stale.summary);
    expect(replay.parsed.originalPayload).toBe(URL_RAW);
  });

  test('a redacted event is unavailable and never exposes the secret for copy or replay', () => {
    const stored = event({
      kind: REDACTED_HISTORY_KIND,
      summary: null,
      original: `otpauth://totp/Example:alice?secret=${OTP_SECRET}`,
    });

    const replay = replayHistoryEvent(stored);

    expect(replay.status).toBe('unavailable');
    if (replay.status !== 'unavailable') {
      throw new Error('expected unavailable');
    }
    expect(replay.reason).toBe('redacted');
    expect(replay).not.toHaveProperty('parsed');
    expect(JSON.stringify(replay)).not.toContain(OTP_SECRET);
    expect(JSON.stringify(replay)).not.toContain('otpauth');
  });

  test('a wifi event is unavailable and never exposes ssid or password', () => {
    const stored = event({
      kind: WIFI_HISTORY_KIND,
      summary: WIFI_STORAGE_SUMMARY,
      original: `WIFI:T:WPA;S:${WIFI_SSID};P:${WIFI_PASSWORD};;`,
    });

    const replay = replayHistoryEvent(stored);

    expect(replay.status).toBe('unavailable');
    if (replay.status !== 'unavailable') {
      throw new Error('expected unavailable');
    }
    expect(replay.reason).toBe('wifi');
    expect(JSON.stringify(replay)).not.toContain(WIFI_PASSWORD);
    expect(JSON.stringify(replay)).not.toContain(WIFI_SSID);
  });

  test('a safe event with no original cannot be replayed', () => {
    const replay = replayHistoryEvent(
      event({
        kind: 'url',
        summary: 'example.com/missing',
        original: null,
      }),
    );

    expect(replay.status).toBe('unavailable');
  });
});

describe('presentHistoryDetailTime', () => {
  test('returns a localized relative label and an exact date/time', () => {
    const presented = presentHistoryDetailTime('2026-09-12T17:04:00.000Z', {
      now: new Date('2026-09-12T18:00:00.000Z'),
      locale: 'en-US',
      timeZone: 'UTC',
    });

    expect(presented.relative).toMatch(/56 minutes ago/);
    expect(presented.exact).toMatch(/Sep(tember)? 12, 2026/);
    expect(presented.exact).toMatch(/5:04/);
  });

  test('formats relative and exact time for Spanish', () => {
    const presented = presentHistoryDetailTime('2026-09-12T17:04:00.000Z', {
      now: new Date('2026-09-12T18:00:00.000Z'),
      locale: 'es',
      timeZone: 'UTC',
    });

    expect(presented.relative).toMatch(/56/);
    expect(presented.relative).toMatch(/minuto/i);
    expect(presented.exact).toMatch(/12/);
    expect(presented.exact).toMatch(/2026/);
  });
});
