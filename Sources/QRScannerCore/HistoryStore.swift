import Foundation

struct HistoryEvent: Codable, Identifiable, Equatable {
  let id: String
  let acceptedAt: String
  let kind: String
  let summary: String?
  let original: String?
  let parserVersion: Int
  var format: CodeFormat? = nil
  /// Parsed once from `acceptedAt`; sorting and grouping never touch a formatter.
  let date: Date

  init(id: String, acceptedAt: String, kind: String, summary: String?, original: String?, parserVersion: Int, format: CodeFormat? = nil) {
    self.id = id
    self.acceptedAt = acceptedAt
    self.kind = kind
    self.summary = summary
    self.original = original
    self.parserVersion = parserVersion
    self.format = format
    date = HistoryTimestamp.date(from: acceptedAt)
  }

  // `date` is derived, so the persisted keys stay exactly those of the v1 envelope.
  private enum CodingKeys: String, CodingKey {
    case id, acceptedAt, kind, summary, original, parserVersion, format
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      id: try container.decode(String.self, forKey: .id),
      acceptedAt: try container.decode(String.self, forKey: .acceptedAt),
      kind: try container.decode(String.self, forKey: .kind),
      summary: try container.decodeIfPresent(String.self, forKey: .summary),
      original: try container.decodeIfPresent(String.self, forKey: .original),
      parserVersion: try container.decode(Int.self, forKey: .parserVersion),
      format: try container.decodeIfPresent(CodeFormat.self, forKey: .format))
  }

  static func timestamp(_ date: Date) -> String { HistoryTimestamp.string(from: date) }

  /// The typed meaning of the persisted `kind` string. Unknown values are kept, not rejected.
  enum Category: Equatable, Hashable {
    case redacted
    case wifi
    case boardingPass
    case payload(ScanPayload.Kind)
    case unknown(String)

    init(persisted value: String) {
      switch value {
      case "redacted": self = .redacted
      case "wifi": self = .wifi
      case "boardingPass": self = .boardingPass
      default: self = ScanPayload.Kind(rawValue: value).map(Category.payload) ?? .unknown(value)
      }
    }

    var persistedValue: String {
      switch self {
      case .redacted: "redacted"
      case .wifi: "wifi"
      case .boardingPass: "boardingPass"
      case .payload(let kind): kind.rawValue
      case .unknown(let value): value
      }
    }

    /// Rows whose raw payload was deliberately never written to disk.
    var withholdsPayload: Bool {
      switch self {
      case .redacted, .wifi, .boardingPass: true
      case .payload, .unknown: false
      }
    }
  }

  var category: Category { Category(persisted: kind) }
}

/// ISO 8601 timestamps as written by the React Native and Swift versions.
enum HistoryTimestamp {
  // Format styles are value types and parse roughly 40x faster than ISO8601DateFormatter.
  private static let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
  private static let whole = Date.ISO8601FormatStyle()
  // Writing keeps the formatter the app has always used, so new rows round identically.
  private static let writer: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  static func date(from value: String) -> Date {
    (try? fractional.parse(value)) ?? (try? whole.parse(value)) ?? .distantPast
  }

  static func string(from date: Date) -> String { writer.string(from: date) }
}

/// Persistent scan History. `HistoryStore` is the file-backed implementation.
protocol HistoryRepository: AnyObject {
  /// Newest first.
  var events: [HistoryEvent] { get }
  @discardableResult func record(_ payload: ScanPayload, at date: Date) throws -> HistoryEvent
  func delete(id: String) throws
  func restore(_ event: HistoryEvent) throws
  func clear() throws
}

final class HistoryStore: HistoryRepository {
  private struct Envelope: Codable {
    let version: Int
    let events: [HistoryEvent]
  }
  enum StoreError: Error { case unsupportedFormat }
  /// Recording keeps at most this many of the newest scans. Opening never trims or rewrites.
  static let maximumEventCount = 5_000
  private(set) var events: [HistoryEvent]
  let fileURL: URL

  init(directory: URL) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    fileURL = directory.appendingPathComponent("history-v1.json")
    if FileManager.default.fileExists(atPath: fileURL.path) {
      // A read or decode failure throws before anything is written, so the file is left as is.
      let data = try Data(contentsOf: fileURL)
      let envelope = try JSONDecoder().decode(Envelope.self, from: data)
      guard envelope.version == 1 else { throw StoreError.unsupportedFormat }
      events = Self.newestFirst(envelope.events)
    } else {
      events = []
    }
    #if os(iOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: directory.path)
    #endif
  }

  @discardableResult
  func record(_ payload: ScanPayload, at date: Date) throws -> HistoryEvent {
    let event = payload.historyEvent(at: date)
    var next = events
    // A clock change can make a new scan older than existing rows; keep newest-first order.
    next.insert(event, at: next.firstIndex { $0.date <= event.date } ?? next.endIndex)
    if next.count > Self.maximumEventCount { next.removeLast(next.count - Self.maximumEventCount) }
    try commit(next)
    return event
  }

  func delete(id: String) throws {
    guard events.contains(where: { $0.id == id }) else { return }
    try commit(events.filter { $0.id != id })
  }

  func restore(_ event: HistoryEvent) throws {
    guard !events.contains(where: { $0.id == event.id }) else { return }
    var next = events
    next.insert(event, at: next.firstIndex { $0.date < event.date } ?? next.endIndex)
    try commit(next)
  }

  func clear() throws { try commit([]) }

  private func commit(_ next: [HistoryEvent]) throws {
    let data = try JSONEncoder().encode(Envelope(version: 1, events: next))
    #if os(iOS)
    try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    #else
    try data.write(to: fileURL, options: .atomic)
    #endif
    events = next
  }

  /// Stable: rows with identical timestamps keep their saved order.
  static func newestFirst(_ events: [HistoryEvent]) -> [HistoryEvent] {
    events.enumerated().sorted { lhs, rhs in
      lhs.element.date != rhs.element.date ? lhs.element.date > rhs.element.date : lhs.offset < rhs.offset
    }.map(\.element)
  }
}
