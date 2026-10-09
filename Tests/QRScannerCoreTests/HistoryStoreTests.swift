import Foundation
import Testing
@testable import QRScannerCore

private func temporaryDirectory() -> URL {
  FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
}

private func writeHistory(_ json: String, to directory: URL) throws -> URL {
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let file = directory.appendingPathComponent("history-v1.json")
  try Data(json.utf8).write(to: file)
  return file
}

/// The event shape the shipping app decodes. New writes must stay readable by it.
private struct ShippingEnvelope: Codable {
  struct Event: Codable, Equatable {
    let id: String
    let acceptedAt: String
    let kind: String
    let summary: String?
    let original: String?
    let parserVersion: Int
    var format: CodeFormat? = nil
  }
  let version: Int
  let events: [Event]
}

@Test func unsupportedHistoryVersionThrowsAndLeavesTheFile() throws {
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  let json = #"{"version":2,"events":[]}"#
  let file = try writeHistory(json, to: directory)
  #expect(throws: HistoryStore.StoreError.unsupportedFormat) { try HistoryStore(directory: directory) }
  #expect(try String(contentsOf: file, encoding: .utf8) == json)
}

@Test func historyLoadsNewestFirstWithAndWithoutFractionalSeconds() throws {
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  _ = try writeHistory(#"""
  {"version":1,"events":[
    {"id":"old","acceptedAt":"2026-09-20T08:00:00Z","kind":"text","summary":"old","original":"old","parserVersion":1},
    {"id":"new","acceptedAt":"2026-09-22T12:00:00.250Z","kind":"url","summary":"new","original":"https://example.com","parserVersion":1},
    {"id":"offset","acceptedAt":"2026-09-21T14:00:00+02:00","kind":"text","summary":null,"original":"offset","parserVersion":2},
    {"id":"bad","acceptedAt":"not a date","kind":"mystery","original":"bad","parserVersion":1}
  ]}
  """#, to: directory)
  let store = try HistoryStore(directory: directory)
  #expect(store.events.map(\.id) == ["new", "offset", "old", "bad"])
  #expect(store.events[0].date == Date(timeIntervalSince1970: 1_790_078_400.25))
  #expect(store.events[1].date == Date(timeIntervalSince1970: 1_789_992_000))
  #expect(store.events[2].date == Date(timeIntervalSince1970: 1_789_891_200))
  #expect(store.events[3].date == .distantPast)
  #expect(store.events[3].category == .unknown("mystery"))
  #expect(store.events[1].summary == nil)
}

@Test func recordingKeepsNewestFirstWhenTheClockMovesBack() throws {
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  let store = try HistoryStore(directory: directory)
  let now = Date(timeIntervalSince1970: 1_800_000_000)
  try store.record(ScanPayload("first"), at: now)
  try store.record(ScanPayload("earlier clock"), at: now.addingTimeInterval(-3600))
  try store.record(ScanPayload("latest"), at: now.addingTimeInterval(60))
  #expect(store.events.map(\.original) == ["latest", "first", "earlier clock"])
  #expect(try HistoryStore(directory: directory).events.map(\.original) == ["latest", "first", "earlier clock"])
}

@Test func equalTimestampsKeepSavedOrder() {
  let events = (0..<5).map { historyEvent("e\($0)", "2026-09-22T12:00:00.000Z") }
  #expect(HistoryStore.newestFirst(events).map(\.id) == ["e0", "e1", "e2", "e3", "e4"])
}

@Test func writesRoundTripTheV1EnvelopeForTheShippingDecoder() throws {
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  let file = try writeHistory(#"{"version":1,"events":[{"id":"legacy","acceptedAt":"2026-09-22T12:00:00.000Z","kind":"url","summary":"example.com/old","original":"https://example.com/old","parserVersion":1}]}"#, to: directory)
  let store = try HistoryStore(directory: directory)
  let ean = CodeFormat(rawValue: "VNBarcodeSymbologyEAN13")
  try store.record(ScanPayload("3017624010701", format: ean), at: Date(timeIntervalSince1970: 1_800_000_000.5))
  try store.record(ScanPayload("otpauth://totp/A?secret=JBSWY3DPEHPK3PXP"), at: Date(timeIntervalSince1970: 1_800_000_001))

  let data = try Data(contentsOf: file)
  let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
  #expect(Set(object.keys) == ["version", "events"])
  #expect(object["version"] as? Int == 1)
  let rows = try #require(object["events"] as? [[String: Any]])
  let allowed: Set<String> = ["id", "acceptedAt", "kind", "summary", "original", "parserVersion", "format"]
  #expect(rows.allSatisfy { Set($0.keys).isSubset(of: allowed) })
  #expect(rows[1]["acceptedAt"] as? String == "2027-01-15T08:00:00.500Z")

  let shipping = try JSONDecoder().decode(ShippingEnvelope.self, from: data)
  #expect(shipping.events.map(\.id).last == "legacy")
  #expect(shipping.events[0].kind == "auth")
  #expect(shipping.events[0].original == "otpauth://totp/A?secret=JBSWY3DPEHPK3PXP")
  #expect(shipping.events[1].format == ean)
  #expect(try HistoryStore(directory: directory).events == store.events)
}

@Test func recordingCapsHistoryAtTheNewestEvents() throws {
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  let start = Date(timeIntervalSince1970: 1_700_000_000)
  let count = HistoryStore.maximumEventCount + 3
  let events = (0..<count).map { index in
    historyEvent("e\(index)", HistoryEvent.timestamp(start.addingTimeInterval(Double(index) * 60)))
  }
  let data = try JSONEncoder().encode(ShippingEnvelope(version: 1, events: events.map {
    .init(id: $0.id, acceptedAt: $0.acceptedAt, kind: $0.kind, summary: $0.summary, original: $0.original, parserVersion: $0.parserVersion)
  }))
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let file = directory.appendingPathComponent("history-v1.json")
  try data.write(to: file)

  // Opening never trims or rewrites.
  let store = try HistoryStore(directory: directory)
  #expect(store.events.count == count)
  #expect(try Data(contentsOf: file) == data)

  try store.record(ScanPayload("newest"), at: start.addingTimeInterval(Double(count) * 60))
  #expect(store.events.count == HistoryStore.maximumEventCount)
  #expect(store.events.first?.original == "newest")
  #expect(store.events.last?.id == "e4")
}

@Test func deletingAMissingRowDoesNotWrite() throws {
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  let store = try HistoryStore(directory: directory)
  try store.delete(id: "missing")
  #expect(!FileManager.default.fileExists(atPath: store.fileURL.path))
}

@Test func persistedKindsMapToTypedCategories() {
  #expect(HistoryEvent.Category(persisted: "redacted") == .redacted)
  #expect(HistoryEvent.Category(persisted: "wifi") == .wifi)
  #expect(HistoryEvent.Category(persisted: "boardingPass") == .boardingPass)
  #expect(HistoryEvent.Category(persisted: "url") == .payload(.url))
  #expect(HistoryEvent.Category(persisted: "legacy-kind") == .unknown("legacy-kind"))
  for value in ["redacted", "wifi", "boardingPass", "url", "product", "legacy-kind"] {
    #expect(HistoryEvent.Category(persisted: value).persistedValue == value)
  }
  #expect(!HistoryEvent.Category.wifi.withholdsPayload)
  #expect(!HistoryEvent.Category.payload(.url).withholdsPayload)
  // What the payload parser writes stays consistent with the categories.
  #expect(ScanPayload("WIFI:T:WPA;S:Office;P:secret;;").historyEvent(at: Date()).category == .wifi)
  #expect(ScanPayload("otpauth://totp/A?secret=JBSWY3DPEHPK3PXP").historyEvent(at: Date()).category == .payload(.auth))
  #expect(ScanPayload("https://example.com").historyEvent(at: Date()).category == .payload(.url))
}

@Test func historyPerformanceStaysInteractiveAtFiveThousandEvents() throws {
  let start = Date(timeIntervalSince1970: 1_780_000_000)
  // Shuffled input, roughly 25 scans a day for 200 days.
  var events = (0..<5_000).map { index in
    historyEvent("e\(index)", HistoryEvent.timestamp(start.addingTimeInterval(Double(index) * 3_456)))
  }
  var generator = SeededGenerator(seed: 7)
  events.shuffle(using: &generator)
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
  let now = start.addingTimeInterval(5_000 * 3_456)

  let clock = ContinuousClock()
  var sections: [HistorySection] = []
  let grouping = clock.measure {
    sections = HistorySections.make(events, now: now, calendar: calendar, locale: Locale(identifier: "en_US"))
  }
  #expect(sections.reduce(0) { $0 + $1.events.count } == 5_000)
  #expect(sections.count >= 199 && sections.count <= 201)
  #expect(grouping < .milliseconds(400), "Grouping took \(grouping)")

  let envelope = try JSONEncoder().encode(ShippingEnvelope(version: 1, events: events.map {
    .init(id: $0.id, acceptedAt: $0.acceptedAt, kind: $0.kind, summary: $0.summary, original: $0.original, parserVersion: $0.parserVersion)
  }))
  let directory = temporaryDirectory()
  defer { try? FileManager.default.removeItem(at: directory) }
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  try envelope.write(to: directory.appendingPathComponent("history-v1.json"))
  // The first open after an update re-checks older rows once; the next save marks them current.
  var store: HistoryStore?
  let migrating = try clock.measure { store = try HistoryStore(directory: directory) }
  #expect(store?.events.count == 5_000)
  #expect(store?.events.allSatisfy { $0.parserVersion == ScanPayload.historyParserVersion } == true)
  // Any save persists the current version; deleting and restoring a row is one.
  let first = try #require(store?.events.first)
  try store?.delete(id: first.id)
  try store?.restore(first)

  let opening = try clock.measure { store = try HistoryStore(directory: directory) }
  #expect(store?.events.count == 5_000)
  // Generous bound for unoptimized test builds on shared runners; decoding is the cost, not date parsing.
  #expect(opening < .milliseconds(500), "Opening took \(opening)")
  #expect(migrating < .seconds(5), "First open after an update took \(migrating)")
  print("5,000 events: group+sort \(grouping), first open \(migrating), open \(opening)")
}

struct SeededGenerator: RandomNumberGenerator {
  private var state: UInt64
  init(seed: UInt64) { state = seed }
  mutating func next() -> UInt64 {
    state = state &* 6364136223846793005 &+ 1442695040888963407
    return state
  }
}

@Test func olderSavedPayloadsStayIntactWhenReclassifiedAndSaved() throws {
  let directory = temporaryDirectory()
  let pass = "M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100"
  let phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident"
  let json = """
    {"version":1,"events":[
    {"id":"pass","acceptedAt":"2026-09-22T12:00:03.000Z","kind":"text","summary":"\(pass)","original":"\(pass)","parserVersion":3},
    {"id":"phrase","acceptedAt":"2026-09-22T12:00:02.000Z","kind":"text","summary":"\(phrase)","original":"\(phrase)","parserVersion":3},
    {"id":"reset","acceptedAt":"2026-09-22T12:00:01.000Z","kind":"url","summary":"example.com/reset","original":"https://example.com/reset?token=abc","parserVersion":3},
    {"id":"plain","acceptedAt":"2026-09-22T12:00:00.000Z","kind":"url","summary":"example.com/old","original":"https://example.com/old","parserVersion":1}
    ]}
    """
  let file = try writeHistory(json, to: directory)
  let store = try HistoryStore(directory: directory)
  let byID = Dictionary(uniqueKeysWithValues: store.events.map { ($0.id, $0) })

  #expect(byID["pass"]?.original == pass)
  #expect(byID["pass"]?.category == .boardingPass)
  #expect(byID["phrase"]?.original == phrase)
  #expect(byID["phrase"]?.summary == "Recovery phrase")
  #expect(byID["reset"]?.original == "https://example.com/reset?token=abc")
  #expect(byID["plain"]?.original == "https://example.com/old")
  #expect(store.events.map(\.id) == ["pass", "phrase", "reset", "plain"])
  // Loading alone leaves the file untouched.
  #expect(try String(contentsOf: file, encoding: .utf8) == json)

  try store.delete(id: "plain")
  let saved = try String(contentsOf: file, encoding: .utf8)
  #expect(saved.contains("DESMARAIS"))
  #expect(saved.contains("abandon"))
  #expect(saved.contains("token=abc"))
}
