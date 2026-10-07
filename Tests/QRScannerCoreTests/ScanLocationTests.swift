import Foundation
import Testing
@testable import QRScannerCore

@MainActor @Test func legacyLocationMetadataSurvivesRedactionAndIsSearchable() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let file = directory.appendingPathComponent("history-v1.json")
  let json = #"""
  {"version":1,"events":[
    {"id":"located","acceptedAt":"2026-09-22T12:00:00Z","kind":"url","summary":"scan","original":"https://example.com/reset?token=private","parserVersion":3,"location":{"latitude":41.88,"longitude":-87.63,"placeName":"Millennium Park, Chicago","capturedAt":"2026-09-22T12:00:00Z"}},
    {"id":"legacy","acceptedAt":"2026-09-21T12:00:00Z","kind":"text","summary":"old","original":"old","parserVersion":3}
  ]}
  """#
  try Data(json.utf8).write(to: file)
  let store = try HistoryStore(directory: directory)
  let history = HistoryViewModel(open: { store })
  history.query = "chicago"
  #expect(history.sections.flatMap(\.events).map(\.id) == ["located"])
  let event = try #require(store.events.first)
  try store.delete(id: event.id)
  try store.restore(event)
  let object = try #require(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
  #expect(object["version"] as? Int == 1)
  let rows = try #require(object["events"] as? [[String: Any]])
  let metadata = try #require(rows.first?["location"] as? [String: Any])
  #expect(metadata["placeName"] as? String == "Millennium Park, Chicago")
  #expect(rows.first?["original"] as? String == "https://example.com/reset")
  #expect(rows.last?["location"] == nil)
}

@Test func locationFixesRejectStaleAndInvalidCoordinates() {
  let now = Date(timeIntervalSince1970: 1_800_000_000)
  #expect(ScanLocation(latitude: 41.88, longitude: -87.63, placeName: "Chicago", capturedAt: now).isUsable(at: now))
  #expect(!ScanLocation(latitude: 91, longitude: -87, capturedAt: now).isUsable(at: now))
  #expect(!ScanLocation(latitude: .nan, longitude: -87, capturedAt: now).isUsable(at: now))
  #expect(!ScanLocation(latitude: 41, longitude: -87, capturedAt: now.addingTimeInterval(-61)).isUsable(at: now))
  #expect(!ScanLocation(latitude: 41, longitude: -87, capturedAt: now.addingTimeInterval(61)).isUsable(at: now))
}

@MainActor private final class FixedLocation: ScanLocating {
  var enabled = true
  var result: ScanLocation?
  init(_ result: ScanLocation?) { self.result = result }
  func location(at date: Date) async -> ScanLocation? { result }
}

@MainActor @Test func liveLocationsEnrichPersistedHistoryAndPhotosDoNotUseCurrentLocation() async throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  let store = try HistoryStore(directory: directory)
  let clock = TestClock()
  let fix = ScanLocation(latitude: 41.88, longitude: -87.63, placeName: "Chicago", capturedAt: clock.now)
  let locator = FixedLocation(fix)
  let history = HistoryViewModel(clock: clock, open: { store })
  let scanner = ScannerViewModel(camera: FakeCamera(.authorized), history: history, feedback: FakeFeedback(), clock: clock, location: locator)
  scanner.setPhase(.active)
  scanner.receive([Detection("live scan")])
  scanner.receive([Detection("live scan")])
  await settle()
  #expect(history.events.first?.location == fix)
  history.query = "chicago"
  #expect(history.sections.flatMap(\.events).count == 1)
  scanner.beginPhotoImport()
  scanner.acceptPhoto(importedPhoto([Detection("photo scan")]))
  await settle()
  #expect(history.events.first(where: { $0.original == "photo scan" })?.location == nil)
  let reloaded = try HistoryStore(directory: directory)
  #expect(reloaded.events.first(where: { $0.original == "live scan" })?.location == fix)
  let live = try #require(history.events.first(where: { $0.original == "live scan" }))
  history.delete(live)
  history.undo()
  #expect(history.events.first(where: { $0.id == live.id })?.location == fix)
}

@MainActor @Test func unavailableDisabledAndStaleLocationNeverPreventScanning() async {
  for mode in 0..<3 {
    let clock = TestClock()
    let repository = InMemoryHistory()
    let history = HistoryViewModel(open: { repository })
    let locator = FixedLocation(mode == 0 ? nil : ScanLocation(latitude: 41, longitude: -87, capturedAt: clock.now.addingTimeInterval(-120)))
    locator.enabled = mode != 1
    let scanner = ScannerViewModel(camera: FakeCamera(.authorized), history: history, feedback: FakeFeedback(), clock: clock, location: locator)
    scanner.setPhase(.active)
    scanner.receive([Detection("scan \(mode)")])
    scanner.receive([Detection("scan \(mode)")])
    await settle()
    #expect(scanner.results.count == 1)
    #expect(history.events.count == 1)
    #expect(history.events.first?.location == nil)
  }
}

@MainActor @Test func lateLocationDoesNotRestoreADeletedOrClearedScan() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  let store = try HistoryStore(directory: directory)
  let history = HistoryViewModel(open: { store })
  history.record(ScanPayload("scan"), at: Date())
  let event = try #require(history.events.first)
  history.delete(event)
  history.attachLocation(ScanLocation(latitude: 41, longitude: -87, capturedAt: event.date), to: [event.id])
  #expect(history.events.isEmpty)
  history.undo()
  #expect(history.events.first?.location == nil)
  history.clear()
  history.attachLocation(ScanLocation(latitude: 41, longitude: -87, capturedAt: event.date), to: [event.id])
  #expect(try HistoryStore(directory: directory).events.isEmpty)
}
