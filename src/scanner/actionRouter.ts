import type { ParsedQRPayload, QRAction, QRContent } from './payloadParser';

export type ResultActionCapabilities = {
  composeEmail: boolean;
  call: boolean;
  sendSms: boolean;
  openLocation: boolean;
  addContact: boolean;
  addEvent: boolean;
  joinWifi: boolean;
};

export const DEFAULT_RESULT_ACTION_CAPABILITIES: ResultActionCapabilities = {
  composeEmail: true,
  call: true,
  sendSms: true,
  openLocation: true,
  addContact: true,
  addEvent: true,
  joinWifi: false,
};

export type ContactDraft = {
  name: string | null;
  organization: string | null;
  phones: string[];
  emails: string[];
  addresses: string[];
  urls: string[];
  originalPayload: string;
};

export type ContactPresentationResult = 'saved' | 'cancelled' | 'unavailable';

export type CalendarDraft = {
  title: string | null;
  start: string | null;
  end: string | null;
  location: string | null;
  notes: string | null;
  url: string | null;
  timeZone: string | null;
  allDay: boolean;
  timeKind: 'allDay' | 'utc' | 'local' | 'namedZone';
  originalPayload: string;
};

export type CalendarPresentationResult = 'saved' | 'cancelled' | 'unavailable';

export type WifiDraft = {
  ssid: string;
  security: string;
  hasPassword: boolean;
  hidden: boolean;
  originalPayload: string;
};

export type WifiJoinResult = 'joined' | 'cancelled' | 'failed' | 'unavailable';

export type ResultActionDeps = {
  openURL: (url: string) => Promise<unknown> | unknown;
  copyText: (text: string) => Promise<unknown> | unknown;
  shareText: (text: string) => Promise<unknown> | unknown;
  canOpenURL?: (url: string) => Promise<boolean> | boolean;
  capabilities?: Partial<ResultActionCapabilities>;
  presentContact?: (draft: ContactDraft) => Promise<ContactPresentationResult>;
  presentEvent?: (draft: CalendarDraft) => Promise<CalendarPresentationResult>;
  joinWifi?: (draft: WifiDraft & { password: string | null }) => Promise<WifiJoinResult>;
};

export type PrimarySystemAction = {
  action: Extract<
    QRAction,
    | 'openUrl'
    | 'openApp'
    | 'composeEmail'
    | 'call'
    | 'sendSms'
    | 'openLocation'
    | 'addContact'
    | 'addEvent'
    | 'joinWifi'
  >;
  url: string;
};

export function contactDraftFromPayload(parsed: ParsedQRPayload): ContactDraft {
  if (parsed.content.kind !== 'contact') {
    throw new Error('contact draft requires a parsed contact result');
  }
  const { content } = parsed;
  return {
    name: content.name,
    organization: content.organization,
    phones: content.phones,
    emails: content.emails,
    addresses: content.addresses,
    urls: content.urls,
    originalPayload: parsed.originalPayload,
  };
}

export function calendarDraftFromPayload(parsed: ParsedQRPayload): CalendarDraft {
  if (parsed.content.kind !== 'calendar') {
    throw new Error('calendar draft requires a parsed calendar result');
  }
  const { content } = parsed;
  return {
    title: content.title,
    start: content.start,
    end: content.end,
    location: content.location,
    notes: content.notes,
    url: content.url,
    timeZone: content.timeZone,
    allDay: content.allDay,
    timeKind: content.timeKind,
    originalPayload: parsed.originalPayload,
  };
}

export function wifiDraftFromPayload(parsed: ParsedQRPayload): WifiDraft & { password: string | null } {
  if (parsed.content.kind !== 'wifi') {
    throw new Error('wifi draft requires a parsed Wi-Fi result');
  }
  return {
    ssid: parsed.content.ssid,
    security: parsed.content.security,
    hasPassword: parsed.content.hasPassword,
    hidden: parsed.content.hidden,
    password: parsed.content.password,
    originalPayload: parsed.originalPayload,
  };
}

