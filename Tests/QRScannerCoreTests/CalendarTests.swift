import Foundation
import Testing
@testable import QRScannerCore

private let paris = TimeZone(identifier: "Europe/Paris")!
private let chicago = TimeZone(identifier: "America/Chicago")!

private func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 0, _ minute: Int = 0, _ second: Int = 0, in zone: TimeZone) -> Date {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = zone
  return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute, second: second))!
}

@Test func calendarDateValuesUseTheirOwnParameters() {
  let utc = CalendarDate.parse("20260912T140000Z")
  #expect(utc?.timeZone?.secondsFromGMT() == 0)
  #expect(utc?.isAllDay == false)
  #expect(CalendarDate.parse("20280229", parameters: ["VALUE": "DATE"])?.isAllDay == true)
  #expect(CalendarDate.parse("20280229")?.timeZone == nil)
  #expect(CalendarDate.parse("20260230") == nil)
  #expect(CalendarDate.parse("20261301T000000") == nil)
  #expect(CalendarDate.parse("2026-09-12") == nil)
  #expect(CalendarDate.parse("20260912T140000", parameters: ["TZID": "America/Chicago"])?.timeZone == chicago)
  #expect(CalendarDate.parse("20260912T140000", parameters: ["TZID": "/mozilla.org/20070129_1/Europe/Paris"])?.timeZone == paris)
  // Floating local time: no zone, interpreted in the person's zone.
  let floating = CalendarDate.parse("20260912T140000", floatingIn: paris)
  #expect(floating?.timeZone == nil)
  #expect(floating?.date == date(2026, 9, 12, 14, in: paris))
  // An unknown Windows zone name stays local rather than guessing.
  #expect(CalendarDate.parse("20260912T140000", parameters: ["TZID": "W. Europe Standard Time"])?.timeZone == nil)
  #expect(CalendarDate.duration("PT1H30M") == 5_400)
  #expect(CalendarDate.duration("P1D") == 86_400)
  #expect(CalendarDate.duration("P2W") == 1_209_600)
  #expect(CalendarDate.duration("-PT15M") == -900)
  #expect(CalendarDate.duration("P1M") == nil)
  #expect(CalendarDate.duration("PT") == nil)
}

@Test func contentLinesSplitParametersAndHonourQuotes() throws {
  let line = try #require(ICalFields.parse(#"DTSTART;TZID="Europe/Paris";VALUE=DATE-TIME:20260912T140000"#))
  #expect(line.name == "DTSTART")
  #expect(line.parameters["TZID"] == "Europe/Paris")
  #expect(line.parameters["VALUE"] == "DATE-TIME")
  #expect(line.rawValue == "20260912T140000")
  let quotedColon = try #require(ICalFields.parse(#"ATTENDEE;CN="Doe: Jane":mailto:jane@example.com"#))
  #expect(quotedColon.parameters["CN"] == "Doe: Jane")
  #expect(quotedColon.rawValue == "mailto:jane@example.com")
  #expect(ICalFields.unescape(#"a\\nb\nc\Nd\,e\;f"#) == "a\\nb\nc\nd,e;f")
}

