import Foundation
import Testing
@testable import QRScannerCore

private struct Fixture: Decodable {
  let name: String
  let raw: String
  let expectedKind: String
}

@Test func originalPayloadCorpusSurvivesTheSwiftPort() throws {
  let url = try #require(Bundle.module.url(forResource: "payloads", withExtension: "json"))
  let fixtures = try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
  #expect(fixtures.count >= 36)
  for fixture in fixtures {
    let parsed = ScanPayload(fixture.raw)
    let expected: String
    switch fixture.expectedKind {
    case "otp": expected = fixture.raw.hasPrefix("otpauth-migration:") ? "authExport" : "auth"
    case "passkey": expected = "auth"
    default: expected = fixture.expectedKind
    }
    #expect(parsed.kind.rawValue == expected, "\(fixture.name)")
    #expect(parsed.original == fixture.raw)
    #expect(parsed.title.count <= 120)
  }
}

@Test func malformedStructuredCodesStayNonActionable() {
  for raw in ["BEGIN:VCARD\nFN:No End", "geo:999,999", "mailto:not-an-email-at-all", "tel:abc-def", "BEGIN:VEVENT\nSUMMARY:x", "javascript:alert(1)", "https://example.com/hello world", "https://example.com/\nFake Button"] {
    let parsed = ScanPayload(raw)
    #expect(parsed.openURL == nil, "\(raw)")
    #expect(parsed.kind == .text, "\(raw)")
    #expect(parsed.original == raw)
  }
}

@Test func malformedAuthIsRedactedWithoutOfferingAHandoff() {
  for raw in ["FIDO://example.invalid/hybrid", "FIDO:/123", "otpauth://totp/Test?issuer=Example", "otpauth://totp/Test?secret=INVALID!", "otpauth-migration://offline?data=secret"] {
    let parsed = ScanPayload(raw)
    #expect(parsed.isSensitive)
    #expect(parsed.openURL == nil)
    #expect(parsed.historyEvent(at: Date()).original == nil)
  }
}

@Test func legacyMessageFormatsProduceNativeURLs() {
  let email = ScanPayload("MATMSG:TO:first@example.com;TO:second@example.com;SUB:Hi\\;there;BODY:Hello\\;world;;")
  let mail = URLComponents(url: email.openURL!, resolvingAgainstBaseURL: false)!
  #expect(mail.path == "first@example.com")
  #expect(mail.queryItems?.first { $0.name == "subject" }?.value == "Hi;there")
  let sms = ScanPayload("SMSTO:+14155552671:Hello there")
  let message = URLComponents(url: sms.openURL!, resolvingAgainstBaseURL: false)!
  #expect(message.scheme == "sms")
  #expect(message.path == "+14155552671")
  #expect(message.queryItems?.first?.value == "Hello there")
}

@Test func calendarDatesPreserveTimeZonesAndRejectInvalidDates() {
  let utc = CalendarDate.parse("20260912T140000Z", raw: "DTSTART:20260912T140000Z", name: "DTSTART")
  #expect(utc?.timeZone.secondsFromGMT() == 0)
  #expect(utc?.allDay == false)
  let allDay = CalendarDate.parse("20280229", raw: "DTSTART;VALUE=DATE:20280229", name: "DTSTART")
  #expect(allDay?.allDay == true)
  #expect(CalendarDate.parse("20260230", raw: "", name: "DTSTART") == nil)
  let named = CalendarDate.parse("20260912T140000", raw: "DTSTART;TZID=America/Chicago:20260912T140000", name: "DTSTART")
  #expect(named?.timeZone.identifier == "America/Chicago")
  #expect(ScanPayload("BEGIN:VEVENT\nDTSTART:not-a-date\nEND:VEVENT").kind == .text)
}

@Test func failedHistoryReadNeverOverwritesExistingData() throws {
  let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: directory) }
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  let file = directory.appendingPathComponent("history-v1.json")
  let original = Data("broken history".utf8)
  try original.write(to: file)
  #expect(throws: (any Error).self) { try HistoryStore(directory: directory) }
  #expect(try Data(contentsOf: file) == original)
}
