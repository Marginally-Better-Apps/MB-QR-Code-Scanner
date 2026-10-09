import Foundation
import Testing
@testable import QRScannerCore

@Test func everyCodeInTheCorpusPreservesItsExactOriginalThroughHistoryAndUndo() throws {
  struct Fixture: Decodable { let raw: String }
  let url = try #require(Bundle.module.url(forResource: "payloads", withExtension: "json"))
  let corpus = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url)).map(\.raw)
  let originals = corpus + [
    "M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100",
    "https://user:password@example.com/reset?token=abc#secret=def",
    "WIFI:T:WPA;S:Office;P:hunter2;;",
    "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP",
    "otpauth-migration://offline?data=secret",
    "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
    "abandon ability able about above absent absorb abstract absurd abuse access accident",
    " \tUnrecognized code\nwith trailing spaces  ",
    "data:text/plain,arbitrary-data", "text\u{0000}\u{202E}controls",
    String(repeating: "a", count: 20_001),
  ]
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  let store = try HistoryStore(directory: directory)
  for (index, raw) in originals.enumerated() {
    let payload = ScanPayload(raw)
    #expect(PayloadActionRules.clipboardText(for: .copy, payload: payload) == raw)
    #expect(PayloadActionRules.actions(for: payload).actions.contains(.share))
    #expect(payload.rawData == TextSanitizer.details(raw, limit: .max))
    let event = try store.record(payload, at: Date(timeIntervalSince1970: Double(index)))
    #expect(event.original == raw)
    let reloaded = try HistoryStore(directory: directory)
    #expect(reloaded.events.first?.original == raw)
    try store.delete(id: event.id)
    #expect(!store.events.contains(where: { $0.id == event.id }))
    let afterDelete = try HistoryStore(directory: directory)
    #expect(!afterDelete.events.contains(where: { $0.id == event.id }))
    try store.restore(event)
    #expect(try HistoryStore(directory: directory).events.first == event)
  }
  #expect(try HistoryStore(directory: directory).events.count == originals.count)
  try store.clear()
  #expect(try HistoryStore(directory: directory).events.isEmpty)
}

@Test func legacyRedactedRowsRemainReadableWithoutInventingMissingData() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let old = #"{"version":1,"events":[{"id":"old","acceptedAt":"2026-10-01T12:00:00Z","kind":"boardingPass","summary":"Boarding pass","parserVersion":4}]}"#
  try Data(old.utf8).write(to: directory.appendingPathComponent("history-v1.json"))
  let store = try HistoryStore(directory: directory)
  let event = try #require(store.events.first)
  #expect(event.original == nil)
  #expect(event.id == "old")
  try store.delete(id: event.id)
  try store.restore(event)
  #expect(try HistoryStore(directory: directory).events.first == event)
}
