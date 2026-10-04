import Foundation

/// iCalendar DATE and DATE-TIME values (RFC 5545 §3.3.4–3.3.5).
enum CalendarDate {
  struct Value: Equatable {
    let date: Date
    let isAllDay: Bool
    /// Nil for all-day dates and floating local times, which stay at the same wall-clock
    /// time wherever the person is.
    let timeZone: TimeZone?
  }

  /// Parses a `DTSTART` or `DTEND` line, using its own `TZID` and `VALUE` parameters.
  static func parse(_ line: ICalLine?, floatingIn localZone: TimeZone = .current) -> Value? {
    guard let line else { return nil }
    return parse(line.rawValue, parameters: line.parameters, floatingIn: localZone)
  }

  /// - Parameters:
  ///   - value: `20260912`, `20260912T140000`, or `20260912T140000Z`.
  ///   - parameters: Line parameters. `TZID` applies only to local DATE-TIME values.
  ///   - localZone: How floating times and all-day dates become a `Date`.
  static func parse(_ value: String, parameters: [String: String] = [:], floatingIn localZone: TimeZone = .current) -> Value? {
    let value = value.trimmingCharacters(in: .whitespaces)
    guard value.range(of: #"^[0-9]{8}(T[0-9]{6}Z?)?$"#, options: .regularExpression) != nil else { return nil }
    let isAllDay = value.count == 8
    let isUTC = value.hasSuffix("Z")
    let zone: TimeZone? = isAllDay ? nil : isUTC ? TimeZone(identifier: "UTC") : parameters["TZID"].flatMap(timeZone(named:))
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = zone ?? localZone
    formatter.dateFormat = isAllDay ? "yyyyMMdd" : isUTC ? "yyyyMMdd'T'HHmmss'Z'" : "yyyyMMdd'T'HHmmss"
    formatter.isLenient = false
    // A round trip rejects dates the formatter would roll over, such as February 30.
    guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
    return Value(date: date, isAllDay: isAllDay, timeZone: zone)
  }

  /// Resolves IANA names, including Mozilla-style `/mozilla.org/20070129_1/Europe/Berlin`.
  /// Unknown names, such as Windows zone names, return nil and the time is treated as local.
  static func timeZone(named name: String) -> TimeZone? {
    let name = name.trimmingCharacters(in: CharacterSet(charactersIn: "\" ").union(.whitespaces))
    if let zone = TimeZone(identifier: name) { return zone }
    let parts = name.split(separator: "/")
    for count in [3, 2] where parts.count > count {
      if let zone = TimeZone(identifier: parts.suffix(count).joined(separator: "/")) { return zone }
    }
    return nil
  }

  /// `P1D`, `PT1H30M`, `P2W`, `-PT15M` (RFC 5545 §3.3.6). Months and years are not allowed.
  static func duration(_ value: String) -> TimeInterval? {
    var text = Substring(value.trimmingCharacters(in: .whitespaces).uppercased())
    var sign: Double = 1
    if text.first == "+" || text.first == "-" { sign = text.removeFirst() == "-" ? -1 : 1 }
    guard text.first == "P" else { return nil }
    text.removeFirst()
    var total: Double = 0, number = "", inTime = false, sawComponent = false
    for character in text {
      if character.isASCII, character.isNumber { number.append(character); continue }
      if character == "T", number.isEmpty, !inTime { inTime = true; continue }
      guard let amount = Double(number) else { return nil }
      switch (character, inTime) {
      case ("W", false): total += amount * 604_800
      case ("D", false): total += amount * 86_400
      case ("H", true): total += amount * 3_600
      case ("M", true): total += amount * 60
      case ("S", true): total += amount
      default: return nil
      }
      number = ""
      sawComponent = true
    }
    guard number.isEmpty, sawComponent else { return nil }
    return sign * total
  }
}
