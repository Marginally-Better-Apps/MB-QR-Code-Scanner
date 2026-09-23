import Foundation

enum CalendarDate {
  static func parse(_ value: String?, raw: String, name: String) -> (date: Date, allDay: Bool, timeZone: TimeZone)? {
    guard let value else { return nil }
    let line = raw.components(separatedBy: .newlines).first { $0.uppercased().hasPrefix(name) } ?? ""
    let zoneName = line.components(separatedBy: ";TZID=").dropFirst().first?.components(separatedBy: ":").first
    let zone = value.hasSuffix("Z") ? TimeZone(secondsFromGMT: 0)! : zoneName.flatMap(TimeZone.init(identifier:)) ?? .current
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = zone
    formatter.dateFormat = value.count == 8 ? "yyyyMMdd" : value.hasSuffix("Z") ? "yyyyMMdd'T'HHmmss'Z'" : "yyyyMMdd'T'HHmmss"
    guard let date = formatter.date(from: value) else { return nil }
    return (date, value.count == 8, zone)
  }
}
