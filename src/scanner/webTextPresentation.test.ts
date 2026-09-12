import { parseQRPayload } from './payloadParser';
import {
  describeResultForDisplay,
  sanitizeVisibleText,
} from './webTextPresentation';

describe('web/text safe presentation (ACT-02)', () => {
  test('web result exposes a normalized host with inspectable path', () => {
    const parsed = parseQRPayload('https://EXAMPLE.com/Some/Path?q=1#frag');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('web');
    if (view.kind !== 'web') {
      throw new Error('expected web view-model');
    }
    expect(view.host).toBe('example.com');
    expect(view.fullDestination).toMatch(/^https:\/\/example\.com\//);
    expect(view.pathPreview.length).toBeGreaterThan(0);
  });

  test('unicode hosts normalize to punycode and never impersonate', () => {
    const parsed = parseQRPayload('https://münchen.de/Grüße?q=café');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('web');
    if (view.kind !== 'web') {
      throw new Error('expected web view-model');
    }
    // Normalized ASCII host stays visible; raw unicode must not render as-is.
    expect(view.host).toMatch(/xn--/);
    expect(view.host).not.toMatch(/ü/);
  });

  test('control characters, newlines, and bidi overrides render safely', () => {
    // Newline-injected URL must not parse as web; it falls back to text.
    const injected = parseQRPayload('https://example.com/\nFake Button');
    expect(injected.content.kind).toBe('text');
    const injectedView = describeResultForDisplay(injected);
    expect(injectedView.kind).toBe('text');
    if (injectedView.kind === 'text') {
      expect(injectedView.preview).not.toMatch(/[\n\r]/);
    }

    // Direct sanitizer neutralizes controls, bidi, and zero-width.
    const hostile = 'a\u0000b\u202Ec\u200Bd\uFEFFe\nf\rg';
    const safe = sanitizeVisibleText(hostile);
    expect(safe).not.toMatch(/[\n\r]/);
    expect(safe).not.toContain('\u2028');
    expect(safe).not.toContain('\u2029');
    expect(safe).not.toContain('\u200B');
    expect(safe).not.toContain('\uFEFF');
  });

  test('long paths truncate explicitly without layout abuse', () => {
    const raw = `https://example.com/${'a'.repeat(5000)}`;
    const parsed = parseQRPayload(raw);
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('web');
    if (view.kind !== 'web') {
      throw new Error('expected web view-model');
    }
    expect(view.pathPreview.length).toBeLessThan(raw.length);
    expect(view.pathPreview).toMatch(/…/);
    expect(view.host.length).toBeLessThan(256);
  });

  test('plain text stays safe, complete, and copyable', () => {
    const parsed = parseQRPayload('Hello plain text');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('text');
    if (view.kind !== 'text') {
      throw new Error('expected text view-model');
    }
    expect(view.preview).toContain('Hello');
    expect(parsed.actions).toEqual(expect.arrayContaining(['copy', 'share']));
  });

  test('custom schemes are labeled by scheme and never styled as websites', () => {
    const parsed = parseQRPayload('myapp://pay?amount=10&to=bob');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('custom');
    if (view.kind !== 'custom') {
      throw new Error('expected custom view-model');
    }
    expect(view.scheme).toBe('myapp');
    expect(view).not.toHaveProperty('host');
  });

  test('sanitizer never returns raw controls and always truncates with ellipsis', () => {
    expect(sanitizeVisibleText('')).toBe('');
    expect(sanitizeVisibleText('  hello  ')).toBe('hello');
    const long = sanitizeVisibleText('x'.repeat(5000), 120);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long).toMatch(/…$/);
  });
});
