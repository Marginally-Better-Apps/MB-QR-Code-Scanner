import Foundation
import Testing
@testable import QRScannerCore

@Test func titlesKeepJoinersAndLineBreaksBecomeSpaces() {
  let family = "👨\u{200D}👩\u{200D}👧"
  #expect(ScanPayload(family).title == family)
  let persian = "می\u{200C}خواهم"
  #expect(ScanPayload(persian).title == persian)
  let flag = "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}"
  #expect(ScanPayload(flag).title == flag)
  let multiLine = ScanPayload("Line one\nLine two\r\nLine\tthree")
  #expect(multiLine.title == "Line one Line two Line three")
  #expect(multiLine.details == "Line one\nLine two\nLine three")
  #expect(multiLine.historyEvent(at: Date()).summary == "Line one Line two Line three")
}

@Test func spoofingAndControlCharactersAreReplaced() {
  for scalar in ["\u{202E}", "\u{202A}", "\u{2066}", "\u{2069}", "\u{200B}", "\u{200E}", "\u{FEFF}", "\u{0000}", "\u{001B}", "\u{00AD}"] {
    let parsed = ScanPayload("pay\(scalar)pal")
    #expect(parsed.title == "pay\u{FFFD}pal", "\(scalar.unicodeScalars.first!.value)")
    #expect(parsed.details == "pay\u{FFFD}pal")
  }
  #expect(ScanPayload.visible("a\nb") == "a b")
  #expect(ScanPayload.visible("a\nb", preserveNewlines: true) == "a\nb")
  #expect(TextSanitizer.title(String(repeating: "é", count: 200)).count == TextSanitizer.titleLimit)
}

@Test func payloadIdentityMatchesDetectionIdentity() {
  let decomposed = "  Cafe\u{0301}\n"
  #expect(ScanPayload(decomposed).id == Detection(decomposed).id)
  #expect(ScanPayload(decomposed).id == ScanPayload("Café").id)
  #expect(ScanPayload("Café", format: .aztec).id != ScanPayload("Café").id)
  #expect(CodeIdentity.normalize(decomposed) == "Café")
}

@Test func webLinkEdgeCases() {
  let port = ScanPayload("example.com:8080/path")
  #expect(port.kind == .url)
  #expect(port.openURL?.absoluteString == "https://example.com:8080/path")
  let insecure = ScanPayload("HTTP://EXAMPLE.com/A")
  #expect(insecure.kind == .url)
  #expect(insecure.title.hasPrefix("http://"))
  #expect(ScanPayload("notes.txt").kind == .text)
  #expect(ScanPayload("README.md").kind == .text)
  #expect(ScanPayload("https://notes.txt").kind == .url)
  #expect(ScanPayload("example.io").kind == .url)
  #expect(ScanPayload("https://exa%6dple.com/x").kind == .text)
  #expect(ScanPayload("https://münchen.de/Grüße").kind == .url)
  #expect(ScanPayload("1.5").kind == .text)
}

@Test func structuredPrefixesNeverBecomeAppLinks() {
  #expect(ScanPayload("MECARD:N:Doe,Jane;TEL:+14155552671").kind == .contact)
  #expect(ScanPayload("MECARD:junk").kind == .text)
  #expect(ScanPayload("MATMSG:SUB:no recipient;;").kind == .text)
  #expect(ScanPayload("Note: buy milk").kind == .text)
  #expect(ScanPayload("myapp://pay?amount=10&to=bob").kind == .customScheme)
  #expect(ScanPayload("x-apple.systempreferences:com.apple.preference").openURL == nil)
}

