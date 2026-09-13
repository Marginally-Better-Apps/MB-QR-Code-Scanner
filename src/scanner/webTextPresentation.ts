import { toAsciiHostport } from './hostEncoding';
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
  | {
      kind: 'email';
      to: string;
      subject: string;
      body: string;
      full: string;
    }
  | {
      kind: 'phone';
      displayNumber: string;
      originalNumber: string;
      full: string;
    }
  | {
      kind: 'sms';
      displayNumber: string;
      message: string;
      full: string;
    }
  | {
      kind: 'geo';
      latitude: string;
      longitude: string;
      query: string | null;
      full: string;
    }
  | {
      kind: 'contact';
      name: string | null;
      organization: string | null;
      phones: string[];
      emails: string[];
      addresses: string[];
      urls: string[];
      full: string;
    }
  | {
      kind: 'calendar';
      title: string;
      whenLabel: string;
      location: string | null;
      full: string;
    }
  | {
      kind: 'wifi';
      ssid: string;
      security: string;
      passwordMasked: string | null;
      hidden: boolean;
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

function escapeWifiField(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;');
}

/**
 * Rebuild a Wi-Fi payload without the password (QLT-05). The expanded
 * detail and compat nodes render `full`, so returning the raw payload here
 * would expose the password outside the masked preview. SSID and security
 * stay because they are already shown on screen by explicit display policy.
 */
export function redactedWifiPayload(
  content: Extract<ParsedQRPayload['content'], { kind: 'wifi' }>,
): string {
  const hidden = content.hidden ? ';H:true' : '';
  return `WIFI:T:${escapeWifiField(content.security)};S:${escapeWifiField(content.ssid)}${hidden};;`;
}

function sanitizePath(path: string, maxLength = WEB_PATH_PREVIEW_MAX_LENGTH): string {
  const normalized = normalizeInput(path);
  const neutralized = normalized.replace(BIDI_AND_INVISIBLE_RE, '�').replace(CONTROL_RE, '�');
  if (neutralized.length <= maxLength) {
    return neutralized;
  }
  return `${neutralized.slice(0, maxLength - 1)}…`;
}

/**
 * Keep the original number on the payload. Display may regroup digits.
 * NANP +1 numbers become `+1 NXX NXX XXXX`.
 */
export function normalizePhoneForDisplay(number: string): string {
  const trimmed = number.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) {
    return sanitizeVisibleText(trimmed);
  }
  if (hasPlus && digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (!hasPlus && digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (hasPlus && digits.length === 10) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return hasPlus ? `+${digits}` : digits;
}

function calendarWhenLabel(
  content: Extract<ParsedQRPayload['content'], { kind: 'calendar' }>,
): string {
  const start = content.start ?? '';
  if (content.timeKind === 'allDay') {
    return sanitizeVisibleText(`All day ${start}`);
  }
  if (content.timeKind === 'utc') {
    return sanitizeVisibleText(`UTC ${start}`);
  }
  if (content.timeKind === 'namedZone' && content.timeZone) {
    return sanitizeVisibleText(`${content.timeZone} ${start}`);
  }
  return sanitizeVisibleText(`Local ${start}`);
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
    case 'email': {
      return {
        kind: 'email',
        to: sanitizeVisibleText(content.to),
        subject: sanitizeVisibleText(content.subject),
        body: sanitizeVisibleText(content.body, VISIBLE_TEXT_MAX_LENGTH),
        full: parsed.originalPayload,
      };
    }
    case 'phone': {
      return {
        kind: 'phone',
        displayNumber: normalizePhoneForDisplay(content.number),
        originalNumber: content.number,
        full: parsed.originalPayload,
      };
    }
    case 'sms': {
      return {
        kind: 'sms',
        displayNumber: normalizePhoneForDisplay(content.number),
        message: sanitizeVisibleText(content.message, VISIBLE_TEXT_MAX_LENGTH),
        full: parsed.originalPayload,
      };
    }
    case 'geo': {
      return {
        kind: 'geo',
        latitude: String(content.latitude),
        longitude: String(content.longitude),
        query: content.query ? sanitizeVisibleText(content.query) : null,
        full: parsed.originalPayload,
      };
    }
    case 'contact': {
      return {
        kind: 'contact',
        name: content.name ? sanitizeVisibleText(content.name) : null,
        organization: content.organization
          ? sanitizeVisibleText(content.organization)
          : null,
        phones: content.phones.map((phone) => normalizePhoneForDisplay(phone)),
        emails: content.emails.map((email) => sanitizeVisibleText(email)),
        addresses: content.addresses.map((address) => sanitizeVisibleText(address)),
        urls: content.urls.map((url) => sanitizeVisibleText(url)),
        full: parsed.originalPayload,
      };
    }
    case 'calendar': {
      return {
        kind: 'calendar',
        title: sanitizeVisibleText(content.title ?? 'Calendar event'),
        whenLabel: calendarWhenLabel(content),
        location: content.location ? sanitizeVisibleText(content.location) : null,
        full: parsed.originalPayload,
      };
    }
    case 'wifi': {
      return {
        kind: 'wifi',
        ssid: sanitizeVisibleText(content.ssid),
        security: sanitizeVisibleText(content.security),
        passwordMasked: content.hasPassword ? '••••••••' : null,
        hidden: content.hidden,
        full: redactedWifiPayload(content),
      };
    }
    case 'otp':
    case 'passkey': {
      const safe = sanitizeVisibleText(parsed.displaySummary);
      return {
        kind: 'other',
        preview: safe,
        full: safe,
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
