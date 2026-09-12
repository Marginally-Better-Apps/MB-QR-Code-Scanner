export const PAYLOAD_PARSER_VERSION = 1;

export type QRSensitivity = 'standard' | 'redacted' | 'sessionOnly';

export type QRAction =
  | 'copy'
  | 'share'
  | 'openUrl'
  | 'composeEmail'
  | 'call'
  | 'sendSms'
  | 'openLocation'
  | 'addContact'
  | 'addEvent'
  | 'joinWifi'
  | 'authenticate'
  | 'openApp';

export type QRContent =
  | { kind: 'url'; url: string; host: string; path: string }
  | { kind: 'text'; text: string; isFallback: boolean }
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'phone'; number: string }
  | { kind: 'sms'; number: string; message: string }
  | { kind: 'geo'; latitude: number; longitude: number; query: string | null }
  | {
      kind: 'wifi';
      ssid: string;
      security: string;
      hasPassword: boolean;
      password: string | null;
    }
  | {
      kind: 'contact';
      name: string | null;
      phone: string | null;
      email: string | null;
    }
  | {
      kind: 'calendar';
      title: string | null;
      start: string | null;
      end: string | null;
      location: string | null;
    }
  | { kind: 'otp'; label: string | null; issuer: string | null }
  | { kind: 'customScheme'; scheme: string; remainder: string };

export type ParsedQRPayload = {
  originalPayload: string;
  content: QRContent;
  displaySummary: string;
  identityKey: string;
  parserVersion: number;
  sensitivity: QRSensitivity;
  actions: QRAction[];
};

export type StructuredParser = {
  id: string;
  sensitivity: QRSensitivity;
  parse: (raw: string) => QRContent | null;
};

const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
const MAX_DISPLAY_LENGTH = 120;

function hasControls(value: string): boolean {
  return CONTROL_RE.test(value);
}

function sanitizeForDisplay(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '�');
}

