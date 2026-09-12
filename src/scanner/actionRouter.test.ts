import { parseQRPayload } from './payloadParser';
import { dispatchResultAction } from './actionRouter';

function mockDeps() {
  return {
    openURL: jest.fn(async (_url: string) => {}),
    copyText: jest.fn(async (_text: string) => {}),
    shareText: jest.fn(async (_text: string) => {}),
    canOpenURL: jest.fn(async (_url: string) => true),
    capabilities: {
      composeEmail: true,
      call: true,
      sendSms: true,
      openLocation: true,
    },
  };
}

describe('ActionRouter (ACT-02)', () => {
  test('openUrl routes an https URL through system routing on explicit dispatch', async () => {
    const parsed = parseQRPayload('https://example.com/some/path?q=1');
    expect(parsed.content.kind).toBe('url');
    const deps = mockDeps();

    await dispatchResultAction(parsed, 'openUrl', deps);

    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\//),
    );
    expect(deps.copyText).not.toHaveBeenCalled();
    expect(deps.shareText).not.toHaveBeenCalled();
  });

  test('openUrl rejects non-web content and never opens', async () => {
    const text = parseQRPayload('just plain text');
    const deps = mockDeps();

    await expect(dispatchResultAction(text, 'openUrl', deps)).rejects.toThrow();
    expect(deps.openURL).not.toHaveBeenCalled();
  });

  test('javascript: and data: payloads never route through openUrl', async () => {
    for (const raw of ['javascript:alert(1)', 'data:text/html,<h1>hi</h1>']) {
      const parsed = parseQRPayload(raw);
      expect(parsed.content.kind).not.toBe('url');
      const deps = mockDeps();
      await expect(dispatchResultAction(parsed, 'openUrl', deps)).rejects.toThrow();
      expect(deps.openURL).not.toHaveBeenCalled();
    }
  });

  test('copy and share deliver the exact original payload for text and URLs', async () => {
    for (const raw of ['Hello plain text', 'https://example.com/a?x=1', 'myapp://pay?amount=10']) {
      const parsed = parseQRPayload(raw);
      const copyDeps = mockDeps();
      await dispatchResultAction(parsed, 'copy', copyDeps);
      expect(copyDeps.copyText).toHaveBeenCalledWith(raw);

      const shareDeps = mockDeps();
      await dispatchResultAction(parsed, 'share', shareDeps);
      expect(shareDeps.shareText).toHaveBeenCalledWith(raw);
      expect(shareDeps.openURL).not.toHaveBeenCalled();
    }
  });

  test('openApp routes custom schemes through system routing with the raw payload', async () => {
    const parsed = parseQRPayload('myapp://pay?amount=10&to=bob');
    expect(parsed.content.kind).toBe('customScheme');
    const deps = mockDeps();

    await dispatchResultAction(parsed, 'openApp', deps);

    expect(deps.openURL).toHaveBeenCalledTimes(1);
    expect(deps.openURL).toHaveBeenCalledWith('myapp://pay?amount=10&to=bob');
  });

  test('composeEmail builds a mailto URL from parsed fields and never auto-launches', async () => {
    const parsed = parseQRPayload('mailto:alice@example.com?subject=Hello%20there&body=Line%201');
    expect(parsed.content.kind).toBe('email');
    const deps = mockDeps();

    expect(deps.openURL).not.toHaveBeenCalled();
    await dispatchResultAction(parsed, 'composeEmail', deps);

    expect(deps.openURL).toHaveBeenCalledTimes(1);
    const url = String(deps.openURL.mock.calls[0][0]);
    expect(url).toMatch(/^mailto:alice@example\.com\?/);
    expect(url).toContain('subject=Hello%20there');
    expect(url).toContain('body=Line%201');
    expect(deps.copyText).not.toHaveBeenCalled();
  });

  test('MATMSG composeEmail keeps escaped subject and body in the mailto URL', async () => {
    const parsed = parseQRPayload(
      'MATMSG:TO:bob@example.com;SUB:Hi\\;there;BODY:Hello\\;world;;',
    );
    const deps = mockDeps();

    await dispatchResultAction(parsed, 'composeEmail', deps);

    const url = String(deps.openURL.mock.calls[0][0]);
    expect(url).toMatch(/^mailto:bob@example\.com\?/);
    expect(url).toContain(encodeURIComponent('Hi;there'));
    expect(url).toContain(encodeURIComponent('Hello;world'));
  });

  test('call builds a tel URL from the original number without changing the payload', async () => {
    const raw = 'tel:+1 (415) 555-2671';
    const parsed = parseQRPayload(raw);
    expect(parsed.originalPayload).toBe(raw);
    const deps = mockDeps();

    await dispatchResultAction(parsed, 'call', deps);

    expect(deps.openURL).toHaveBeenCalledWith('tel:+14155552671');
    expect(parsed.originalPayload).toBe(raw);
  });

  test('sendSms builds an Apple sms URL with recipient and body', async () => {
    const parsed = parseQRPayload('sms:+14155552671?body=Hello%20there');
    const deps = mockDeps();

    await dispatchResultAction(parsed, 'sendSms', deps);

    expect(deps.openURL).toHaveBeenCalledWith('sms:+14155552671&body=Hello%20there');
  });

  test('openLocation builds an Apple Maps URL with coordinates and query', async () => {
    const parsed = parseQRPayload('geo:48.8566,2.3522?q=Eiffel+Tower');
    const deps = mockDeps();

    await dispatchResultAction(parsed, 'openLocation', deps);

    const url = String(deps.openURL.mock.calls[0][0]);
    expect(url).toMatch(/^http:\/\/maps\.apple\.com\/\?/);
    expect(url).toContain('ll=48.8566,2.3522');
    expect(url).toContain('q=Eiffel');
  });

  test('unavailable capabilities refuse primary dispatch and leave copy and share working', async () => {
    const cases: Array<{ raw: string; action: 'composeEmail' | 'call' | 'sendSms' | 'openLocation' }> =
      [
        { raw: 'mailto:alice@example.com?subject=Hi', action: 'composeEmail' },
        { raw: 'tel:+14155552671', action: 'call' },
        { raw: 'sms:+14155552671?body=Hi', action: 'sendSms' },
        { raw: 'geo:37.7749,-122.4194', action: 'openLocation' },
      ];

    for (const { raw, action } of cases) {
      const parsed = parseQRPayload(raw);
      const blocked = mockDeps();
      blocked.canOpenURL = jest.fn(async () => false);
      blocked.capabilities = {
        composeEmail: false,
        call: false,
        sendSms: false,
        openLocation: false,
      };

      await expect(dispatchResultAction(parsed, action, blocked)).rejects.toThrow(/unavailable/i);
      expect(blocked.openURL).not.toHaveBeenCalled();

      const copyDeps = mockDeps();
      await dispatchResultAction(parsed, 'copy', copyDeps);
      expect(copyDeps.copyText).toHaveBeenCalledWith(raw);

      const shareDeps = mockDeps();
      await dispatchResultAction(parsed, 'share', shareDeps);
      expect(shareDeps.shareText).toHaveBeenCalledWith(raw);
    }
  });

  test('communications actions require matching parsed content', async () => {
    const text = parseQRPayload('just plain text');
    const deps = mockDeps();
    for (const action of ['composeEmail', 'call', 'sendSms', 'openLocation'] as const) {
      await expect(dispatchResultAction(text, action, deps)).rejects.toThrow();
      expect(deps.openURL).not.toHaveBeenCalled();
    }
  });

  test('router performs no network fetch and has no side effects on import', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no net'));
    try {
      const parsed = parseQRPayload('https://example.com/x');
      expect(fetchSpy).not.toHaveBeenCalled();
      const deps = mockDeps();
      // Merely describing actions must not trigger anything.
      expect(parsed.actions).toEqual(expect.arrayContaining(['openUrl', 'copy', 'share']));
      expect(deps.openURL).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
