import Foundation

struct HistoryEvent: Codable, Identifiable, Equatable {
  let id: String
  let acceptedAt: String
  let kind: String
  let summary: String?
  let original: String?
  let parserVersion: Int
  var date: Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: acceptedAt) ?? ISO8601DateFormatter().date(from: acceptedAt) ?? .distantPast
  }
  static func timestamp(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}

final class HistoryStore {
  private struct Envelope: Codable {
    let version: Int
    let events: [HistoryEvent]
  }
  enum StoreError: Error { case unsupportedFormat }
  private(set) var events: [HistoryEvent]
  let fileURL: URL

  init(directory: URL) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    fileURL = directory.appendingPathComponent("history-v1.json")
    if FileManager.default.fileExists(atPath: fileURL.path) {
      let data = try Data(contentsOf: fileURL)
      let envelope = try JSONDecoder().decode(Envelope.self, from: data)
      guard envelope.version == 1 else { throw StoreError.unsupportedFormat }
      events = envelope.events.sorted { $0.date > $1.date }
    } else {
      events = []
    }
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: directory.path)
    #endif
  }

  func record(_ payload: ScanPayload, at date: Date) throws {
    try commit([payload.historyEvent(at: date)] + events)
  }

  func delete(id: String) throws {
    try commit(events.filter { $0.id != id })
  }

  func restore(_ event: HistoryEvent) throws {
    guard !events.contains(where: { $0.id == event.id }) else { return }
    try commit((events + [event]).sorted { $0.date > $1.date })
  }

  func clear() throws { try commit([]) }

  private func commit(_ next: [HistoryEvent]) throws {
    let data = try JSONEncoder().encode(Envelope(version: 1, events: next))
    try data.write(to: fileURL, options: .atomic)
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: fileURL.path)
    #endif
    events = next
  }
}
