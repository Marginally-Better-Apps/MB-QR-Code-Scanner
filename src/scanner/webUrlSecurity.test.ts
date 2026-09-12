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
