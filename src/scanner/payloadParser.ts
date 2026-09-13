import { recognizeAuthQr } from './authQr';

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
      hidden: boolean;
    }
  | {
      kind: 'contact';
      name: string | null;
      organization: string | null;
      phones: string[];
      emails: string[];
      addresses: string[];
      urls: string[];
      phone: string | null;
      email: string | null;
    }
  | {
      kind: 'calendar';
      title: string | null;
      start: string | null;
      end: string | null;
      location: string | null;
      notes: string | null;
      url: string | null;
      timeZone: string | null;
      allDay: boolean;
      timeKind: 'allDay' | 'utc' | 'local' | 'namedZone';
    }
  | { kind: 'otp'; label: string | null; issuer: string | null }
  | { kind: 'passkey' }
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

const CONTROL_RE = /[\x00-\x1F\x7F]/;
const MAX_DISPLAY_LENGTH = 120;

function hasControls(value: string): boolean {
  return CONTROL_RE.test(value);
}

function sanitizeForDisplay(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, '�');
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
    const parts = splitUnescaped(inner, ';');
    let to: string | null = null;
    let subject = '';
    let body = '';
    const seen = new Set<string>();
    for (const part of parts) {
      const upper = part.toUpperCase();
      if (upper.startsWith('TO:')) {
        if (!seen.has('TO')) {
          seen.add('TO');
          to = unescapeWifiValue(part.slice('TO:'.length));
        }
      } else if (upper.startsWith('SUB:')) {
        if (!seen.has('SUB')) {
          seen.add('SUB');
          subject = unescapeWifiValue(part.slice('SUB:'.length));
        }
      } else if (upper.startsWith('BODY:')) {
        if (!seen.has('BODY')) {
          seen.add('BODY');
          body = unescapeWifiValue(part.slice('BODY:'.length));
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
      const field = /^(?:body|text)=/i.exec(message);
      if (field) {
        message = message.slice(field[0].length);
      }
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

const WIFI_SECURITY = new Set(['WEP', 'WPA', 'WPA2', 'WPA3', 'SAE', 'EAP', 'NOPASS', '']);

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
  let hidden = false;
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
    } else if (key === 'H') {
      hidden = /^(true|1|yes)$/i.test(unescapeWifiValue(value).trim());
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
    hidden,
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

function formatVCardAddress(raw: string): string | null {
  const parts = splitUnescaped(raw, ';').map((part) => vcardUnescape(part).trim());
  const usable = parts.filter((part) => part.length > 0);
  return usable.length > 0 ? usable.join(', ') : null;
}

function contactContent(
  name: string | null,
  organization: string | null,
  phones: string[],
  emails: string[],
  addresses: string[],
  urls: string[],
): Extract<QRContent, { kind: 'contact' }> | null {
  if (
    name == null &&
    organization == null &&
    phones.length === 0 &&
    emails.length === 0 &&
    addresses.length === 0 &&
    urls.length === 0
  ) {
    return null;
  }
  return {
    kind: 'contact',
    name,
    organization,
    phones,
    emails,
    addresses,
    urls,
    phone: phones[0] ?? null,
    email: emails[0] ?? null,
  };
}

function tryParseContact(raw: string): QRContent | null {
  const trimmed = raw.trim();
  if (hasControls(trimmed.replace(/\r/g, '').replace(/\n/g, '')) && /[\x00-\x1F\x7F]/.test(trimmed)) {
    // Allow newlines/CR which are structural for vCard, reject other controls.
    if (/[\x00-\x1F\x7F]/.test(trimmed.replace(/\r/g, '').replace(/\n/g, '').replace(/\t/g, ''))) {
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
    let structuredName: string | null = null;
    let organization: string | null = null;
    const phones: string[] = [];
    const emails: string[] = [];
    const addresses: string[] = [];
    const urls: string[] = [];
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon < 0) {
        continue;
      }
      const keyPart = line.slice(0, colon).split(';')[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (keyPart === 'FN' && name == null) {
        name = vcardUnescape(value).trim() || null;
      } else if (keyPart === 'N' && structuredName == null) {
        structuredName = vcardUnescape(value).trim() || null;
      } else if (keyPart === 'ORG' && organization == null) {
        organization = vcardUnescape(value).trim() || null;
      } else if (keyPart === 'TEL') {
        const phone = vcardUnescape(value).trim();
        if (phone.length > 0) {
          phones.push(phone);
        }
      } else if (keyPart === 'EMAIL') {
        const email = vcardUnescape(value).trim();
        if (email.length > 0) {
          emails.push(email);
        }
      } else if (keyPart === 'ADR') {
        const address = formatVCardAddress(value);
        if (address) {
          addresses.push(address);
        }
      } else if (keyPart === 'URL') {
        const url = vcardUnescape(value).trim();
        if (url.length > 0) {
          urls.push(url);
        }
      }
    }
    return contactContent(
      name ?? structuredName,
      organization,
      phones,
      emails,
      addresses,
      urls,
    );
  }
  if (/^MECARD:/i.test(trimmed)) {
    if (!/;\s*$/.test(trimmed)) {
      return null;
    }
    const inner = trimmed.slice('MECARD:'.length).replace(/;+\s*$/, '');
    const fields = splitUnescaped(inner, ';');
    let name: string | null = null;
    let organization: string | null = null;
    const phones: string[] = [];
    const emails: string[] = [];
    const addresses: string[] = [];
    const urls: string[] = [];
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
      if (value.length === 0) {
        continue;
      }
      if (key === 'N' && name == null) {
        name = value;
      } else if (key === 'ORG' && organization == null) {
        organization = value;
      } else if (key === 'TEL' || key === 'VOICE') {
        phones.push(value);
      } else if (key === 'EMAIL' || key === 'EM') {
        emails.push(value);
      } else if (key === 'ADR') {
        addresses.push(value);
      } else if (key === 'URL') {
        urls.push(value);
      }
    }
    return contactContent(name, organization, phones, emails, addresses, urls);
  }
  return null;
}

const ICAL_DATE = /^(\d{4})(\d{2})(\d{2})$/;
const ICAL_DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/;

function isValidICalDate(value: string, allDay: boolean): boolean {
  if (allDay) {
    const match = ICAL_DATE.exec(value);
    if (!match) {
      return false;
    }
    const month = Number(match[2]);
    const day = Number(match[3]);
    const instant = new Date(Date.UTC(Number(match[1]), month - 1, day));
    return (
      instant.getUTCFullYear() === Number(match[1]) &&
      instant.getUTCMonth() === month - 1 &&
      instant.getUTCDate() === day
    );
  }
  const match = ICAL_DATE_TIME.exec(value);
  if (!match) {
    return false;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  const instant = new Date(
    Date.UTC(Number(match[1]), month - 1, day, hour, minute, second),
  );
  return (
    instant.getUTCFullYear() === Number(match[1]) &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}

function parseICalParams(rawKey: string): { name: string; params: Record<string, string> } {
  const parts = rawKey.split(';');
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq < 0) {
      continue;
    }
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name, params };
}

function tryParseCalendar(raw: string): QRContent | null {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const beginCount = upper.split('BEGIN:VEVENT').length - 1;
  if (beginCount !== 1 || !upper.includes('END:VEVENT')) {
    return null;
  }
  const lines = unfoldVCardLines(trimmed);
  let title: string | null = null;
  let start: string | null = null;
  let end: string | null = null;
  let location: string | null = null;
  let notes: string | null = null;
  let url: string | null = null;
  let timeZone: string | null = null;
  let allDay = false;
  let timeKind: Extract<QRContent, { kind: 'calendar' }>['timeKind'] = 'local';
  const seen = new Set<string>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) {
      continue;
    }
    const { name, params } = parseICalParams(line.slice(0, colon));
    const value = line.slice(colon + 1).trim();
    if (seen.has(name)) {
      continue;
    }
    if (name === 'SUMMARY') {
      seen.add(name);
      title = vcardUnescape(value) || null;
    } else if (name === 'DTSTART') {
      seen.add(name);
      start = value || null;
      const valueType = (params.VALUE ?? '').toUpperCase();
      if (valueType === 'DATE' || ICAL_DATE.test(value)) {
        allDay = true;
        timeKind = 'allDay';
      } else if (value.endsWith('Z')) {
        timeKind = 'utc';
      } else if (params.TZID) {
        timeKind = 'namedZone';
        timeZone = params.TZID;
      } else {
        timeKind = 'local';
      }
    } else if (name === 'DTEND') {
      seen.add(name);
      end = value || null;
    } else if (name === 'LOCATION') {
      seen.add(name);
      location = vcardUnescape(value) || null;
    } else if (name === 'DESCRIPTION') {
      seen.add(name);
      notes = vcardUnescape(value) || null;
    } else if (name === 'URL') {
      seen.add(name);
      url = vcardUnescape(value) || null;
    }
  }
  if (start == null || !isValidICalDate(start, allDay)) {
    return null;
  }
  if (end != null && !isValidICalDate(end, allDay || ICAL_DATE.test(end))) {
    return null;
  }
  return {
    kind: 'calendar',
    title,
    start,
    end,
    location,
    notes,
    url,
    timeZone,
    allDay,
    timeKind,
  };
}

