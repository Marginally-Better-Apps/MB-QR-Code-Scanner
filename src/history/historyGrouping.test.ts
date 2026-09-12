import { PAYLOAD_PARSER_VERSION } from '@/scanner/payloadParser';

import { groupHistoryEvents, type HistoryCalendar } from './historyGrouping';
import type { StoredHistoryEvent } from './historyPolicy';

const PARSER = PAYLOAD_PARSER_VERSION;

function event(
  id: string,
  acceptedAt: string,
  summary = id,
): StoredHistoryEvent {
  return {
    id,
    acceptedAt,
    kind: 'url',
    summary,
    original: `https://example.com/${id}`,
    parserVersion: PARSER,
  };
}

const EN_LABELS = { todayLabel: 'Today', yesterdayLabel: 'Yesterday' };
const ES_LABELS = { todayLabel: 'Hoy', yesterdayLabel: 'Ayer' };

describe('groupHistoryEvents', () => {
  test('labels today, yesterday, weekday in the last seven days, then a full date', () => {
    const now = new Date('2026-09-12T17:00:00.000Z'); // Saturday in Chicago
    const sections = groupHistoryEvents(
      [
        event('older', '2026-09-01T18:00:00.000Z'),
        event('weekday', '2026-09-09T18:00:00.000Z'), // Wednesday, 3 days ago
        event('yesterday', '2026-09-11T18:00:00.000Z'),
        event('today', '2026-09-12T16:00:00.000Z'),
      ],
      {
        now,
        timeZone: 'America/Chicago',
        locale: 'en-US',
        ...EN_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Today',
      'Yesterday',
      'Wednesday',
      'September 1, 2026',
    ]);
    expect(sections.map((section) => section.events.map((item) => item.id))).toEqual([
      ['today'],
      ['yesterday'],
      ['weekday'],
      ['older'],
    ]);
  });

  test('newest events sit first inside a section and newest sections sit first', () => {
    const now = new Date('2026-09-12T20:00:00.000Z');
    const sections = groupHistoryEvents(
      [
        event('today-older', '2026-09-12T14:00:00.000Z'),
        event('yesterday-newer', '2026-09-11T19:00:00.000Z'),
        event('today-newer', '2026-09-12T18:00:00.000Z'),
        event('yesterday-older', '2026-09-11T08:00:00.000Z'),
      ],
      {
        now,
        timeZone: 'UTC',
        locale: 'en-US',
        ...EN_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual(['Today', 'Yesterday']);
    expect(sections[0]?.events.map((item) => item.id)).toEqual([
      'today-newer',
      'today-older',
    ]);
    expect(sections[1]?.events.map((item) => item.id)).toEqual([
      'yesterday-newer',
      'yesterday-older',
    ]);
  });

  test('a day seven calendar days back uses a full date, not a weekday', () => {
    const now = new Date('2026-09-12T17:00:00.000Z');
    const sections = groupHistoryEvents(
      [event('week-ago', '2026-09-05T17:00:00.000Z')],
      {
        now,
        timeZone: 'America/Chicago',
        locale: 'en-US',
        ...EN_LABELS,
      },
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('September 5, 2026');
    expect(sections[0]?.title).not.toBe('Saturday');
  });

  test('midnight splits today from yesterday in the injected time zone', () => {
    const now = new Date('2026-09-12T05:05:00.000Z'); // 00:05 America/Chicago
    const sections = groupHistoryEvents(
      [
        event('just-after', '2026-09-12T05:01:00.000Z'),
        event('just-before', '2026-09-12T04:55:00.000Z'),
      ],
      {
        now,
        timeZone: 'America/Chicago',
        locale: 'en-US',
        ...EN_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual(['Today', 'Yesterday']);
    expect(sections[0]?.events.map((item) => item.id)).toEqual(['just-after']);
    expect(sections[1]?.events.map((item) => item.id)).toEqual(['just-before']);
  });

  test('the same instant groups as today or yesterday when the time zone changes', () => {
    const now = new Date('2026-09-12T17:00:00.000Z');
    const shared = [event('edge', '2026-09-12T05:00:00.000Z')];

    const chicago = groupHistoryEvents(shared, {
      now,
      timeZone: 'America/Chicago',
      locale: 'en-US',
      ...EN_LABELS,
    });
    const losAngeles = groupHistoryEvents(shared, {
      now,
      timeZone: 'America/Los_Angeles',
      locale: 'en-US',
      ...EN_LABELS,
    });

    expect(chicago.map((section) => section.title)).toEqual(['Today']);
    expect(losAngeles.map((section) => section.title)).toEqual(['Yesterday']);
  });

  test('Spanish locale uses injected today/yesterday and localized weekday and date', () => {
    const now = new Date('2026-09-12T17:00:00.000Z');
    const sections = groupHistoryEvents(
      [
        event('today', '2026-09-12T16:00:00.000Z'),
        event('weekday', '2026-09-09T18:00:00.000Z'),
        event('older', '2026-09-01T18:00:00.000Z'),
      ],
      {
        now,
        timeZone: 'America/Chicago',
        locale: 'es',
        ...ES_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Hoy',
      'miércoles',
      '1 de septiembre de 2026',
    ]);
  });

  test('leap day is yesterday on the following civil day', () => {
    const now = new Date('2024-03-01T18:00:00.000Z');
    const sections = groupHistoryEvents(
      [event('leap', '2024-02-29T18:00:00.000Z')],
      {
        now,
        timeZone: 'UTC',
        locale: 'en-US',
        ...EN_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual(['Yesterday']);
    expect(sections[0]?.events.map((item) => item.id)).toEqual(['leap']);
  });

  test('spring-forward does not move an event off its civil day', () => {
    // 2026-03-08 01:30 CST is before Chicago springs forward at 02:00.
    const beforeSpringForward = new Date('2026-03-08T07:30:00.000Z');
    const now = new Date('2026-03-09T17:00:00.000Z');
    const sections = groupHistoryEvents(
      [event('dst', beforeSpringForward.toISOString())],
      {
        now,
        timeZone: 'America/Chicago',
        locale: 'en-US',
        ...EN_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual(['Yesterday']);
  });

  test('an injected calendar is what decides the civil day, not the host clock', () => {
    const calendar: HistoryCalendar = {
      dateKey(instant) {
        if (instant.toISOString() === '2026-09-12T01:00:00.000Z') {
          return '2026-09-11';
        }
        return '2026-09-12';
      },
    };

    const sections = groupHistoryEvents(
      [event('forced-yesterday', '2026-09-12T01:00:00.000Z')],
      {
        now: new Date('2026-09-12T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en-US',
        calendar,
        ...EN_LABELS,
      },
    );

    expect(sections.map((section) => section.title)).toEqual(['Yesterday']);
  });

  test('empty input yields no sections', () => {
    expect(
      groupHistoryEvents([], {
        now: new Date('2026-09-12T12:00:00.000Z'),
        timeZone: 'UTC',
        locale: 'en-US',
        ...EN_LABELS,
      }),
    ).toEqual([]);
  });
});
