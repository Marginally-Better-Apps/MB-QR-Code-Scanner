import Foundation
import Testing
@testable import QRScannerCore

private func calendar(_ zone: String) -> Calendar {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(identifier: zone)!
  return calendar
}

private func date(_ text: String, _ zone: String) -> Date {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.timeZone = TimeZone(identifier: zone)!
  formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
  return formatter.date(from: text)!
}

private let english = Locale(identifier: "en_US")

private func label(_ day: String, now: String, zone: String = "America/New_York", locale: Locale = english) -> HistoryDayLabel {
  HistoryDayLabel.make(for: date(day, zone), now: date(now, zone), calendar: calendar(zone), locale: locale)
}

@Test func dayLabelsUseTodayYesterdayWeekdaysThenDates() {
  let now = "2026-09-22T09:00:00"
  #expect(label("2026-09-22T00:00:00", now: now) == .today)
  #expect(label("2026-09-21T23:59:59", now: now) == .yesterday)
  #expect(label("2026-09-21T00:00:00", now: now) == .yesterday)
  #expect(label("2026-09-20T23:59:59", now: now) == .weekday("Sunday"))
  #expect(label("2026-09-16T12:00:00", now: now) == .weekday("Wednesday"))
  #expect(label("2026-09-15T12:00:00", now: now) == .date("September 15, 2026"))
  // A clock change can leave rows dated in the future.
  #expect(label("2026-09-23T08:00:00", now: now) == .date("September 23, 2026"))
}

@Test func dayLabelsFlipExactlyAtMidnight() {
  #expect(label("2026-09-21T23:59:59", now: "2026-09-21T23:59:59") == .today)
  #expect(label("2026-09-21T23:59:59", now: "2026-09-22T00:00:00") == .yesterday)
}

@Test func dayLabelsHandleLeapDay() {
  #expect(label("2028-02-29T12:00:00", now: "2028-03-01T08:00:00") == .yesterday)
  #expect(label("2028-02-28T12:00:00", now: "2028-03-01T08:00:00") == .weekday("Monday"))
  #expect(label("2028-02-29T12:00:00", now: "2028-03-06T08:00:00") == .weekday("Tuesday"))
  #expect(label("2028-02-29T12:00:00", now: "2028-03-07T08:00:00") == .date("February 29, 2028"))
}

@Test func dayLabelsCountCalendarDaysAcrossDaylightSavingChanges() {
  // Spring forward: March 8, 2026 has 23 hours in New York.
  #expect(label("2026-03-08T00:30:00", now: "2026-03-09T00:10:00") == .yesterday)
  #expect(label("2026-03-07T23:30:00", now: "2026-03-09T00:10:00") == .weekday("Saturday"))
  // Fall back: November 1, 2026 has 25 hours.
  #expect(label("2026-11-01T00:05:00", now: "2026-11-02T00:10:00") == .yesterday)
  #expect(label("2026-11-01T23:55:00", now: "2026-11-02T00:00:00") == .yesterday)
  let sections = HistorySections.make([
    historyEvent("late", HistoryEvent.timestamp(date("2026-11-01T23:30:00", "America/New_York"))),
    historyEvent("repeated-hour", HistoryEvent.timestamp(date("2026-11-01T01:30:00", "America/New_York").addingTimeInterval(3_600))),
    historyEvent("early", HistoryEvent.timestamp(date("2026-11-01T00:30:00", "America/New_York"))),
  ], now: date("2026-11-02T08:00:00", "America/New_York"), calendar: calendar("America/New_York"), locale: english)
  #expect(sections.map(\.events.count) == [3])
  #expect(sections.first?.label == .yesterday)
}

@Test func groupingFollowsTheCalendarTimeZone() {
  // Both are September 21 in Los Angeles; in Tokyo, "a" is already the 22nd.
  let events = [
    historyEvent("a", "2026-09-22T02:00:00.000Z"),
    historyEvent("b", "2026-09-21T12:00:00.000Z"),
  ]
  let now = date("2026-09-22T10:00:00", "UTC")
  let losAngeles = HistorySections.make(events, now: now, calendar: calendar("America/Los_Angeles"), locale: english)
  #expect(losAngeles.map(\.events).map { $0.map(\.id) } == [["a", "b"]])
  #expect(losAngeles.first?.label == .yesterday)
  let tokyo = HistorySections.make(events, now: now, calendar: calendar("Asia/Tokyo"), locale: english)
  #expect(tokyo.map(\.events).map { $0.map(\.id) } == [["a"], ["b"]])
  #expect(tokyo.map(\.label) == [.today, .yesterday])
}

@Test func dayLabelsAreLocalized() {
  let spanish = Locale(identifier: "es_ES")
  let weekday = label("2028-02-28T12:00:00", now: "2028-03-01T08:00:00", locale: spanish)
  #expect(weekday == .weekday("lunes") || weekday == .weekday("Lunes"))
  let full = label("2028-02-20T12:00:00", now: "2028-03-01T08:00:00", locale: spanish)
  #expect(full == .date("20 de febrero de 2028"))
  let german = label("2028-02-20T12:00:00", now: "2028-03-01T08:00:00", locale: Locale(identifier: "de_DE"))
  #expect(german == .date("20. Februar 2028"))
}

@Test func sectionsSortNewestFirstWithinAndAcrossDays() {
  let zone = "Europe/Paris"
  let events = [
    historyEvent("mon-early", HistoryEvent.timestamp(date("2026-09-21T08:00:00", zone))),
    historyEvent("tue-late", HistoryEvent.timestamp(date("2026-09-22T21:00:00", zone))),
    historyEvent("mon-late", HistoryEvent.timestamp(date("2026-09-21T22:00:00", zone))),
    historyEvent("tue-early", HistoryEvent.timestamp(date("2026-09-22T07:00:00", zone))),
  ]
  let sections = HistorySections.make(events, now: date("2026-09-22T23:00:00", zone), calendar: calendar(zone), locale: english)
  #expect(sections.map(\.label) == [.today, .yesterday])
  #expect(sections.map { $0.events.map(\.id) } == [["tue-late", "tue-early"], ["mon-late", "mon-early"]])
  #expect(sections[0].day == date("2026-09-22T00:00:00", zone))
  #expect(HistorySections.make([], now: Date(), calendar: calendar(zone), locale: english).isEmpty)
}
