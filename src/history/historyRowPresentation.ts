import {
  REDACTED_HISTORY_KIND,
  WIFI_HISTORY_KIND,
  type StoredHistoryEvent,
} from './historyPolicy';

export type HistoryRowPresentation = {
  id: string;
  title: string;
  timeLabel: string;
  symbol: string;
  kind: string;
};

export type PresentHistoryRowOptions = {
  locale: string;
  timeZone: string;
  redactedTitle: string;
  wifiTitle: string;
};

const SYMBOL_BY_KIND: Record<string, string> = {
  url: 'link',
  text: 'text.alignleft',
  email: 'envelope',
  phone: 'phone',
  sms: 'message',
  geo: 'location',
  wifi: 'wifi',
  contact: 'person.crop.circle',
  calendar: 'calendar',
  redacted: 'eye.slash',
  customScheme: 'qrcode',
};

function formatTime(acceptedAt: string, locale: string, timeZone: string): string {
  const instant = new Date(acceptedAt);
  if (Number.isNaN(instant.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
    timeZone,
  }).format(instant);
}

export function presentHistoryRow(
  event: StoredHistoryEvent,
  options: PresentHistoryRowOptions,
): HistoryRowPresentation {
  let title: string;
  if (event.kind === REDACTED_HISTORY_KIND) {
    title = options.redactedTitle;
  } else if (event.kind === WIFI_HISTORY_KIND) {
    title = options.wifiTitle;
  } else {
    title = event.summary ?? options.redactedTitle;
  }

  return {
    id: event.id,
    title,
    timeLabel: formatTime(event.acceptedAt, options.locale, options.timeZone),
    symbol: SYMBOL_BY_KIND[event.kind] ?? 'qrcode',
    kind: event.kind,
  };
}
