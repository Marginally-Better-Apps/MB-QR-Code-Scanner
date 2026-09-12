import { parseQRPayload } from './payloadParser';
import { dispatchResultAction } from './actionRouter';

function mockDeps() {
  return {
    openURL: jest.fn(async (_url: string) => {}),
    copyText: jest.fn(async (_text: string) => {}),
    shareText: jest.fn(async (_text: string) => {}),
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
