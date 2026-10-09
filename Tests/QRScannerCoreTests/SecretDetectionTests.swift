import Foundation
import Testing
@testable import QRScannerCore

private func expectComplete(_ raw: String, title: String, sourceLocation: SourceLocation = #_sourceLocation) {
  let parsed = ScanPayload(raw)
  #expect(parsed.isSensitive, "\(raw.prefix(40))", sourceLocation: sourceLocation)
  #expect(parsed.title == title, sourceLocation: sourceLocation)
  #expect(parsed.openURL == nil, sourceLocation: sourceLocation)
  #expect(parsed.rawData == ScanPayload.visible(raw, limit: .max, preserveNewlines: true), sourceLocation: sourceLocation)
  #expect(PayloadActionRules.clipboardText(for: .copy, payload: parsed) == raw, sourceLocation: sourceLocation)
  #expect(PayloadActionRules.actions(for: parsed).actions == [.copy, .share], sourceLocation: sourceLocation)
  let event = parsed.historyEvent(at: Date())
  #expect(event.original == raw, sourceLocation: sourceLocation)
  #expect(event.summary == title, sourceLocation: sourceLocation)
  #expect(event.kind == "auth", sourceLocation: sourceLocation)
}

@Test func recoveryPhrasesAreLabeledAndRetained() {
  #expect(BIP39Words.english.count == 2048)
  let twelve = "abandon ability able about above absent absorb abstract absurd abuse access accident"
  expectComplete(twelve, title: "Recovery phrase")
  expectComplete(twelve.uppercased(), title: "Recovery phrase")
  let twentyFour = Array(repeating: "zoo", count: 23).joined(separator: " ") + " wrong"
  expectComplete(twentyFour, title: "Recovery phrase")
  expectComplete(twelve.replacingOccurrences(of: " ", with: "\n"), title: "Recovery phrase")
  // Wrong word counts or non-list words stay text.
  #expect(ScanPayload(Array(twelve.split(separator: " ").prefix(11)).joined(separator: " ")).kind == .text)
  #expect(ScanPayload(twelve.replacingOccurrences(of: "abandon", with: "qwerty")).kind == .text)
  #expect(ScanPayload("Hello, this is plain text").kind == .text)
}

