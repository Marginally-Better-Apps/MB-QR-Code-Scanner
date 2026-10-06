import Foundation

/// The event to offer in Add Event, independent of EventKit.
///
/// `end` follows EventKit conventions: for all-day events it is inclusive (the last second of
/// the last day), so a one-day event `DTSTART;VALUE=DATE:20260912` spans exactly September 12.
struct CalendarEventDraft: Equatable {
  static let defaultTimedDuration: TimeInterval = 3_600
  static let titleLimit = 1_000

  var title: String
  var location: String?
  var url: URL?
  var notes: String?
  var start: Date
  var end: Date
  var isAllDay: Bool
  /// Nil for all-day events and floating local times.
  var timeZone: TimeZone?

  /// Reads the first `VEVENT`. Nil unless it has exactly one event with a valid start and,
  /// if present, a valid end.
  init?(icalendar raw: String, localZone: TimeZone = .current) {
    let lines = ICalFields.lines(raw)
    guard ICalFields.count("VEVENT", in: lines) == 1, let event = ICalFields.firstComponent("VEVENT", in: lines),
      let start = CalendarDate.parse(event.property("DTSTART"), floatingIn: localZone) else { return nil }
    let endLine = event.property("DTEND")
    let explicitEnd = CalendarDate.parse(endLine, floatingIn: localZone)
    if endLine != nil, explicitEnd == nil { return nil }
    let duration = event.property("DURATION").flatMap { CalendarDate.duration($0.rawValue) }

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = localZone
    let end: Date
    if start.isAllDay {
      // iCalendar's all-day DTEND is exclusive; EventKit expects the last moment of the last day.
      let oneDay = calendar.date(byAdding: .day, value: 1, to: start.date) ?? start.date.addingTimeInterval(86_400)
      var exclusiveEnd = explicitEnd.map { calendar.startOfDay(for: $0.date) }
        ?? duration.flatMap { calendar.date(byAdding: .day, value: max(1, Int(($0 / 86_400).rounded())), to: start.date) }
        ?? oneDay
      if exclusiveEnd <= start.date { exclusiveEnd = oneDay }
      end = exclusiveEnd.addingTimeInterval(-1)
    } else {
      let proposed = explicitEnd?.date ?? duration.map { start.date.addingTimeInterval($0) } ?? start.date.addingTimeInterval(Self.defaultTimedDuration)
      end = max(proposed, start.date)
    }

    let summary = event.property("SUMMARY").map { TextSanitizer.title($0.text, limit: Self.titleLimit) } ?? ""
    title = summary.isEmpty ? String(localized: "Calendar event") : summary
    location = event.property("LOCATION").map { TextSanitizer.title($0.text, limit: Self.titleLimit) }.flatMap { $0.isEmpty ? nil : $0 }
    notes = event.property("DESCRIPTION").map { TextSanitizer.details($0.text) }.flatMap { $0.isEmpty ? nil : $0 }
    // Only ordinary web links are attached; never tel:, app, or script links.
    url = event.property("URL").flatMap { line in
      let parsed = ScanPayload(line.text)
      return parsed.kind == .url ? parsed.openURL : nil
    }
    self.start = start.date
    self.end = end
    isAllDay = start.isAllDay
    timeZone = start.isAllDay ? nil : start.timeZone
  }

  /// When, how long, where, and notes, for the details view.
  func summary(locale: Locale = .current, localZone: TimeZone = .current) -> String {
    let formatter = DateIntervalFormatter()
    formatter.locale = locale
    var lines: [String] = []
    if isAllDay {
      formatter.timeZone = localZone
      formatter.dateStyle = .medium
      formatter.timeStyle = .none
      lines.append(formatter.string(from: start, to: end))
      lines.append(String(localized: "All day"))
    } else {
      // UTC times are instants, shown in local time. A named zone is shown as written, with its name.
      let named = timeZone.flatMap { $0.secondsFromGMT() == 0 && ["UTC", "GMT"].contains($0.identifier) ? nil : $0 }
      formatter.timeZone = named ?? localZone
      formatter.dateStyle = .medium
      formatter.timeStyle = .short
      lines.append(formatter.string(from: start, to: end))
      if let named { lines.append(named.localizedName(for: .generic, locale: locale) ?? named.identifier) }
    }
    if let location { lines.append(location) }
    if let notes { lines.append(notes) }
    return lines.joined(separator: "\n")
  }
}

/// `BEGIN:VEVENT` or `BEGIN:VCALENDAR` with exactly one event.
enum CalendarParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    let upper = input.raw.uppercased()
    guard upper.hasPrefix("BEGIN:VEVENT") || upper.hasPrefix("BEGIN:VCALENDAR") else { return nil }
    guard let event = CalendarEventDraft(icalendar: input.raw) else { return .text(input) }
    let summary = ICalFields.firstComponent("VEVENT", in: ICalFields.lines(input.raw))?.property("SUMMARY")?.text ?? ""
    return ParsedPayload(kind: .calendar, title: event.title, details: event.summary(),
      summary: summary.isEmpty ? "Calendar event" : summary)
  }
}
