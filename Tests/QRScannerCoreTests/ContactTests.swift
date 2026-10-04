import Foundation
import Testing
@testable import QRScannerCore

@Test func mecardKeepsEveryRepeatedAndOptionalField() throws {
  let raw = #"MECARD:N:Doe,John;NICKNAME:JD;TEL:+14155552671;TEL:+442079460958;EMAIL:john@example.com;EMAIL:j@work.example;URL:https://example.com;ORG:Acme\, Inc.;NOTE:Line one;BDAY:19700310;ADR:,,1 Main St,Springfield,IL,62701,USA;;"#
  let parsed = ScanPayload(raw)
  #expect(parsed.kind == .contact)
  #expect(parsed.title == "John Doe")
  let contact = try #require(parsed.contactDraft)
  #expect(contact.source == .mecard)
  #expect(contact.givenName == "John")
  #expect(contact.familyName == "Doe")
  #expect(contact.nickname == "JD")
  #expect(contact.phones == ["+14155552671", "+442079460958"])
  #expect(contact.emails == ["john@example.com", "j@work.example"])
  #expect(contact.urls == ["https://example.com"])
  #expect(contact.organization == "Acme, Inc.")
  #expect(contact.note == "Line one")
  #expect(contact.birthday?.year == 1970)
  #expect(contact.birthday?.month == 3)
  #expect(contact.birthday?.day == 10)
  #expect(contact.address?.street == "1 Main St")
  #expect(contact.address?.city == "Springfield")
  #expect(contact.address?.postalCode == "62701")
  #expect(!parsed.details.contains("MECARD"))
  #expect(parsed.details.contains("+1 415-555-2671"))
  #expect(parsed.details.contains("Acme, Inc."))
  #expect(parsed.details.contains("1 Main St, Springfield, IL, 62701, USA"))
  #expect(parsed.historyEvent(at: Date()).summary == "John Doe")
}

@Test func mecardWithoutTrailingTerminatorIsStillAContact() throws {
  let parsed = ScanPayload("MECARD:N:Doe,Jane;TEL:+14155552671")
  #expect(parsed.kind == .contact)
  #expect(parsed.openURL == nil)
  #expect(parsed.contactDraft?.phones == ["+14155552671"])
  let escaped = ScanPayload("MECARD:N:Doe\\;John;TEL:+14155552671;EMAIL:john@example.com;;")
  #expect(escaped.contactDraft?.familyName == "Doe")
  #expect(escaped.contactDraft?.givenName == "John")
  let unstructured = ScanPayload("MECARD:N:Jane Smith;;")
  #expect(unstructured.title == "Jane Smith")
  #expect(ScanPayload("MECARD:ADR:nowhere;;").kind == .text)
  #expect(ScanPayload("MECARD:").kind == .text)
  #expect(ScanPayload("MECARD:ORG:Acme;;").title == "Acme")
}

@Test func vCardDetailsAreAReadableSummary() throws {
  let raw = "BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jane;;;\nFN:Jane Doe\nORG:Acme;Research\nitem1.TEL;TYPE=CELL:+14155552671\nEMAIL;TYPE=INTERNET:jane@example.com\nADR;TYPE=WORK:;;1 Main St;Springfield;IL;62701;USA\nBDAY:1985-04-12\nNOTE:Met at WWDC\\, 2026\nEND:VCARD"
  let parsed = ScanPayload(raw)
  #expect(parsed.kind == .contact)
  #expect(parsed.title == "Jane Doe")
  let contact = try #require(parsed.contactDraft)
  #expect(contact.source == .vCard)
  #expect(contact.organization == "Acme, Research")
  #expect(contact.phones == ["+14155552671"])
  #expect(contact.birthday?.year == 1985)
  #expect(!parsed.details.contains("BEGIN:VCARD"))
  #expect(parsed.details.contains("jane@example.com"))
  #expect(parsed.details.contains("Met at WWDC, 2026"))
  let empty = ScanPayload("BEGIN:VCARD\nVERSION:3.0\nFN:\nTEL:+14155552671\nEND:VCARD")
  #expect(empty.title == "+1 415-555-2671")
  let nameless = ScanPayload("BEGIN:VCARD\nVERSION:3.0\nEND:VCARD")
  #expect(nameless.kind == .contact)
  #expect(nameless.title == "Contact")
  #expect(nameless.historyEvent(at: Date()).summary == "Contact")
}

@Test func birthdaysRejectImpossibleDates() {
  #expect(ContactDraft.parseBirthday("19700230") == nil)
  #expect(ContactDraft.parseBirthday("--0229")?.month == 2)
  #expect(ContactDraft.parseBirthday("--0229")?.year == nil)
  #expect(ContactDraft.parseBirthday("1970-13-01") == nil)
  #expect(ContactDraft.parseBirthday("tomorrow") == nil)
}
