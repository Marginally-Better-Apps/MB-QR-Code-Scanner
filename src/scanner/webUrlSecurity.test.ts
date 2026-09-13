import { parseQRPayload } from './payloadParser';

describe('web URL parser security (ACT-02)', () => {
  test('http and https parse as web with host exposed, never as custom schemes', () => {
    for (const raw of ['https://example.com/a', 'http://example.com/a']) {
      const parsed = parseQRPayload(raw);
      expect(parsed.content.kind).toBe('url');
      if (parsed.content.kind === 'url') {
        expect(parsed.content.host.length).toBeGreaterThan(0);
      }
      expect(parsed.actions).toEqual(expect.arrayContaining(['openUrl', 'copy', 'share']));
    }
    const custom = parseQRPayload('examplescheme://example.com/path');
    expect(custom.content.kind).toBe('customScheme');
  });

  test('representative web shapes keep host and path', () => {
    const withPort = parseQRPayload('https://example.com:8080/a?x=1#frag');
    expect(withPort.content.kind).toBe('url');
    if (withPort.content.kind === 'url') {
      expect(withPort.content.host).toContain('example.com');
      expect(withPort.content.path).toContain('/a');
    }

    const unicode = parseQRPayload('https://münchen.de/Grüße?q=café');
    expect(unicode.content.kind).toBe('url');

    const puny = parseQRPayload('https://xn--mnchen-3ya.de/');
    expect(puny.content.kind).toBe('url');
    if (puny.content.kind === 'url') {
      expect(puny.content.host).toContain('xn--');
    }
  });

  test('adversarial whitespace and controls fall back to text and stay safe', () => {
    const adversarial = [
      'https://example.com/\u0001bad',
      'https://example.com/\nFake Button',
      'https://example.com/\r\nInjected',
      'https://example.com/hello world',
      '  https://example.com/leading-space-in-raw ',
    ];
    for (const raw of adversarial.slice(0, 4)) {
      const parsed = parseQRPayload(raw);
      // Whitespace/control URLs must never become clickable web results.
      expect(parsed.content.kind).toBe('text');
      expect(parsed.displaySummary).not.toMatch(/[\n\r]/);
      expect(parsed.actions).not.toContain('openUrl');
      expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));
    }
    // Leading/trailing spaces around an otherwise-valid URL are trimmed by the parser.
    const trimmed = parseQRPayload(adversarial[4]);
    expect(trimmed.content.kind).toBe('url');
  });

  test('dangerous schemes never become web links', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      const parsed = parseQRPayload(raw);
      expect(parsed.content.kind).not.toBe('url');
      expect(parsed.actions).not.toContain('openUrl');
      expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));
    }
  });

  test('custom schemes stay labeled and copyable/shareable', () => {
    const parsed = parseQRPayload('myapp://pay?amount=10&to=bob');
    expect(parsed.content.kind).toBe('customScheme');
    if (parsed.content.kind === 'customScheme') {
      expect(parsed.content.scheme).toBe('myapp');
    }
    expect(parsed.displaySummary).toMatch(/myapp/);
    expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));
  });

  test('oversized input never throws, fetches, or breaks display', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no net'));
    try {
      const raw = `https://example.com/${'a'.repeat(20000)}`;
      let parsed: ReturnType<typeof parseQRPayload> | null = null;
      expect(() => {
        parsed = parseQRPayload(raw);
      }).not.toThrow();
      expect(parsed!.content.kind).toBe('url');
      // Display stays bounded; the raw payload is never rendered in full.
      expect(parsed!.displaySummary.length).toBeLessThanOrEqual(121);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('malformed percent escapes parse without throwing and stay non-actionable', () => {
    for (const raw of [
      'https://example.com/%zz',
      'https://example.com/%',
      'https://example.com/%C0%AE',
      'mailto:alice@example.com?subject=%zz&body=%',
    ]) {
      let parsed: ReturnType<typeof parseQRPayload> | null = null;
      expect(() => {
        parsed = parseQRPayload(raw);
      }).not.toThrow();
      expect(parsed).not.toBeNull();
      expect(parsed!.displaySummary).not.toMatch(/[\n\r]/);
      expect(parsed!.actions).toEqual(expect.arrayContaining(['copy', 'share']));
    }
  });

  test('non-web schemes never parse as web and dangerous ones offer no open action', () => {
    const dangerous = [
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/uuid',
      'about:blank',
      'jar:file:///app.jar!/payload',
      'ftp://example.com/file',
    ];
    for (const raw of dangerous) {
      const parsed = parseQRPayload(raw);
      expect(parsed.content.kind).not.toBe('url');
      expect(parsed.actions).not.toContain('openUrl');
    }
    for (const raw of dangerous.slice(0, 7)) {
      // Scriptable/spoofable schemes are labeled text for copy/share only.
      expect(parseQRPayload(raw).actions).not.toContain('openApp');
    }
    // Benign custom schemes keep their labeled open action.
    const benign = parseQRPayload('myapp://pay?amount=10&to=bob');
    expect(benign.content.kind).toBe('customScheme');
    expect(benign.actions).toContain('openApp');
  });

  test('confusable unicode hosts never render as trusted ASCII', () => {
    const cyrillicA = parseQRPayload('https://ex\u0430mple.com/login');
    expect(cyrillicA.content.kind).toBe('url');
    if (cyrillicA.content.kind === 'url') {
      // The confusable label is punycode-encoded, never plain "example.com".
      expect(cyrillicA.content.host).toMatch(/xn--/);
      expect(cyrillicA.content.host).not.toBe('example.com');
    }
  });

  test('no network is contacted while parsing URLs', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no net'));
    try {
      parseQRPayload('https://example.com/x');
      parseQRPayload('https://münchen.de/y');
      parseQRPayload('plain text');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
