import { parseQRPayload, type ParsedQRPayload } from '@/scanner/payloadParser';

import {
  REDACTED_HISTORY_KIND,
  WIFI_HISTORY_KIND,
  type StoredHistoryEvent,
} from './historyPolicy';

export type HistoryReplayUnavailableReason = 'redacted' | 'wifi';

export type HistoryReplay =
  | {
      status: 'replayable';
      parsed: ParsedQRPayload;
      acceptedAt: string;
    }
  | {
      status: 'unavailable';
      reason: HistoryReplayUnavailableReason;
      acceptedAt: string;
    };

export type PresentHistoryDetailTimeOptions = {
  now: Date;
  locale: string;
  timeZone: string;
};

/**
 * Decide whether a stored row can be reopened. Safe rows are reparsed from
 * `original` with the current parser. Redacted and Wi-Fi rows never replay
 * or copy a secret, even if a corrupt file still has an original payload.
 */
export function replayHistoryEvent(event: StoredHistoryEvent): HistoryReplay {
  if (event.kind === REDACTED_HISTORY_KIND || event.kind === WIFI_HISTORY_KIND) {
    return {
      status: 'unavailable',
      reason: event.kind === WIFI_HISTORY_KIND ? 'wifi' : 'redacted',
      acceptedAt: event.acceptedAt,
    };
  }

  if (event.original == null || event.original.length === 0) {
    return {
      status: 'unavailable',
      reason: 'redacted',
      acceptedAt: event.acceptedAt,
    };
  }

  return {
    status: 'replayable',
    parsed: parseQRPayload(event.original),
    acceptedAt: event.acceptedAt,
  };
}

export function presentHistoryDetailTime(
  acceptedAt: string,
  options: PresentHistoryDetailTimeOptions,
): { relative: string; exact: string } {
  const instant = new Date(acceptedAt);
  if (Number.isNaN(instant.getTime())) {
    return { relative: '', exact: '' };
  }

  return {
    relative: formatRelativeTime(instant, options.now, options.locale),
    exact: new Intl.DateTimeFormat(options.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: options.timeZone,
    }).format(instant),
  };
}

type RelativeUnit = 'second' | 'minute' | 'hour' | 'day';

function formatRelativeTime(instant: Date, now: Date, locale: string): string {
  const diffMs = instant.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let value: number;
  let unit: RelativeUnit;
  if (absMs < minute) {
    value = Math.round(diffMs / 1000);
    unit = 'second';
  } else if (absMs < hour) {
    value = Math.round(diffMs / minute);
    unit = 'minute';
  } else if (absMs < day) {
    value = Math.round(diffMs / hour);
    unit = 'hour';
  } else {
    value = Math.round(diffMs / day);
    unit = 'day';
  }

  if (typeof Intl.RelativeTimeFormat === 'function') {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(value, unit);
  }
  return formatRelativeTimeFallback(value, unit, locale);
}

const EN_UNITS: Record<RelativeUnit, [string, string]> = {
  second: ['second', 'seconds'],
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
};

const ES_UNITS: Record<RelativeUnit, [string, string]> = {
  second: ['segundo', 'segundos'],
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['día', 'días'],
};

function formatRelativeTimeFallback(
  value: number,
  unit: RelativeUnit,
  locale: string,
): string {
  const abs = Math.abs(value);
  const spanish = locale.toLowerCase().startsWith('es');
  const words = spanish ? ES_UNITS[unit] : EN_UNITS[unit];
  const word = abs === 1 ? words[0] : words[1];
  if (spanish) {
    return value <= 0 ? `hace ${abs} ${word}` : `en ${abs} ${word}`;
  }
  return value <= 0 ? `${abs} ${word} ago` : `in ${abs} ${word}`;
}
