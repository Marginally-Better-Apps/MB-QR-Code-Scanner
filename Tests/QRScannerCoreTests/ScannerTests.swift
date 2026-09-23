import Foundation
import CoreGraphics
import Testing
@testable import QRScannerCore

@Test func detectionsSurviveGapsAndExpireIndividually() {
  var scanner = ScanSession()
  let start = Date(timeIntervalSince1970: 1000)
  _ = scanner.receive([Detection("a"), Detection("b")], at: start)
  _ = scanner.receive([], at: start.addingTimeInterval(0.1))
  #expect(scanner.highlights.map(\.payload) == ["a", "b"])
  _ = scanner.receive([Detection("b"), Detection("a")], at: start.addingTimeInterval(0.5))
  #expect(scanner.results.map(\.payload) == ["a", "b"])
  scanner.expire(at: start.addingTimeInterval(1.9))
  #expect(scanner.highlights.count == 2)
  scanner.expire(at: start.addingTimeInterval(2))
  #expect(scanner.highlights.isEmpty)
  #expect(scanner.results.count == 2)
}

@Test func retainedSightingsNeverCreateHistory() {
  var scanner = ScanSession()
  let start = Date(timeIntervalSince1970: 1000)
  #expect(scanner.receive([Detection("a"), Detection("b")], at: start).isEmpty)
  #expect(scanner.receive([], at: start.addingTimeInterval(0.1)).isEmpty)
  scanner.expire(at: start.addingTimeInterval(2))
  #expect(scanner.highlights.isEmpty)
}

@Test func acceptanceDeduplicatesUntilTwoSecondAbsence() {
  var scanner = ScanSession()
  let start = Date(timeIntervalSince1970: 1000)
  #expect(scanner.receive([Detection("a")], at: start).isEmpty)
  #expect(scanner.receive([Detection("a")], at: start.addingTimeInterval(0.1)) == ["a"])
  #expect(scanner.receive([], at: start.addingTimeInterval(0.2)).isEmpty)
  #expect(scanner.receive([Detection("a")], at: start.addingTimeInterval(0.3)).isEmpty)
  #expect(scanner.receive([Detection("a")], at: start.addingTimeInterval(3)).isEmpty)
  #expect(scanner.receive([Detection("a")], at: start.addingTimeInterval(3.1)) == ["a"])
}

@Test func dismissAndSecretLifecycle() {
  var scanner = ScanSession()
  let start = Date()
  let secret = "otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP"
  _ = scanner.receive([Detection("a"), Detection(secret)], at: start)
  scanner.dismiss("a")
  _ = scanner.receive([Detection("a"), Detection(secret)], at: start.addingTimeInterval(0.1))
  #expect(scanner.results.map(\.payload) == [secret])
  scanner.pause()
  #expect(scanner.results.isEmpty)
  #expect(scanner.highlights.isEmpty)
}

@Test func payloadsUseSafeSystemActions() {
  #expect(ScanPayload("example.com/path").kind == .url)
  #expect(ScanPayload("example.com/path").openURL?.absoluteString == "https://example.com/path")
  #expect(ScanPayload("https://example.com/path?q=one#two").original == "https://example.com/path?q=one#two")
  for unsafe in ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "https://user:pass@example.com"] {
    #expect(ScanPayload(unsafe).openURL == nil)
  }
  #expect(ScanPayload("hello world").kind == .text)
  #expect(ScanPayload("tel:+14155552671").kind == .phone)
  #expect(ScanPayload("mailto:a@example.com").kind == .email)
  #expect(ScanPayload("geo:37.7,-122.4?q=Ferry").openURL?.host == "maps.apple.com")
}

@Test func secretsAndWifiNeverPersistRawPayloads() {
  for raw in ["otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP", "otpauth-migration://offline?data=SECRET", "FIDO:/000111222333", "-----BEGIN PRIVATE KEY-----"] {
    let parsed = ScanPayload(raw)
    #expect(parsed.isSensitive)
    #expect(parsed.historyEvent(at: Date()).original == nil)
    #expect(!parsed.title.contains("SECRET"))
  }
  let wifi = ScanPayload("WIFI:T:WPA;S:Office\\;Guest;P:secret;;")
  #expect(wifi.kind == .wifi)
  #expect(wifi.wifi?.ssid == "Office;Guest")
  #expect(wifi.wifi?.password == "secret")
  #expect(!wifi.details.contains("secret"))
  #expect(wifi.historyEvent(at: Date()).original == nil)
}

@Test func historyKeepsTheExistingEnvelopeAndSupportsRepeatedUndo() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let old = #"{"version":1,"events":[{"id":"legacy","acceptedAt":"2026-09-22T12:00:00.000Z","kind":"url","summary":"example.com/old","original":"https://example.com/old","parserVersion":1}]}"#
  try Data(old.utf8).write(to: directory.appendingPathComponent("history-v1.json"))
  let store = try HistoryStore(directory: directory)
  #expect(store.events.first?.id == "legacy")
  let event = store.events[0]
  try store.delete(id: event.id)
  #expect(store.events.isEmpty)
  try store.restore(event)
  try store.delete(id: event.id)
  try store.restore(event)
  let reopened = try HistoryStore(directory: directory)
  #expect(reopened.events == [event])
  try reopened.clear()
  #expect(try HistoryStore(directory: directory).events.isEmpty)
}
