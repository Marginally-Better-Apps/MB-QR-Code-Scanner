import Foundation

/// How a History day header reads. `today` and `yesterday` are localized by the app.
enum HistoryDayLabel: Equatable, Hashable {
  case today
  case yesterday
  /// Localized full weekday name, for two to six days ago.
  case weekday(String)
  /// Localized full date, for anything older or in the future.
  case date(String)

  static func make(for day: Date, now: Date, calendar: Calendar, locale: Locale) -> HistoryDayLabel {
    let start = calendar.startOfDay(for: day)
    let today = calendar.startOfDay(for: now)
    // Day arithmetic, not seconds, so 23- and 25-hour DST days count as one day.
    let daysAgo = calendar.dateComponents([.day], from: start, to: today).day ?? .min
    switch daysAgo {
    case 0: return .today
    case 1: return .yesterday
    case 2...6:
      let style = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone, capitalizationContext: .standalone)
        .weekday(.wide)
      return .weekday(start.formatted(style))
    default:
      let style = Date.FormatStyle(date: .long, time: .omitted, locale: locale, calendar: calendar,
        timeZone: calendar.timeZone, capitalizationContext: .standalone)
      return .date(start.formatted(style))
    }
  }
}

struct HistorySection: Identifiable, Equatable {
  /// Start of the day in the grouping calendar's time zone.
  let day: Date
  let label: HistoryDayLabel
  let events: [HistoryEvent]
  var id: Date { day }
}

enum HistorySections {
  /// Groups events by calendar day, newest day first and newest event first within a day.
  /// Runs in O(n log n) for the sort plus one calendar lookup per distinct day.
  static func make(_ events: [HistoryEvent], now: Date, calendar: Calendar, locale: Locale) -> [HistorySection] {
    let sorted = HistoryStore.newestFirst(events)
    var sections: [HistorySection] = []
    var current: (interval: DateInterval, events: [HistoryEvent])?
    func close() {
      guard let current else { return }
      sections.append(HistorySection(day: current.interval.start,
        label: HistoryDayLabel.make(for: current.interval.start, now: now, calendar: calendar, locale: locale),
        events: current.events))
    }
    for event in sorted {
      if let interval = current?.interval, event.date >= interval.start, event.date < interval.end {
        current?.events.append(event)
        continue
      }
      close()
      let interval = calendar.dateInterval(of: .day, for: event.date)
        ?? DateInterval(start: calendar.startOfDay(for: event.date), duration: 86_400)
      current = (interval, [event])
    }
    close()
    return sections
  }
}
