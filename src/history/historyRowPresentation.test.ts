import { PAYLOAD_PARSER_VERSION } from '@/scanner/payloadParser';

import { REDACTED_HISTORY_KIND, WIFI_HISTORY_KIND, WIFI_STORAGE_SUMMARY } from './historyPolicy';
import { presentHistoryRow } from './historyRowPresentation';
import type { StoredHistoryEvent } from './historyPolicy';

const PARSER = PAYLOAD_PARSER_VERSION;
const OTP_SECRET = 'JBSWY3DPEHPK3PXP';
const WIFI_PASSWORD = 'supersecret123';
const WIFI_SSID = 'home-network';

function base(overrides: Partial<StoredHistoryEvent>): StoredHistoryEvent {
  return {
    id: 'evt-1',
    acceptedAt: '2026-09-12T17:04:00.000Z',
    kind: 'url',
    summary: 'example.com/path',
    original: 'https://example.com/path',
    parserVersion: PARSER,
    ...overrides,
  };
}

const EN = {
  locale: 'en-US',
  timeZone: 'UTC',
  redactedTitle: 'Sensitive scan',
  wifiTitle: 'Wi-Fi network',
};

describe('presentHistoryRow', () => {
  test('safe rows expose the stored summary, a type icon, and a localized time', () => {
    const row = presentHistoryRow(base({}), EN);

    expect(row.title).toBe('example.com/path');
    expect(row.symbol).toBe('link');
    expect(row.timeLabel).toBe('5:04 PM');
    expect(row.kind).toBe('url');
  });

  test('redacted rows use a generic title and never surface the original payload', () => {
    const row = presentHistoryRow(
      base({
        kind: REDACTED_HISTORY_KIND,
        summary: null,
        original: `otpauth://totp/Example:alice?secret=${OTP_SECRET}`,
      }),
      EN,
    );

    expect(row.title).toBe('Sensitive scan');
    expect(row.symbol).toBe('eye.slash');
    expect(JSON.stringify(row)).not.toContain(OTP_SECRET);
    expect(JSON.stringify(row)).not.toContain('otpauth');
    expect(row.title).not.toContain('alice');
  });

  test('wifi rows use the generic title and never surface ssid or password', () => {
    const row = presentHistoryRow(
      base({
        kind: WIFI_HISTORY_KIND,
        summary: WIFI_STORAGE_SUMMARY,
        original: `WIFI:T:WPA;S:${WIFI_SSID};P:${WIFI_PASSWORD};;`,
      }),
      EN,
    );

    expect(row.title).toBe('Wi-Fi network');
    expect(row.symbol).toBe('wifi');
    expect(JSON.stringify(row)).not.toContain(WIFI_PASSWORD);
    expect(JSON.stringify(row)).not.toContain(WIFI_SSID);
  });

  test('Spanish locale formats the time for that locale', () => {
    const row = presentHistoryRow(base({}), {
      ...EN,
      locale: 'es',
    });

    expect(row.timeLabel).toMatch(/17:04|5:04/);
  });
});