function toSafeSummary(value: string, max = MAX_DISPLAY_LENGTH): string {
  const cleaned = sanitizeForDisplay(value.normalize('NFC').trim());
  if (cleaned.length === 0) {
    return 'Empty QR code';
  }
  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, max - 1)}…`;
}

function identityOf(raw: string): string {
  try {
    return raw.normalize('NFC').trim();
  } catch {
    return raw.trim();
  }
}

function tryParseUrl(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || hasControls(trimmed) || /\s/.test(trimmed)) {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return null;
    }
    if (!url.host) {
      return null;
    }
    const path =
      (url.pathname !== '/' ? url.pathname : '') + url.search + url.hash;
    return {
      kind: 'url',
      url: url.href,
      host: url.host,
      path,
    };
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tryParseEmail(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || hasControls(trimmed)) {
    return null;
  }
  if (/^mailto:/i.test(trimmed)) {
    const after = trimmed.slice('mailto:'.length);
    const [toPart, queryPart = ''] = after.split('?');
    const to = toPart.trim();
    if (!EMAIL_RE.test(to)) {
      return null;
    }
    let subject = '';
    let body = '';
    try {
      const params = new URLSearchParams(queryPart);
      subject = params.get('subject') ?? '';
      body = params.get('body') ?? '';
    } catch {
      return null;
    }
    return { kind: 'email', to, subject, body };
  }
  if (/^MATMSG:/i.test(trimmed)) {
    if (!/;;\s*$/.test(trimmed)) {
      return null;
    }
    const inner = trimmed.slice('MATMSG:'.length).replace(/;;\s*$/, '');
    const parts = inner.split(';');
    let to: string | null = null;
    let subject = '';
    let body = '';
    const seen = new Set<string>();
    for (const part of parts) {
      const upper = part.toUpperCase();
      if (upper.startsWith('TO:')) {
        if (!seen.has('TO')) {
          seen.add('TO');
          to = part.slice('TO:'.length);
        }
      } else if (upper.startsWith('SUB:')) {
        if (!seen.has('SUB')) {
          seen.add('SUB');
          subject = part.slice('SUB:'.length);
        }
      } else if (upper.startsWith('BODY:')) {
        if (!seen.has('BODY')) {
          seen.add('BODY');
          body = part.slice('BODY:'.length);
        }
      }
    }
    if (to == null || !EMAIL_RE.test(to.trim())) {
      return null;
    }
    return { kind: 'email', to: to.trim(), subject, body };
  }
  return null;
}

function isPlausiblePhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || hasControls(trimmed)) {
    return false;
  }
  if (!/^[+0-9().\-.\s]+$/.test(trimmed)) {
    return false;
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 3;
}

function tryParsePhone(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (!/^tel:/i.test(trimmed) || hasControls(trimmed)) {
    return null;
  }
  const number = trimmed.slice('tel:'.length).trim();
  if (!isPlausiblePhoneNumber(number)) {
    return null;
  }
  return { kind: 'phone', number: number.trim() };
}

function tryParseSms(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (hasControls(trimmed)) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  let remainder: string | null = null;
  if (lower.startsWith('sms:')) {
    remainder = trimmed.slice('sms:'.length);
  } else if (lower.startsWith('smsto:')) {
    remainder = trimmed.slice('smsto:'.length);
  } else {
    return null;
  }
  let number = '';
  let message = '';
  const qIndex = remainder.indexOf('?');
  if (qIndex >= 0) {
    number = remainder.slice(0, qIndex);
    try {
      const params = new URLSearchParams(remainder.slice(qIndex + 1));
      message = params.get('body') ?? params.get('text') ?? '';
    } catch {
      return null;
    }
  } else {
    const colon = remainder.indexOf(':');
    const semi = remainder.indexOf(';');
    let sep = -1;
    if (colon >= 0 && semi >= 0) {
      sep = Math.min(colon, semi);
    } else if (colon >= 0) {
      sep = colon;
    } else if (semi >= 0) {
      sep = semi;
    }
    if (sep >= 0) {
      number = remainder.slice(0, sep);
      message = remainder.slice(sep + 1);
    } else {
      number = remainder;
      message = '';
    }
  }
  number = number.trim();
  if (!isPlausiblePhoneNumber(number)) {
    return null;
  }
  return { kind: 'sms', number, message };
}

function tryParseGeo(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (!/^geo:/i.test(trimmed) || hasControls(trimmed)) {
    return null;
  }
  const after = trimmed.slice('geo:'.length);
  const [coordsPart, ...queryParts] = after.split('?');
  const query = queryParts.length > 0 ? queryParts.join('?') : null;
  const coords = coordsPart.split(',');
  if (coords.length < 2) {
    return null;
  }
  const latitude = Number(coords[0].trim());
  const longitude = Number(coords[1].trim());
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  let queryValue: string | null = null;
  if (query != null) {
    try {
      const params = new URLSearchParams(query);
      queryValue = params.get('q') ?? query;
    } catch {
      queryValue = query;
    }
  }
  return { kind: 'geo', latitude, longitude, query: queryValue };
}

function unescapeWifiValue(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

function splitUnescaped(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === delimiter) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += '\\';
  }
  parts.push(current);
  return parts;
}

const WIFI_SECURITY = new Set(['WEP', 'WPA', 'WPA2', 'EAP', 'NOPASS', '']);

function tryParseWifi(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (trimmed.slice(0, 5).toUpperCase() !== 'WIFI:') {
    return null;
  }
  if (hasControls(trimmed)) {
    return null;
  }
  if (!/;;\s*$/.test(trimmed)) {
    return null;
  }
  const inner = trimmed.slice('WIFI:'.length).replace(/;;\s*$/, '');
  const fields = splitUnescaped(inner, ';');
  const seen = new Set<string>();
  let security = 'nopass';
  let ssid: string | null = null;
  let password: string | null = null;
  let hasSecurity = false;
  for (const field of fields) {
    if (field === '') {
      continue;
    }
    const colonIndex = (() => {
      let escaped = false;
      for (let i = 0; i < field.length; i++) {
        const char = field[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === ':') {
          return i;
        }
      }
      return -1;
    })();
    if (colonIndex < 0) {
      return null;
    }
    const key = field.slice(0, colonIndex).toUpperCase();
    const value = field.slice(colonIndex + 1);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (key === 'T') {
      hasSecurity = true;
      security = unescapeWifiValue(value);
      if (!WIFI_SECURITY.has(security.toUpperCase())) {
        return null;
      }
    } else if (key === 'S') {
      ssid = unescapeWifiValue(value);
    } else if (key === 'P') {
      password = unescapeWifiValue(value);
    }
  }
  if (ssid == null) {
    return null;
  }
  if (!hasSecurity) {
    security = 'nopass';
  }
  const hasPassword = (password ?? '').length > 0;
  return {
    kind: 'wifi',
    ssid,
    security,
    hasPassword,
    password: hasPassword ? password : null,
  };
}

function unfoldVCardLines(raw: string): string[] {
  const physical = raw.split(/\r?\n/);
  const unfolded: string[] = [];
  for (const line of physical) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function vcardUnescape(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function tryParseContact(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (hasControls(trimmed.replace(/\r/g, '').replace(/\n/g, '')) && /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
    // Allow newlines/CR which are structural for vCard, reject other controls.
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed.replace(/\r/g, '').replace(/\n/g, '').replace(/\t/g, ''))) {
      return null;
    }
  }
  const upper = trimmed.toUpperCase();
  if (upper.includes('BEGIN:VCARD')) {
    if (!upper.includes('END:VCARD')) {
      return null;
    }
    const lines = unfoldVCardLines(trimmed);
    let name: string | null = null;
    let phone: string | null = null;
    let email: string | null = null;
    const seen = new Set<string>();
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon < 0) {
        continue;
      }
      const keyPart = line.slice(0, colon).split(';')[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (keyPart === 'FN' && !seen.has('FN')) {
        seen.add('FN');
        name = vcardUnescape(value).trim() || null;
      } else if (keyPart === 'TEL' && !seen.has('TEL')) {
        seen.add('TEL');
        phone = vcardUnescape(value).trim() || null;
      } else if (keyPart === 'EMAIL' && !seen.has('EMAIL')) {
        seen.add('EMAIL');
        email = vcardUnescape(value).trim() || null;
      } else if (keyPart === 'N' && name == null && !seen.has('N')) {
        seen.add('N');
        const nValue = vcardUnescape(value).trim();
        name = nValue.length > 0 ? nValue : null;
      }
    }
    if (name == null && phone == null && email == null) {
      return null;
    }
    return { kind: 'contact', name, phone, email };
  }
  if (/^MECARD:/i.test(trimmed)) {
    if (!/;\s*$/.test(trimmed)) {
      return null;
    }
    const inner = trimmed.slice('MECARD:'.length).replace(/;+\s*$/, '');
    const fields = splitUnescaped(inner, ';');
    let name: string | null = null;
    let phone: string | null = null;
    let email: string | null = null;
    const seen = new Set<string>();
    for (const field of fields) {
      if (field === '') {
        continue;
      }
      const colon = (() => {
        let escaped = false;
        for (let i = 0; i < field.length; i++) {
          const char = field[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === '\\') {
            escaped = true;
            continue;
          }
          if (char === ':') {
            return i;
          }
        }
        return -1;
      })();
      if (colon < 0) {
        return null;
      }
      const key = field.slice(0, colon).toUpperCase();
      const value = unescapeWifiValue(field.slice(colon + 1)).trim();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (key === 'N' && name == null) {
        name = value.length > 0 ? value : null;
      } else if ((key === 'TEL' || key === 'VOICE') && phone == null) {
        phone = value.length > 0 ? value : null;
      } else if ((key === 'EMAIL' || key === 'EM') && email == null) {
        email = value.length > 0 ? value : null;
      }
    }
    if (name == null && phone == null && email == null) {
      return null;
    }
    return { kind: 'contact', name, phone, email };
  }
  return null;
}

function tryParseCalendar(raw: string): QRContent | null {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (!upper.includes('BEGIN:VEVENT') || !upper.includes('END:VEVENT')) {
    return null;
  }
  const lines = unfoldVCardLines(trimmed);
  let title: string | null = null;
  let start: string | null = null;
  let end: string | null = null;
  let location: string | null = null;
  const seen = new Set<string>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) {
      continue;
    }
    const key = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1).trim();
    if (seen.has(key)) {
      continue;
    }
    if (key === 'SUMMARY') {
      seen.add(key);
      title = vcardUnescape(value) || null;
    } else if (key === 'DTSTART') {
      seen.add(key);
      start = value || null;
    } else if (key === 'DTEND') {
      seen.add(key);
      end = value || null;
    } else if (key === 'LOCATION') {
      seen.add(key);
      location = vcardUnescape(value) || null;
    }
  }
  return { kind: 'calendar', title, start, end, location };
}

function tryParseOtp(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (!/^otpauth:\/\//i.test(trimmed) || hasControls(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol.toLowerCase() !== 'otpauth:') {
      return null;
    }
    const type = url.host.toLowerCase();
    if (type !== 'totp' && type !== 'hotp') {
      return null;
    }
    const secret = url.searchParams.get('secret');
    if (secret == null || secret.trim().length === 0) {
      return null;
    }
    const normalizedSecret = secret.trim().replace(/\s+/g, '');
    if (!/^[A-Z2-7]+=*$/.test(normalizedSecret.toUpperCase())) {
      return null;
    }
    const issuer = url.searchParams.get('issuer');
    const pathLabel = decodeURIComponent(url.pathname.replace(/^\//, ''));
    let label: string | null = pathLabel.length > 0 ? pathLabel : null;
    if (label != null && label.includes(':')) {
      const [, after] = label.split(/:(.+)/);
      if (after) {
        label = after;
      }
    }
    return {
      kind: 'otp',
      label,
      issuer: issuer && issuer.length > 0 ? issuer : null,
    };
  } catch {
    return null;
  }
}

const KNOWN_SCHEMES = new Set([
  'http',
  'https',
  'mailto',
  'tel',
  'sms',
  'smsto',
  'geo',
  'wifi',
  'otpauth',
  'matmsg',
  'mecard',
]);

function tryParseCustomScheme(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || hasControls(trimmed) || /\s/.test(trimmed)) {
    return null;
  }
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/s.exec(trimmed);
  if (!match) {
    return null;
  }
  const scheme = match[1].toLowerCase();
  const remainder = match[2];
  if (remainder.length === 0) {
    return null;
  }
  if (KNOWN_SCHEMES.has(scheme)) {
    return null;
  }
  return { kind: 'customScheme', scheme, remainder };
}

function displayForContent(content: QRContent, raw: string): string {
  switch (content.kind) {
    case 'url': {
      const path = content.path && content.path !== '' ? content.path : '';
      return toSafeSummary(`${content.host}${path}`);
    }
    case 'text':
      return toSafeSummary(content.text);
    case 'email':
      return toSafeSummary(
        content.subject.length > 0 ? `${content.to} — ${content.subject}` : content.to,
      );
    case 'phone':
      return toSafeSummary(content.number);
    case 'sms':
      return toSafeSummary(
        content.message.length > 0
          ? `${content.number} — ${content.message}`
          : content.number,
      );
    case 'geo':
      return toSafeSummary(
        content.query
          ? `${content.latitude}, ${content.longitude} (${content.query})`
          : `${content.latitude}, ${content.longitude}`,
      );
    case 'wifi':
      return toSafeSummary(
        `Wi-Fi ${content.ssid.length > 0 ? `“${content.ssid}”` : 'network'} (${content.security})`,
      );
    case 'contact':
      return toSafeSummary(
        content.name ?? content.phone ?? content.email ?? 'Contact',
      );
    case 'calendar':
      return toSafeSummary(content.title ?? 'Calendar event');
    case 'otp':
      return toSafeSummary(
        content.issuer
          ? `Authentication code (${content.issuer})`
          : 'Authentication code',
      );
    case 'customScheme':
      return toSafeSummary(`${content.scheme}:${content.remainder}`);
    default:
      return toSafeSummary(raw);
  }
}

function actionsForContent(content: QRContent): QRAction[] {
  switch (content.kind) {
    case 'url':
      return ['openUrl', 'copy', 'share'];
    case 'text':
      return ['copy', 'share'];
    case 'email':
      return ['composeEmail', 'copy', 'share'];
    case 'phone':
      return ['call', 'copy', 'share'];
    case 'sms':
      return ['sendSms', 'copy', 'share'];
    case 'geo':
      return ['openLocation', 'copy', 'share'];
    case 'wifi':
      return ['joinWifi', 'copy', 'share'];
    case 'contact':
      return ['addContact', 'copy', 'share'];
    case 'calendar':
      return ['addEvent', 'copy', 'share'];
    case 'otp':
      return ['authenticate'];
    case 'customScheme':
      return ['openApp', 'copy', 'share'];
  }
}

export const STRUCTURED_PARSERS: StructuredParser[] = [
  {
    id: 'wifi',
    sensitivity: 'redacted',
    parse: tryParseWifi,
  },
  {
    id: 'otp',
    sensitivity: 'sessionOnly',
    parse: tryParseOtp,
  },
  {
    id: 'geo',
    sensitivity: 'standard',
    parse: tryParseGeo,
  },
  {
    id: 'email',
    sensitivity: 'standard',
    parse: tryParseEmail,
  },
  {
    id: 'phone',
    sensitivity: 'standard',
    parse: tryParsePhone,
  },
  {
    id: 'sms',
    sensitivity: 'standard',
    parse: tryParseSms,
  },
  {
    id: 'contact',
    sensitivity: 'standard',
    parse: tryParseContact,
  },
  {
    id: 'calendar',
    sensitivity: 'standard',
    parse: tryParseCalendar,
  },
  {
    id: 'url',
    sensitivity: 'standard',
    parse: tryParseUrl,
  },
  {
    id: 'customScheme',
    sensitivity: 'standard',
    parse: tryParseCustomScheme,
  },
];

function textFallback(raw: string): QRContent {
  return { kind: 'text', text: raw, isFallback: true };
}

export function parseQRPayload(raw: string): ParsedQRPayload {
  const originalPayload = raw;
  try {
    for (const parser of STRUCTURED_PARSERS) {
      let content: QRContent | null = null;
      try {
        content = parser.parse(raw);
      } catch {
        content = null;
      }
      if (content != null) {
        return {
          originalPayload,
          content,
          displaySummary: displayForContent(content, raw),
          identityKey: identityOf(raw),
          parserVersion: PAYLOAD_PARSER_VERSION,
          sensitivity: parser.sensitivity,
          actions: actionsForContent(content),
        };
      }
    }
    const fallback = textFallback(raw);
    return {
      originalPayload,
      content: fallback,
      displaySummary: displayForContent(fallback, raw),
      identityKey: identityOf(raw),
      parserVersion: PAYLOAD_PARSER_VERSION,
      sensitivity: 'standard',
      actions: actionsForContent(fallback),
    };
  } catch {
    const fallback = textFallback(raw);
    return {
      originalPayload,
      content: fallback,
      displaySummary: toSafeSummary(raw),
      identityKey: identityOf(raw),
      parserVersion: PAYLOAD_PARSER_VERSION,
      sensitivity: 'standard',
      actions: ['copy', 'share'],
    };
  }
}
