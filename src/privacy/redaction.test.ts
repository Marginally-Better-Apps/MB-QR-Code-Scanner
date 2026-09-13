import { AUTH_QR_FIXTURES } from '@/scanner/authQr';
import { parseQRPayload } from '@/scanner/payloadParser';

import {
  describeForAccessibility,
  diagnosticSummaryForPayload,
  redactForLog,
} from './redaction';

const OTP_RAW = AUTH_QR_FIXTURES.otpauthTotp;
const OTP_SECRET = AUTH_QR_FIXTURES.otpauthSecret;
const WIFI_RAW = 'WIFI:T:WPA;S:home-network;P:supersecret123;;';
const WIFI_PASSWORD = 'supersecret123';
const PEM_RAW = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCtestkeymaterial
-----END PRIVATE KEY-----`;

describe('privacy redaction helpers (QLT-05)', () => {
  test('redactForLog strips OTP secrets, Wi-Fi passwords, and private keys', () => {
    expect(redactForLog(OTP_RAW)).not.toContain(OTP_SECRET);
    expect(redactForLog(OTP_RAW)).toMatch(/\[redacted\]/);
    expect(redactForLog(WIFI_RAW)).not.toContain(WIFI_PASSWORD);
    expect(redactForLog(WIFI_RAW)).toMatch(/\[redacted\]/);
    expect(redactForLog(PEM_RAW)).not.toContain('testkeymaterial');
    expect(redactForLog(PEM_RAW)).toMatch(/\[redacted-private-key\]/);
  });

  test('redactForLog neutralizes controls and truncates long input', () => {
    const hostile = 'https://example.com/\u0000bad\u202Etrick\nnewline';
    const safe = redactForLog(hostile);
    expect(safe).not.toMatch(/[\u0000\n\r\u202E]/);
    const long = redactForLog(`https://example.com/${'a'.repeat(5000)}`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long).toMatch(/…$/);
    expect(redactForLog('https://example.com/ok')).toContain('example.com');
  });

  test('diagnostic summaries carry metadata only, never raw payloads', () => {
    for (const raw of [OTP_RAW, WIFI_RAW, PEM_RAW, 'https://example.com/x']) {
      const parsed = parseQRPayload(raw);
      const summary = diagnosticSummaryForPayload(parsed);
      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain(OTP_SECRET);
      expect(serialized).not.toContain(WIFI_PASSWORD);
      expect(serialized).not.toContain('testkeymaterial');
      expect(serialized).not.toContain(raw);
      expect(summary.kind).toBe(parsed.content.kind);
      expect(summary.sensitivity).toBe(parsed.sensitivity);
      expect(summary.parserVersion).toBe(parsed.parserVersion);
    }
  });

  test('accessibility descriptions never carry secrets or raw session payloads', () => {
    const redactedTitle = 'Sensitive scan';
    const otp = parseQRPayload(OTP_RAW);
    const otpSpoken = describeForAccessibility(otp, redactedTitle);
    expect(otpSpoken).not.toContain(OTP_SECRET);
    expect(otpSpoken).not.toContain(OTP_RAW);
    expect(otpSpoken.length).toBeGreaterThan(0);

    const wifi = parseQRPayload(WIFI_RAW);
    const wifiSpoken = describeForAccessibility(wifi, redactedTitle);
    expect(wifiSpoken).not.toContain(WIFI_PASSWORD);
    expect(wifiSpoken).not.toContain(WIFI_RAW);
    expect(wifiSpoken.length).toBeGreaterThan(0);

    // Unstructured secret blobs collapse to the generic history label.
    const pemSpoken = describeForAccessibility(parseQRPayload(PEM_RAW), redactedTitle);
    expect(pemSpoken).toBe(redactedTitle);
    expect(pemSpoken).not.toContain('testkeymaterial');

    const hostileSpoken = describeForAccessibility(
      parseQRPayload('https://example.com/\u0001bad'),
      redactedTitle,
    );
    expect(hostileSpoken).not.toMatch(/[\u0001]/);
  });
});
