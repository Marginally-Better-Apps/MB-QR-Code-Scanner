import { PAYLOAD_PARSER_VERSION, parseQRPayload } from '@/scanner/payloadParser';

import {
  looksLikeSecretEnrollment,
  randomHistoryId,
  toStorableHistoryEvent,
} from './historyPolicy';

const URL_RAW = 'https://example.com/some/path?q=1';
const TEXT_RAW = 'Hello, this is plain text';
const OTP_RAW =
  'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example';
const OTP_SECRET = 'JBSWY3DPEHPK3PXP';
const WIFI_RAW = 'WIFI:T:WPA;S:home-network;P:supersecret123;;';
const WIFI_SSID = 'home-network';
const WIFI_PASSWORD = 'supersecret123';
const PASSKEY_RAW =
  'passkey-registration:credential-id-abc123,challenge-xyz,rp-example.com';
const PEM_RAW = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCtestkeymaterial
-----END PRIVATE KEY-----`;

const ACCEPTED_AT = new Date('2026-09-12T10:00:00.000Z');
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('history storage policy (HIS-01)', () => {
  test('safe url event stores uuid, accepted date, kind, summary, original, parser version', () => {
    const parsed = parseQRPayload(URL_RAW);
    const event = toStorableHistoryEvent(parsed, ACCEPTED_AT);

    expect(event.id).toMatch(UUID_RE);
    expect(event.acceptedAt).toBe(ACCEPTED_AT.toISOString());
    expect(event.kind).toBe('url');
    expect(event.summary).toContain('example.com');
    expect(event.original).toBe(URL_RAW);
    expect(event.parserVersion).toBe(PAYLOAD_PARSER_VERSION);
  });

  test('plain text fallback stores the allowed original payload', () => {
    const parsed = parseQRPayload(TEXT_RAW);
    const event = toStorableHistoryEvent(parsed, ACCEPTED_AT);

    expect(event.kind).toBe('text');
    expect(event.original).toBe(TEXT_RAW);
    expect(event.summary).toContain('Hello');
    expect(event.parserVersion).toBe(PAYLOAD_PARSER_VERSION);
  });

  test('otp stores at most a redacted kind and timestamp; raw secret is absent', () => {
    const parsed = parseQRPayload(OTP_RAW);
    expect(parsed.sensitivity).toBe('sessionOnly');

    const event = toStorableHistoryEvent(parsed, ACCEPTED_AT);

    expect(event.kind).toBe('redacted');
    expect(event.acceptedAt).toBe(ACCEPTED_AT.toISOString());
    expect(event.original).toBeNull();
    expect(event.summary).toBeNull();
    expect(JSON.stringify(event)).not.toContain(OTP_SECRET);
    expect(JSON.stringify(event)).not.toContain('alice@example.com');
  });

  test('passkey-like and private-key payloads are redacted', () => {
    for (const raw of [PASSKEY_RAW, PEM_RAW]) {
      expect(looksLikeSecretEnrollment(raw)).toBe(true);
      const parsed = parseQRPayload(raw);
      const event = toStorableHistoryEvent(parsed, ACCEPTED_AT);
      expect(event.kind).toBe('redacted');
      expect(event.original).toBeNull();
      expect(event.summary).toBeNull();
      expect(JSON.stringify(event)).not.toContain('credential-id-abc123');
    }
    expect(JSON.stringify(toStorableHistoryEvent(parseQRPayload(PEM_RAW), ACCEPTED_AT))).not.toContain(
      'testkeymaterial',
    );
  });

  test('ordinary prose mentioning no secret markers stays fully stored', () => {
    const parsed = parseQRPayload('Call Fido at noon about lunch');
    const event = toStorableHistoryEvent(parsed, ACCEPTED_AT);
    expect(event.kind).toBe('text');
    expect(event.original).toBe('Call Fido at noon about lunch');
  });

  test('wifi events omit the password and omit the ssid by default', () => {
    const parsed = parseQRPayload(WIFI_RAW);
    const event = toStorableHistoryEvent(parsed, ACCEPTED_AT);

    expect(event.kind).toBe('wifi');
    expect(event.acceptedAt).toBe(ACCEPTED_AT.toISOString());
    expect(event.original).toBeNull();
    expect(event).not.toHaveProperty('ssid');
    expect(event).not.toHaveProperty('password');
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(WIFI_PASSWORD);
    expect(serialized).not.toContain(WIFI_SSID);
    // A generic, non-identifying summary is still allowed.
    expect(typeof event.summary === 'string' && event.summary.length > 0).toBe(true);
  });

  test('every stored event gets a unique uuid', () => {
    const parsed = parseQRPayload(URL_RAW);
    const first = toStorableHistoryEvent(parsed, ACCEPTED_AT);
    const second = toStorableHistoryEvent(parsed, ACCEPTED_AT);
    expect(first.id).not.toBe(second.id);
    expect(randomHistoryId()).toMatch(UUID_RE);
    expect(randomHistoryId()).not.toBe(randomHistoryId());
  });
});
