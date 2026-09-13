import { parseQRPayload } from './payloadParser';

function calendarOf(raw: string) {
  const parsed = parseQRPayload(raw);
  expect(parsed.content.kind).toBe('calendar');
  if (parsed.content.kind !== 'calendar') {
    throw new Error('expected calendar');
  }
  return { parsed, event: parsed.content };
}

describe('calendar-event payloads (ACT-05)', () => {
  test('parses title, start, end, location, notes, and URL', () => {
    const raw = [
      'BEGIN:VEVENT',
      'SUMMARY:Team Meeting',
      'DTSTART:20260912T140000Z',
      'DTEND:20260912T150000Z',
      'LOCATION:Room 1',
      'DESCRIPTION:Bring notes',
      'URL:https://meet.example/team',
      'END:VEVENT',
    ].join('\n');
    const { event, parsed } = calendarOf(raw);
    expect(event.title).toBe('Team Meeting');
    expect(event.start).toBe('20260912T140000Z');
    expect(event.end).toBe('20260912T150000Z');
    expect(event.location).toBe('Room 1');
    expect(event.notes).toBe('Bring notes');
    expect(event.url).toBe('https://meet.example/team');
    expect(event.allDay).toBe(false);
    expect(event.timeKind).toBe('utc');
    expect(parsed.originalPayload).toBe(raw);
    expect(parsed.actions).toEqual(expect.arrayContaining(['addEvent', 'copy', 'share']));
  });

  test('all-day events are distinct from timed UTC events', () => {
    const raw = [
      'BEGIN:VEVENT',
      'SUMMARY:Holiday',
      'DTSTART;VALUE=DATE:20280229',
      'DTEND;VALUE=DATE:20280301',
      'END:VEVENT',
    ].join('\n');
    const { event } = calendarOf(raw);
    expect(event.allDay).toBe(true);
    expect(event.timeKind).toBe('allDay');
    expect(event.start).toBe('20280229');
    expect(event.end).toBe('20280301');
  });

  test('named time zones and floating local times stay labeled', () => {
    const named = [
      'BEGIN:VEVENT',
      'SUMMARY:Standup',
      'DTSTART;TZID=America/Los_Angeles:20261101T020000',
      'DTEND;TZID=America/Los_Angeles:20261101T023000',
      'END:VEVENT',
    ].join('\n');
    const { event: namedEvent } = calendarOf(named);
    expect(namedEvent.timeKind).toBe('namedZone');
    expect(namedEvent.timeZone).toBe('America/Los_Angeles');
    expect(namedEvent.allDay).toBe(false);

    const local = [
      'BEGIN:VEVENT',
      'SUMMARY:Lunch',
      'DTSTART:20260912T120000',
      'DTEND:20260912T130000',
      'END:VEVENT',
    ].join('\n');
    const { event: localEvent } = calendarOf(local);
    expect(localEvent.timeKind).toBe('local');
    expect(localEvent.timeZone).toBeNull();
  });

  test('escaped text and folded lines survive', () => {
    const raw = [
      'BEGIN:VEVENT',
      'SUMMARY:Coffee\\, then walk',
      'DESCRIPTION:Line one',
      '  continues here',
      'DTSTART:20260912T140000Z',
      'END:VEVENT',
    ].join('\n');
    const { event } = calendarOf(raw);
    expect(event.title).toBe('Coffee, then walk');
    expect(event.notes).toBe('Line one continues here');
  });

  test('invalid dates and multiple events fall back with the original payload', () => {
    const badDate = [
      'BEGIN:VEVENT',
      'SUMMARY:Broken',
      'DTSTART:not-a-date',
      'END:VEVENT',
    ].join('\n');
    const bad = parseQRPayload(badDate);
    expect(bad.content.kind).toBe('text');
    expect(bad.originalPayload).toBe(badDate);

    const multi = [
      'BEGIN:VEVENT',
      'SUMMARY:One',
      'DTSTART:20260912T140000Z',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'SUMMARY:Two',
      'DTSTART:20260912T160000Z',
      'END:VEVENT',
    ].join('\n');
    const parsed = parseQRPayload(multi);
    expect(parsed.content.kind).toBe('text');
    expect(parsed.originalPayload).toBe(multi);
  });
});
