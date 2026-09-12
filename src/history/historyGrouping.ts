import type { StoredHistoryEvent } from './historyPolicy';

export type HistoryCalendar = {
  dateKey(instant: Date, timeZone: string): string;
};

export type HistorySection = {
  key: string;
  title: string;
  events: StoredHistoryEvent[];
};

export type GroupHistoryEventsOptions = {
  now: Date;
  timeZone: string;
  locale: string;
  calendar?: HistoryCalendar;
  todayLabel: string;
  yesterdayLabel: string;
};

const MS_PER_DAY = 86_400_000;

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((entry) => entry.type === type)?.value ?? '';
}

export const isoHistoryCalendar: HistoryCalendar = {
  dateKey(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
  },
};

function dayDiff(earlierKey: string, laterKey: string): number {
  const earlier = Date.parse(`${earlierKey}T00:00:00.000Z`);
  const later = Date.parse(`${laterKey}T00:00:00.000Z`);
  return Math.round((later - earlier) / MS_PER_DAY);
}

function weekdayTitle(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone }).format(instant);
}

function fullDateTitle(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(instant);
}

function sectionTitle(
  instant: Date,
  diff: number,
  options: GroupHistoryEventsOptions,
): string {
  if (diff === 0) {
    return options.todayLabel;
  }
  if (diff === 1) {
    return options.yesterdayLabel;
  }
  if (diff >= 2 && diff <= 6) {
    return weekdayTitle(instant, options.locale, options.timeZone);
  }
  return fullDateTitle(instant, options.locale, options.timeZone);
}

export function groupHistoryEvents(
  events: readonly StoredHistoryEvent[],
  options: GroupHistoryEventsOptions,
): HistorySection[] {
  const calendar = options.calendar ?? isoHistoryCalendar;
  const nowKey = calendar.dateKey(options.now, options.timeZone);
  const buckets = new Map<string, HistorySection>();

  const newestFirst = [...events].sort(
    (left, right) => Date.parse(right.acceptedAt) - Date.parse(left.acceptedAt),
  );

  for (const event of newestFirst) {
    const instant = new Date(event.acceptedAt);
    if (Number.isNaN(instant.getTime())) {
      continue;
    }
    const key = calendar.dateKey(instant, options.timeZone);
    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(event);
      continue;
    }
    const diff = dayDiff(key, nowKey);
    buckets.set(key, {
      key,
      title: sectionTitle(instant, diff, options),
      events: [event],
    });
  }

  return [...buckets.values()].sort((left, right) => (left.key < right.key ? 1 : -1));
}
