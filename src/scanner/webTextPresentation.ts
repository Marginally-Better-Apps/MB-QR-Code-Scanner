import type { ParsedQRPayload } from './payloadParser';

export const WEB_HOST_MAX_LENGTH = 253;
export const WEB_PATH_PREVIEW_MAX_LENGTH = 80;
export const VISIBLE_TEXT_MAX_LENGTH = 120;

export type ResultViewModel =
  | {
      kind: 'web';
      host: string;
      pathPreview: string;
      fullDestination: string;
    }
  | { kind: 'text'; preview: string; full: string }
  | {
      kind: 'custom';
      scheme: string;
      remainderPreview: string;
      full: string;
    }
  | { kind: 'other'; preview: string; full: string };

const BIDI_AND_INVISIBLE_RE =
  // eslint-disable-next-line no-misleading-character-class
  /[\u2028\u2029\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g;
const CONTROL_RE = /[\x00-\x1F\x7F]/g;

function normalizeInput(value: string): string {
  try {
    return value.normalize('NFC');
  } catch {
    return value;
  }
}

/**
 * Neutralize characters that could impersonate hidden UI text or break layout.
 * Controls, newlines, bidi overrides, zero-width and BOM become U+FFFD.
 */
export function sanitizeVisibleText(value: string, maxLength = VISIBLE_TEXT_MAX_LENGTH): string {
  const normalized = normalizeInput(value).trim();
  if (normalized.length === 0) {
    return '';
  }
  const neutralized = normalized.replace(BIDI_AND_INVISIBLE_RE, '�').replace(CONTROL_RE, '�');
  if (neutralized.length <= maxLength) {
    return neutralized;
  }
  return `${neutralized.slice(0, maxLength - 1)}…`;
}

function sanitizeHost(hostport: string): string {
  const cleaned = normalizeInput(hostport).trim().toLowerCase();
  const neutralized = cleaned.replace(BIDI_AND_INVISIBLE_RE, '�').replace(CONTROL_RE, '�');
  const ascii = toAsciiHostport(neutralized);
  if (ascii.length <= WEB_HOST_MAX_LENGTH) {
    return ascii;
  }
  return `${ascii.slice(0, WEB_HOST_MAX_LENGTH - 1)}…`;
}

/**
 * Normalize a host (optionally with :port or [ipv6]) to ASCII.
 * Unicode labels become Punycode (`xn--…`) so a confusable host can never
 * render as plain Unicode and impersonate a trusted site. Pure-ASCII input
 * passes through unchanged (lowercased). No network involved.
 */
function toAsciiHostport(hostport: string): string {
  let host = hostport;
  let port = '';
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close >= 0) {
      port = host.slice(close + 1);
      host = host.slice(0, close + 1);
    }
  } else {
    const colon = host.lastIndexOf(':');
    if (colon >= 0 && /^[0-9]+$/.test(host.slice(colon + 1))) {
      port = host.slice(colon);
      host = host.slice(0, colon);
    }
  }
  if (host.endsWith('.') && host.length > 1) {
    host = host.slice(0, -1);
  }
  // IPv6 literals and pure-ASCII hosts need no encoding.
  if (host.startsWith('[') || /^[\x00-\x7f]*$/.test(host)) {
    return `${host}${port}`;
  }
  const labels = host.split('.').map((label) => {
    if (label.length === 0 || /^[\x00-\x7f]*$/.test(label)) {
      return label;
    }
    return `xn--${punycodeEncode(label)}`;
  });
  return `${labels.join('.')}${port}`;
}

function ucs2decode(input: string): number[] {
  const output: number[] = [];
  let i = 0;
  while (i < input.length) {
    const value = input.charCodeAt(i);
    i += 1;
    if (value >= 0xd800 && value <= 0xdbff && i < input.length) {
      const extra = input.charCodeAt(i);
      if (extra >= 0xdc00 && extra <= 0xdfff) {
        output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
        i += 1;
        continue;
      }
    }
    output.push(value);
  }
  return output;
}

function digitToBasic(digit: number): string {
  // 0-25 → a-z, 26-35 → 0-9
  return String.fromCharCode(digit + 22 + 75 * (digit < 26 ? 1 : 0));
}

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / 700) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > 455) {
    d = Math.floor(d / 35);
    k += 36;
  }
  return k + Math.floor((36 * d) / (d + 38));
}

function punycodeEncode(input: string): string {
  const codePoints = ucs2decode(input);
  let output = '';
  let n = 128;
  let delta = 0;
  let bias = 72;

  const basic: number[] = codePoints.filter((code) => code < 128);
  let h = basic.length;
  const b = basic.length;
  for (const code of basic) {
    output += String.fromCharCode(code);
  }
  if (b > 0) {
    output += '-';
  }

  while (h < codePoints.length) {
    let m = Number.MAX_SAFE_INTEGER;
    for (const code of codePoints) {
      if (code >= n && code < m) {
        m = code;
      }
    }
    delta += (m - n) * (h + 1);
    n = m;
    for (const code of codePoints) {
      if (code < n) {
        delta += 1;
      }
      if (code === n) {
        let q = delta;
        for (let k = 36; ; k += 36) {
          const t = Math.max(1, Math.min(26, k - bias));
          if (q < t) {
            break;
          }
          output += digitToBasic(t + ((q - t) % (36 - t)));
          q = Math.floor((q - t) / (36 - t));
        }
        output += digitToBasic(q);
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        h += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}

function sanitizePath(path: string, maxLength = WEB_PATH_PREVIEW_MAX_LENGTH): string {
  const normalized = normalizeInput(path);
  const neutralized = normalized.replace(BIDI_AND_INVISIBLE_RE, '�').replace(CONTROL_RE, '�');
  if (neutralized.length <= maxLength) {
    return neutralized;
  }
  return `${neutralized.slice(0, maxLength - 1)}…`;
}

export function describeResultForDisplay(parsed: ParsedQRPayload): ResultViewModel {
  const { content } = parsed;
  switch (content.kind) {
    case 'url': {
      return {
        kind: 'web',
        host: sanitizeHost(content.host),
        pathPreview: sanitizePath(content.path || '/'),
        fullDestination: content.url,
      };
    }
    case 'text': {
      return {
        kind: 'text',
        preview: sanitizeVisibleText(content.text),
        full: content.text,
      };
    }
    case 'customScheme': {
      return {
        kind: 'custom',
        scheme: sanitizeVisibleText(content.scheme.toLowerCase(), 32),
        remainderPreview: sanitizePath(content.remainder, WEB_PATH_PREVIEW_MAX_LENGTH),
        full: `${content.scheme}:${content.remainder}`,
      };
    }
    default: {
      return {
        kind: 'other',
        preview: sanitizeVisibleText(parsed.displaySummary),
        full: parsed.originalPayload,
      };
    }
  }
}