function tryParseOtp(raw: string): QRContent | null {
  const recognized = recognizeAuthQr(raw);
  if (recognized == null) {
    return null;
  }
  if (recognized.format === 'otpauth') {
    return {
      kind: 'otp',
      label: recognized.label,
      issuer: recognized.issuer,
    };
  }
  if (recognized.format === 'otpauth-migration') {
    return {
      kind: 'otp',
      label: null,
      issuer: null,
    };
  }
  return null;
}

function tryParsePasskey(raw: string): QRContent | null {
  const recognized = recognizeAuthQr(raw);
  if (recognized == null || recognized.format !== 'fido-hybrid') {
    return null;
  }
  return { kind: 'passkey' };
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
  'otpauth-migration',
  'fido',
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
        content.name ??
          content.organization ??
          content.phone ??
          content.email ??
          'Contact',
      );
    case 'calendar':
      return toSafeSummary(content.title ?? 'Calendar event');
    case 'otp': {
      const recognized = recognizeAuthQr(raw);
      if (recognized != null) {
        return toSafeSummary(recognized.summary);
      }
      return toSafeSummary(
        content.issuer
          ? `Authentication code (${content.issuer})`
          : 'Authentication code',
      );
    }
    case 'passkey':
      return toSafeSummary('Passkey sign-in');
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
    case 'passkey':
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
    id: 'passkey',
    sensitivity: 'sessionOnly',
    parse: tryParsePasskey,
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