@Test func walletPrivateKeysAreLabeledAndRetained() {
  expectComplete("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ", title: "Private key")
  expectComplete("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn", title: "Private key")
  expectComplete("cNJFgo1driFnPcBdBX8BrJrpxchBWXwXCvNH5SoSkdcF6JXXwHMm", title: "Private key")
  let xprv = "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi"
  expectComplete(xprv, title: "Private key")
  expectComplete(#"{"wallet":"\#(xprv)"}"#, title: "Private key")
  expectComplete("zprvAWgYBBk7JR8Gjrh4UJQ2uJdG1r3WNRRfURiABBE3RvMXYSrRJL62XuezvGdPvG6GFBZduosCc1YP5wixPox7zhZLfiUm8aunE96BBa4Kei5", title: "Private key")
  // Public keys are not secrets.
  #expect(!ScanPayload("xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8").isSensitive)
}

@Test func pemPrivateKeysAreLabeledAndRetainedEverywhere() {
  expectComplete("-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBg\n-----END PRIVATE KEY-----", title: "Private key")
  expectComplete("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----", title: "Private key")
  expectComplete("-----BEGIN EC PRIVATE KEY-----", title: "Private key")
}

@Test func jwtsAreLabeledAndRetainedAsAccessTokens() {
  let jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
  expectComplete(jwt, title: "Access token")
  expectComplete("Bearer " + jwt, title: "Access token")
  #expect(!SecretParser.containsJWT("eyJ.eyJ.x"))
  #expect(!SecretParser.containsJWT("version 1.2.3"))
}

@Test func linksKeepWorkingAndHistoryRetainsCredentialParameters() throws {
  let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"
  let cases = [
    "https://example.com/reset?token=abc123",
    "https://example.com/login#access_token=abc&state=1",
    "https://example.com/callback?code=xyz&state=1",
    "https://s3.example.com/f.pdf?X-Amz-Signature=deadbeef&X-Amz-Expires=60",
    "https://example.com/magic/\(jwt)?next=/",
    "https://example.com/?next=\(jwt)",
    "example.com/verify?sessionId=1",
    "myapp://login?apiKey=secret",
    "https://example.com/some/path?q=1",
    "https://example.com/a#section-2",
  ]
  for raw in cases {
    let parsed = ScanPayload(raw)
    #expect(!parsed.isSensitive, "\(raw)")
    #expect(parsed.openURL != nil, "\(raw)")
    let event = parsed.historyEvent(at: Date())
    #expect(event.original == raw, "\(raw)")
  }
  let magic = ScanPayload("https://example.com/magic/\(jwt)")
  #expect(magic.historyEvent(at: Date()).original == magic.original)
}

@Test func passkeyKeywordsOnlyFlagNonWebPayloads() {
  for raw in ["https://webauthn.io", "https://example.com/passkey-setup", "webauthn.io", "https://fido2.example.com/docs"] {
    let parsed = ScanPayload(raw)
    #expect(parsed.kind == .url, "\(raw)")
    #expect(!parsed.isSensitive, "\(raw)")
  }
  #expect(ScanPayload("Set up your passkey now").kind == .auth)
  #expect(ScanPayload("Set up your passkey now").isSensitive)
  #expect(ScanPayload("myapp://webauthn?challenge=1").isSensitive)
}

@Test func adversarialPayloadsParseQuickly() {
  let adversarial = [
    String(repeating: "BEGIN ", count: 850),
    String(repeating: "BEGIN ", count: 850) + "PRIVATE",
    String(repeating: "BEGIN", count: 1_000) + " PRIVATE",
    "private " + String(repeating: " ", count: 5_000) + "x",
    String(repeating: "eyJ", count: 1_700),
    String(repeating: "eyJa.", count: 1_000),
    String(repeating: "a.", count: 2_500) + "1",
    String(repeating: "xprv", count: 1_250),
    "BEGIN:VCALENDAR\n" + String(repeating: "BEGIN:VALARM\n", count: 400),
    "WIFI:" + String(repeating: "\\;", count: 2_500),
  ]
  for payload in adversarial {
    _ = ScanPayload(payload)
    var best = Duration.seconds(1)
    for _ in 0..<5 {
      let clock = ContinuousClock()
      let elapsed = clock.measure { _ = ScanPayload(payload) }
      best = min(best, elapsed)
    }
    // The unbounded regex took ~170 ms on Apple silicon; shared CI runners need headroom in Debug.
    #expect(best < .milliseconds(60), "\(payload.prefix(20))… took \(best)")
  }
}

@Test func moreSecretFormatsAreLabeledAndRetained() {
  let secrets = [
    "1. abandon 2. ability 3. able 4. about 5. above 6. absent 7. absorb 8. abstract 9. absurd 10. abuse 11. access 12. accident",
    "abandon, ability, able, about, above, absent, absorb, abstract, absurd, abuse, access, accident",
    String(repeating: "0000", count: 11) + "2047",
    "nsec1" + String(repeating: "q", count: 58),
    "0x" + String(repeating: "ab", count: 32),
    "\u{FEFF}otpauth://totp/Example:a@example.com?secret=JBSWY3DPEHPK3PXP",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature",
  ]
  for secret in secrets {
    let payload = ScanPayload(secret)
    #expect(payload.isSensitive, "\(secret.prefix(24))")
    #expect(payload.historyEvent(at: Date()).original == secret, "\(secret.prefix(24))")
  }
  // A long number that is not 4-digit word indexes stays ordinary text.
  #expect(!ScanPayload(String(repeating: "9999", count: 12)).isSensitive)
}

@Test func linksThatFallBackToTextKeepTheirCompleteData() {
  let cases = [
    "https://user:pa55word@example.com/",
    "ftp://user:pass@host/files",
    "https://example.com/reset?token=abc def",
  ]
  for link in cases {
    let event = ScanPayload(link).historyEvent(at: Date())
    #expect(event.original == link)
    #expect(PayloadActionRules.clipboardText(for: .copy, payload: ScanPayload(link)) == link)
  }
}
