import { parseQRPayload } from './payloadParser';
import {
  describeResultForDisplay,
  redactedWifiPayload,
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

  test('email preview shows recipient, subject, and body before any handoff', () => {
    const parsed = parseQRPayload(
      'mailto:alice@example.com?subject=Hello%20there&body=Line%201',
    );
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('email');
    if (view.kind !== 'email') {
      throw new Error('expected email view-model');
    }
    expect(view.to).toBe('alice@example.com');
    expect(view.subject).toBe('Hello there');
    expect(view.body).toBe('Line 1');
    expect(view.full).toBe(parsed.originalPayload);
  });

  test('phone preview normalizes digits for display without changing the original', () => {
    const raw = 'tel:+1 (415) 555-2671';
    const parsed = parseQRPayload(raw);
    expect(parsed.originalPayload).toBe(raw);
    if (parsed.content.kind === 'phone') {
      expect(parsed.content.number).toBe('+1 (415) 555-2671');
    }
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('phone');
    if (view.kind !== 'phone') {
      throw new Error('expected phone view-model');
    }
    expect(view.displayNumber).toBe('+1 415 555 2671');
    expect(view.originalNumber).toBe('+1 (415) 555-2671');
    expect(view.full).toBe(raw);
  });

  test('SMS preview shows destination and prefilled body', () => {
    const parsed = parseQRPayload('sms:+14155552671?body=Hello%20there');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('sms');
    if (view.kind !== 'sms') {
      throw new Error('expected sms view-model');
    }
    expect(view.displayNumber).toBe('+1 415 555 2671');
    expect(view.message).toBe('Hello there');
    expect(view.full).toBe(parsed.originalPayload);
  });

  test('geo preview shows coordinates and place query', () => {
    const parsed = parseQRPayload('geo:48.8566,2.3522?q=Eiffel+Tower');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('geo');
    if (view.kind !== 'geo') {
      throw new Error('expected geo view-model');
    }
    expect(view.latitude).toBe('48.8566');
    expect(view.longitude).toBe('2.3522');
    expect(view.query).toBe('Eiffel Tower');
    expect(view.full).toBe(parsed.originalPayload);
  });

  test('malformed comms payloads present as text without losing the raw value', () => {
    const raw = 'geo:999,999';
    const parsed = parseQRPayload(raw);
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('text');
    if (view.kind !== 'text') {
      throw new Error('expected text fallback view-model');
    }
    expect(view.full).toBe(raw);
    expect(view.preview).toContain('geo:999,999');
  });

  test('wifi view-model masks the password everywhere including the full payload', () => {
    const raw = 'WIFI:T:WPA;S:HomeNet;P:supersecret;;';
    const parsed = parseQRPayload(raw);
    expect(parsed.content.kind).toBe('wifi');
    const view = describeResultForDisplay(parsed);
    expect(view.kind).toBe('wifi');
    if (view.kind !== 'wifi') {
      throw new Error('expected wifi view-model');
    }
    expect(view.ssid).toBe('HomeNet');
    expect(view.passwordMasked).toBe('••••••••');
    // The expanded detail and compat payload must never carry the password.
    expect(view.full).not.toContain('supersecret');
    expect(view.full).toContain('HomeNet');
    expect(JSON.stringify(view)).not.toContain('supersecret');
  });

  test('redacted wifi payload drops the password but keeps SSID and security', () => {
    const parsed = parseQRPayload('WIFI:T:WPA;S:HomeNet;P:supersecret;H:true;;');
    if (parsed.content.kind !== 'wifi') {
      throw new Error('expected wifi content');
    }
    const redacted = redactedWifiPayload(parsed.content);
    expect(redacted).not.toContain('supersecret');
    expect(redacted).toContain('HomeNet');
    expect(redacted).toContain('WPA');
    const reparsed = parseQRPayload(redacted);
    expect(reparsed.content.kind).toBe('wifi');
    if (reparsed.content.kind === 'wifi') {
      expect(reparsed.content.ssid).toBe('HomeNet');
      expect(reparsed.content.hasPassword).toBe(false);
      expect(reparsed.content.password).toBeNull();
    }
  });

  test('sanitizer never returns raw controls and always truncates with ellipsis', () => {
    expect(sanitizeVisibleText('')).toBe('');
    expect(sanitizeVisibleText('  hello  ')).toBe('hello');
    const long = sanitizeVisibleText('x'.repeat(5000), 120);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long).toMatch(/…$/);
  });
});
