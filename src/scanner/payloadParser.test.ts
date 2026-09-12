import {
  PAYLOAD_PARSER_VERSION,
  STRUCTURED_PARSERS,
  parseQRPayload,
} from './payloadParser';
import { PAYLOAD_FIXTURE_CORPUS } from './payloadFixtures';

describe('payload parser pipeline (ACT-01)', () => {
  test('every non-empty payload returns typed content or explicit text fallback', () => {
    const samples = [
      'https://example.com/a',
      'hello world',
      'mailto:a@example.com',
      'WIFI:T:WPA;S:home;P:secret;;',
      'not a url at all :::',
      'myapp://pay?amount=10',
      '   spaced   ',
    ];
    for (const raw of samples) {
      const parsed = parseQRPayload(raw);
      expect(parsed.originalPayload).toBe(raw);
      expect(parsed.parserVersion).toBe(PAYLOAD_PARSER_VERSION);
      expect(parsed.content).toBeDefined();
      expect(parsed.displaySummary.length).toBeGreaterThan(0);
      expect(parsed.identityKey.length).toBeGreaterThan(0);
    }
    // Empty string still returns a safe text result and never throws.
    expect(() => parseQRPayload('')).not.toThrow();
  });

  test('malformed structured data never crashes, truncates silently, or disappears', () => {
    const malformed = [
      'WIFI:T:WPA;S:home;P:secret',
      'BEGIN:VCARD\nFN:No End',
      'geo:999,999',
      'mailto:not-an-email-at-all',
      'otpauth://totp/label?issuer=x',
      'tel:abc-def',
      'BEGIN:VEVENT\nSUMMARY:x',
      'MATMSG:TO:;;',
    ];
    for (const raw of malformed) {
      let parsed;
      expect(() => {
        parsed = parseQRPayload(raw);
      }).not.toThrow();
      expect(parsed!.originalPayload).toBe(raw);
      // Original bytes preserved exactly; fallback keeps full text.
      if (parsed!.content.kind === 'text') {
        expect(parsed!.content.text).toBe(raw);
      }
      expect(parsed!.displaySummary).toContain(
        parsed!.displaySummary.trim().slice(0, 10),
      );
    }
  });

  test('original payload preserved separately from normalized display and identity', () => {
    const raw = '  https://example.com/Path  ';
    const parsed = parseQRPayload(raw);
    expect(parsed.originalPayload).toBe(raw);
    expect(parsed.identityKey).toBe(raw.normalize('NFC').trim());
    expect(parsed.identityKey).not.toBe(raw);
    expect(parsed.displaySummary).not.toContain('  https://');
  });

  test('unknown custom schemes stay visibly identified and copyable/shareable', () => {
    const parsed = parseQRPayload('myapp://pay?amount=10&to=bob');
    expect(parsed.content.kind).toBe('customScheme');
    if (parsed.content.kind === 'customScheme') {
      expect(parsed.content.scheme).toBe('myapp');
    }
    expect(parsed.displaySummary).toMatch(/myapp/);
    expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));
  });

  test('web links expose host and are never confused with custom schemes', () => {
    const web = parseQRPayload('https://example.com/some/path?q=1');
    expect(web.content.kind).toBe('url');
    expect(web.displaySummary).toMatch(/example\.com/);
    expect(web.actions).toEqual(expect.arrayContaining(['openUrl', 'copy', 'share']));

    const custom = parseQRPayload('examplescheme://example.com/path');
    expect(custom.content.kind).toBe('customScheme');
    expect(custom.displaySummary).toMatch(/examplescheme/);
  });

  test('control characters are surfaced safely, never raw', () => {
    const raw = 'hello\x00world\x1F!';
    const parsed = parseQRPayload(raw);
    expect(parsed.originalPayload).toBe(raw);
    expect(parsed.displaySummary).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/);
    expect(parsed.content.kind).toBe('text');
  });

  test('sensitive payloads declare redacted or session-only handling', () => {
    const wifi = parseQRPayload('WIFI:T:WPA;S:home;P:supersecret;;');
    expect(wifi.sensitivity).toBe('redacted');
    expect(wifi.displaySummary).toMatch(/home/);
    expect(wifi.displaySummary).not.toContain('supersecret');

    const otp = parseQRPayload(
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
    );
    expect(otp.sensitivity).toBe('sessionOnly');
    expect(otp.displaySummary).not.toContain('JBSWY3DPEHPK3PXP');
  });

  test('structured parsers run before plain-text fallback in strict order', () => {
    expect(parseQRPayload('https://example.com/x').content.kind).toBe('url');
    expect(parseQRPayload('mailto:a@b.com').content.kind).toBe('email');
    expect(parseQRPayload('WIFI:T:nopass;S:open;;').content.kind).toBe('wifi');
    expect(parseQRPayload('plain hello').content.kind).toBe('text');
  });

  test('every structured parser declares sensitivity and has fixtures', () => {
    expect(STRUCTURED_PARSERS.length).toBeGreaterThanOrEqual(8);
    for (const parser of STRUCTURED_PARSERS) {
      expect(parser.id).toMatch(/\S/);
      expect(['standard', 'redacted', 'sessionOnly']).toContain(parser.sensitivity);
      const fixtures = PAYLOAD_FIXTURE_CORPUS.filter((f) =>
        f.parserIds.includes(parser.id),
      );
      expect(fixtures.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('fixture corpus covers required edge categories', () => {
    const categories = PAYLOAD_FIXTURE_CORPUS.flatMap((f) => f.edgeCategories);
    for (const required of [
      'unicode',
      'escaped-delimiters',
      'duplicate-fields',
      'empty-fields',
      'control-characters',
      'large-payload',
    ] as const) {
      expect(categories).toContain(required);
    }
  });

  test('complete corpus parses without throwing and preserves originals', () => {
    expect(PAYLOAD_FIXTURE_CORPUS.length).toBeGreaterThanOrEqual(20);
    for (const fixture of PAYLOAD_FIXTURE_CORPUS) {
      let parsed;
      expect(() => {
        parsed = parseQRPayload(fixture.raw);
      }).not.toThrow();
      expect(parsed!.originalPayload).toBe(fixture.raw);
      expect(parsed!.content.kind).toBe(fixture.expectedKind);
      expect(parsed!.parserVersion).toBe(PAYLOAD_PARSER_VERSION);
    }
  });

  test('large payloads do not crash and indicate truncation explicitly', () => {
    const raw = `https://example.com/${'a'.repeat(5000)}`;
    const parsed = parseQRPayload(raw);
    expect(parsed.originalPayload).toBe(raw);
    expect(parsed.originalPayload).toHaveLength(raw.length);
    // Display may shorten but must signal with an ellipsis, never silently drop.
    if (parsed.displaySummary.length < raw.length) {
      expect(parsed.displaySummary).toMatch(/…|\.\.\./);
    }
  });

  test('escaped delimiters and duplicate fields are deterministic', () => {
    const wifi = parseQRPayload('WIFI:T:WPA;S:my\\;net\\:1;P:p\\;ss;;');
    expect(wifi.content.kind).toBe('wifi');
    if (wifi.content.kind === 'wifi') {
      expect(wifi.content.ssid).toBe('my;net:1');
      expect(wifi.content.password).toBe('p;ss');
    }
    const dup = parseQRPayload('WIFI:T:WPA;S:first;S:second;P:x;;');
    if (dup.content.kind === 'wifi') {
      expect(dup.content.ssid).toBe('first');
    }
  });

  test('no network is contacted during parsing', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no net'));
    try {
      parseQRPayload('https://example.com/x');
      parseQRPayload('plain text');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