function digitsForDialing(number: string): string {
  const trimmed = number.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

function mailtoURL(content: Extract<QRContent, { kind: 'email' }>): string {
  const parts: string[] = [];
  if (content.subject.length > 0) {
    parts.push(`subject=${encodeURIComponent(content.subject)}`);
  }
  if (content.body.length > 0) {
    parts.push(`body=${encodeURIComponent(content.body)}`);
  }
  const query = parts.length > 0 ? `?${parts.join('&')}` : '';
  return `mailto:${content.to}${query}`;
}

function telURL(number: string): string {
  return `tel:${digitsForDialing(number)}`;
}

function smsURL(content: Extract<QRContent, { kind: 'sms' }>): string {
  const number = digitsForDialing(content.number);
  if (content.message.length === 0) {
    return `sms:${number}`;
  }
  return `sms:${number}&body=${encodeURIComponent(content.message)}`;
}

function mapsURL(content: Extract<QRContent, { kind: 'geo' }>): string {
  const ll = `${content.latitude},${content.longitude}`;
  if (content.query) {
    return `http://maps.apple.com/?ll=${ll}&q=${encodeURIComponent(content.query)}`;
  }
  return `http://maps.apple.com/?ll=${ll}`;
}

function systemURLForAction(parsed: ParsedQRPayload, action: QRAction): string {
  const { content } = parsed;
  switch (action) {
    case 'openUrl': {
      if (content.kind !== 'url') {
        throw new Error('openUrl requires a parsed web URL result');
      }
      if (!/^https?:\/\//i.test(content.url)) {
        throw new Error('openUrl refuses non-http(s) destinations');
      }
      return content.url;
    }
    case 'openApp': {
      if (content.kind !== 'customScheme') {
        throw new Error('openApp requires a custom-scheme result');
      }
      const raw = parsed.originalPayload.trim();
      if (raw.length === 0) {
        throw new Error('openApp requires a non-empty destination');
      }
      return raw;
    }
    case 'composeEmail': {
      if (content.kind !== 'email') {
        throw new Error('composeEmail requires a parsed email result');
      }
      return mailtoURL(content);
    }
    case 'call': {
      if (content.kind !== 'phone') {
        throw new Error('call requires a parsed phone result');
      }
      return telURL(content.number);
    }
    case 'sendSms': {
      if (content.kind !== 'sms') {
        throw new Error('sendSms requires a parsed SMS result');
      }
      return smsURL(content);
    }
    case 'openLocation': {
      if (content.kind !== 'geo') {
        throw new Error('openLocation requires a parsed location result');
      }
      return mapsURL(content);
    }
    default:
      throw new Error(`Action "${action}" has no system URL`);
  }
}

function capabilityFlag(
  action: QRAction,
): keyof ResultActionCapabilities | null {
  switch (action) {
    case 'composeEmail':
    case 'call':
    case 'sendSms':
    case 'openLocation':
    case 'addContact':
    case 'addEvent':
    case 'joinWifi':
      return action;
    default:
      return null;
  }
}

export function resolvePrimarySystemAction(
  parsed: ParsedQRPayload,
  capabilities?: Partial<ResultActionCapabilities>,
): PrimarySystemAction | null {
  const caps = { ...DEFAULT_RESULT_ACTION_CAPABILITIES, ...capabilities };
  switch (parsed.content.kind) {
    case 'url':
      return { action: 'openUrl', url: parsed.content.url };
    case 'customScheme': {
      const raw = parsed.originalPayload.trim();
      return raw.length > 0 ? { action: 'openApp', url: raw } : null;
    }
    case 'email':
      return caps.composeEmail
        ? { action: 'composeEmail', url: mailtoURL(parsed.content) }
        : null;
    case 'phone':
      return caps.call ? { action: 'call', url: telURL(parsed.content.number) } : null;
    case 'sms':
      return caps.sendSms ? { action: 'sendSms', url: smsURL(parsed.content) } : null;
    case 'geo':
      return caps.openLocation
        ? { action: 'openLocation', url: mapsURL(parsed.content) }
        : null;
    case 'contact':
      return caps.addContact
        ? { action: 'addContact', url: parsed.originalPayload }
        : null;
    case 'calendar':
      return caps.addEvent
        ? { action: 'addEvent', url: parsed.originalPayload }
        : null;
    case 'wifi':
      return caps.joinWifi
        ? { action: 'joinWifi', url: parsed.originalPayload }
        : null;
    default:
      return null;
  }
}

async function openSystemURL(
  parsed: ParsedQRPayload,
  action: QRAction,
  deps: ResultActionDeps,
): Promise<void> {
  const url = systemURLForAction(parsed, action);
  const flag = capabilityFlag(action);
  if (flag && deps.capabilities?.[flag] === false) {
    throw new Error(`Action "${action}" is unavailable`);
  }
  if (deps.canOpenURL) {
    const allowed = await deps.canOpenURL(url);
    if (!allowed) {
      throw new Error(`Action "${action}" is unavailable`);
    }
  }
  await deps.openURL(url);
}

/**
 * Explicit ActionRouter for scan results.
 *
 * System routing (openURL) happens only when the caller explicitly dispatches
 * an open action from a tap handler. Importing or rendering never opens,
 * copies, shares, or fetches anything.
 */
export async function dispatchResultAction(
  parsed: ParsedQRPayload,
  action: QRAction,
  deps: ResultActionDeps,
): Promise<void> {
  switch (action) {
    case 'openUrl':
    case 'openApp':
    case 'composeEmail':
    case 'call':
    case 'sendSms':
    case 'openLocation':
      await openSystemURL(parsed, action, deps);
      return;
    case 'addContact': {
      if (parsed.content.kind !== 'contact') {
        throw new Error('addContact requires a parsed contact result');
      }
      if (deps.capabilities?.addContact === false || !deps.presentContact) {
        throw new Error('Action "addContact" is unavailable');
      }
      const result = await deps.presentContact(contactDraftFromPayload(parsed));
      if (result === 'unavailable') {
        throw new Error('Action "addContact" is unavailable');
      }
      return;
    }
    case 'addEvent': {
      if (parsed.content.kind !== 'calendar') {
        throw new Error('addEvent requires a parsed calendar result');
      }
      if (deps.capabilities?.addEvent === false || !deps.presentEvent) {
        throw new Error('Action "addEvent" is unavailable');
      }
      const result = await deps.presentEvent(calendarDraftFromPayload(parsed));
      if (result === 'unavailable') {
        throw new Error('Action "addEvent" is unavailable');
      }
      return;
    }
    case 'joinWifi': {
      if (parsed.content.kind !== 'wifi') {
        throw new Error('joinWifi requires a parsed Wi-Fi result');
      }
      if (deps.capabilities?.joinWifi === false || !deps.joinWifi) {
        throw new Error('Action "joinWifi" is unavailable');
      }
      const result = await deps.joinWifi(wifiDraftFromPayload(parsed));
      if (result === 'unavailable' || result === 'failed') {
        throw new Error(`Action "joinWifi" is ${result}`);
      }
      return;
    }
    case 'copy': {
      await deps.copyText(parsed.originalPayload);
      return;
    }
    case 'share': {
      await deps.shareText(parsed.originalPayload);
      return;
    }
    case 'authenticate': {
      throw new Error('Action "authenticate" is not implemented');
    }
    default: {
      throw new Error(`Action "${action as string}" is not handled by the result router`);
    }
  }
}

export function defaultResultActionDeps(): ResultActionDeps {
  // Lazy requires keep unit tests free of react-native side effects.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Linking, Share } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clipboard = require('expo-clipboard');
  return {
    openURL: (url: string) => Linking.openURL(url),
    copyText: (text: string) => Clipboard.setStringAsync(text),
    shareText: (text: string) => Share.share({ message: text }),
    canOpenURL: (url: string) => Linking.canOpenURL(url),
    presentContact: async (draft) => {
      const result = await Share.share({ message: draft.originalPayload });
      if (result?.action === Share.dismissedAction) {
        return 'cancelled';
      }
      return 'saved';
    },
    presentEvent: async (draft) => {
      const result = await Share.share({ message: draft.originalPayload });
      if (result?.action === Share.dismissedAction) {
        return 'cancelled';
      }
      return 'saved';
    },
    joinWifi: async () => 'unavailable',
  };
}