@Test func phoneLinksRefuseCarrierCodesAndShowGroupedNumbers() {
  let phone = ScanPayload("tel:+14155552671")
  #expect(phone.kind == .phone)
  #expect(phone.title == "+1 415-555-2671")
  #expect(phone.original == "tel:+14155552671")
  #expect(phone.openURL?.absoluteString == "tel:+14155552671")
  #expect(ScanPayload("tel:+1 (415) 555-2671").title == "+1 (415) 555-2671")
  #expect(ScanPayload("tel://5551234567").kind == .phone)
  #expect(ScanPayload("tel://5551234567").openURL?.absoluteString == "tel:5551234567")
  #expect(ScanPayload("tel:+442079460958").title == "+44 207 946 0958")
  for code in ["tel:*21*5551234#", "tel:*#06#", "tel:%2A21%2A5551234%23", "tel:#31#5551234"] {
    #expect(ScanPayload(code).kind == .text, "\(code)")
    #expect(ScanPayload(code).openURL == nil, "\(code)")
  }
  #expect(PhoneNumberFormatter.display("4155552671") == "415-555-2671")
  #expect(PhoneNumberFormatter.display("+33612345678") == "+33 61 234 5678")
  #expect(PhoneNumberFormatter.display("+9715012345678") == "+971 501 234 5678")
}

@Test func smsNeedsARealRecipient() {
  let sms = ScanPayload("SMSTO:+14155552671:Hello there")
  #expect(sms.kind == .sms)
  #expect(sms.title == "+1 415-555-2671")
  #expect(ScanPayload("sms:+14155552671?body=Hello%20there").kind == .sms)
  for raw in ["SMSTO::Hello", "SMSTO:not a number:Hi", "sms:?body=hi", "sms:", "SMSTO:+1415\u{0007}5552671:Hi", "SMSTO:*21*:x"] {
    let parsed = ScanPayload(raw)
    #expect(parsed.kind == .text, "\(raw)")
    #expect(parsed.openURL == nil, "\(raw)")
  }
}

@Test func mailtoIsDecodedOnlyOnce() {
  let mail = ScanPayload("mailto:a%2540b@c.com")
  #expect(mail.kind == .email)
  #expect(mail.title == "a%40b@c.com")
  #expect(ScanPayload("mailto:josé@münchen.de?subject=Grüße").kind == .email)
}

@Test func geoAcceptsURIParameters() {
  let uncertain = ScanPayload("geo:37.7749,-122.4194;u=35")
  #expect(uncertain.kind == .geo)
  let maps = URLComponents(url: uncertain.openURL!, resolvingAgainstBaseURL: false)
  #expect(maps?.queryItems?.first { $0.name == "ll" }?.value == "37.7749,-122.4194")
  #expect(ScanPayload("geo:48.8566,2.3522,35;crs=wgs84?q=Eiffel+Tower").title == "Eiffel Tower")
  #expect(ScanPayload("geo:91,0").kind == .text)
}

@Test func codeFormatNamesAndConstants() {
  #expect(CodeFormat.dataMatrix.name == "Data Matrix")
  #expect(CodeFormat.code39FullASCII.name == "Code 39 Full ASCII")
  #expect(CodeFormat.code39Checksum.name == "Code 39 Checksum")
  #expect(CodeFormat.code39FullASCIIChecksum.name == "Code 39 Full ASCII Checksum")
  #expect(CodeFormat.code93i.name == "Code 93i")
  #expect(CodeFormat.code128.name == "Code 128")
  #expect(CodeFormat(rawValue: "VNBarcodeSymbologyCode11").name == "Code 11")
  #expect(CodeFormat.qr.rawValue == "VNBarcodeSymbologyQR")
  #expect(CodeFormat.ean13.symbology == "EAN13")
  #expect(CodeFormat(rawValue: "Custom").symbology == "Custom")
}

@Test func productTitlesAreTranslatableButHistoryStaysEnglish() {
  let product = ScanPayload("3017624010701", format: .ean13)
  #expect(product.kind == .product)
  #expect(product.historyEvent(at: Date()).summary == "Product 3017624010701")
  #expect(product.details.contains("EAN-13"))
}