@Test func timeZoneComesFromTheEventNotAVTimezoneBlock() throws {
  let export = """
  BEGIN:VCALENDAR
  BEGIN:VTIMEZONE
  TZID:America/Chicago
  BEGIN:STANDARD
  DTSTART:19701101T020000
  END:STANDARD
  END:VTIMEZONE
  BEGIN:VEVENT
  SUMMARY:Launch
  DTSTART;TZID=Europe/Paris;VALUE=DATE-TIME:20260912T140000
  DTEND;TZID=Europe/Paris:20260912T153000
  DESCRIPTION:Bring the deck\\, please\\nThanks
  BEGIN:VALARM
  ACTION:DISPLAY
  DESCRIPTION:Reminder
  TRIGGER:-PT15M
  END:VALARM
  END:VEVENT
  END:VCALENDAR
  """
  let parsed = ScanPayload(export)
  #expect(parsed.kind == .calendar)
  #expect(parsed.title == "Launch")
  let draft = try #require(parsed.calendarEventDraft)
  #expect(draft.timeZone == paris)
  #expect(draft.start == date(2026, 9, 12, 14, in: paris))
  #expect(draft.end == date(2026, 9, 12, 15, 30, in: paris))
  #expect(draft.notes == "Bring the deck, please\nThanks")
  #expect(!draft.isAllDay)
  #expect(!parsed.details.contains("BEGIN:"))
  #expect(parsed.details.contains("Bring the deck, please"))
  #expect(parsed.details.contains("Central European"))
  #expect(parsed.historyEvent(at: Date()).summary == "Launch")
}

@Test func floatingAndUTCEventsKeepTheirMeaning() throws {
  let floating = try #require(CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART:20260912T090000\nEND:VEVENT", localZone: chicago))
  #expect(floating.timeZone == nil)
  #expect(floating.start == date(2026, 9, 12, 9, in: chicago))
  #expect(floating.end == floating.start.addingTimeInterval(CalendarEventDraft.defaultTimedDuration))
  #expect(floating.title == "Calendar event")
  let utc = try #require(CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART:20260912T140000Z\nDURATION:PT45M\nEND:VEVENT"))
  #expect(utc.timeZone?.secondsFromGMT() == 0)
  #expect(utc.end.timeIntervalSince(utc.start) == 2_700)
}

@Test func allDayEventsSpanWholeDaysForEventKit() throws {
  let single = try #require(CalendarEventDraft(icalendar: "BEGIN:VEVENT\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:20260912\nDTEND;VALUE=DATE:20260913\nEND:VEVENT", localZone: paris))
  #expect(single.isAllDay)
  #expect(single.timeZone == nil)
  #expect(single.start == date(2026, 9, 12, in: paris))
  #expect(single.end == date(2026, 9, 12, 23, 59, 59, in: paris))
  let noEnd = try #require(CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260912\nEND:VEVENT", localZone: paris))
  #expect(noEnd.end == single.end)
  let threeDays = try #require(CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART;VALUE=DATE:20260912\nDTEND;VALUE=DATE:20260915\nEND:VEVENT", localZone: paris))
  #expect(threeDays.end == date(2026, 9, 14, 23, 59, 59, in: paris))
  // Across a daylight-saving change the day is still a calendar day.
  let dst = try #require(CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261025\nEND:VEVENT", localZone: paris))
  #expect(dst.end == date(2026, 10, 25, 23, 59, 59, in: paris))
  let parsed = ScanPayload("BEGIN:VEVENT\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:20260912\nLOCATION:Beach\nEND:VEVENT")
  #expect(parsed.details.contains("All day"))
  #expect(parsed.details.contains("Beach"))
}

@Test func calendarEventsRejectMalformedOrAmbiguousData() {
  for raw in [
    "BEGIN:VEVENT\nDTSTART:not-a-date\nEND:VEVENT",
    "BEGIN:VEVENT\nSUMMARY:x",
    "BEGIN:VEVENT\nDTSTART:20260912T140000Z\nDTEND:garbage\nEND:VEVENT",
    "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260912T140000Z\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20260913T140000Z\nEND:VEVENT\nEND:VCALENDAR",
  ] {
    #expect(ScanPayload(raw).kind == .text, "\(raw)")
  }
  // Only web links are attached to the event.
  let draft = CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART:20260912T140000Z\nURL:javascript:alert(1)\nEND:VEVENT")
  #expect(draft?.url == nil)
  let linked = CalendarEventDraft(icalendar: "BEGIN:VEVENT\nDTSTART:20260912T140000Z\nURL:https://example.com/e\nEND:VEVENT")
  #expect(linked?.url?.absoluteString == "https://example.com/e")
}
