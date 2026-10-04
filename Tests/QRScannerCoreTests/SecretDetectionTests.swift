import Foundation
import Testing
@testable import QRScannerCore

private func expectRedacted(_ raw: String, title: String, sourceLocation: SourceLocation = #_sourceLocation) {
  let parsed = ScanPayload(raw)
  #expect(parsed.isSensitive, "\(raw.prefix(40))", sourceLocation: sourceLocation)
  #expect(parsed.title == title, sourceLocation: sourceLocation)
  #expect(parsed.openURL == nil, sourceLocation: sourceLocation)
  #expect(!parsed.details.contains(raw), sourceLocation: sourceLocation)
  let event = parsed.historyEvent(at: Date())
  #expect(event.original == nil, sourceLocation: sourceLocation)
  #expect(event.summary == nil, sourceLocation: sourceLocation)
  #expect(event.kind == "redacted", sourceLocation: sourceLocation)
}

@Test func recoveryPhrasesAreRedacted() {
  #expect(BIP39Words.english.count == 2048)
  let twelve = "abandon ability able about above absent absorb abstract absurd abuse access accident"
  expectRedacted(twelve, title: "Recovery phrase")
  expectRedacted(twelve.uppercased(), title: "Recovery phrase")
  let twentyFour = Array(repeating: "zoo", count: 23).joined(separator: " ") + " wrong"
  expectRedacted(twentyFour, title: "Recovery phrase")
  expectRedacted(twelve.replacingOccurrences(of: " ", with: "\n"), title: "Recovery phrase")
  // Wrong word counts or non-list words stay text.
  #expect(ScanPayload(Array(twelve.split(separator: " ").prefix(11)).joined(separator: " ")).kind == .text)
  #expect(ScanPayload(twelve.replacingOccurrences(of: "abandon", with: "qwerty")).kind == .text)
  #expect(ScanPayload("Hello, this is plain text").kind == .text)
}

@Test func walletPrivateKeysAreRedacted() {
  expectRedacted("5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ", title: "Private key")
  expectRedacted("KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn", title: "Private key")
  expectRedacted("cNJFgo1driFnPcBdBX8BrJrpxchBWXwXCvNH5SoSkdcF6JXXwHMm", title: "Private key")
  let xprv = "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi"
  expectRedacted(xprv, title: "Private key")
  expectRedacted(#"{"wallet":"\#(xprv)"}"#, title: "Private key")
  expectRedacted("zprvAWgYBBk7JR8Gjrh4UJQ2uJdG1r3WNRRfURiABBE3RvMXYSrRJL62XuezvGdPvG6GFBZduosCc1YP5wixPox7zhZLfiUm8aunE96BBa4Kei5", title: "Private key")
  // Public keys are not secrets.
  #expect(!ScanPayload("xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8").isSensitive)
}

@Test func pemPrivateKeysAreRedactedEverywhere() {
  expectRedacted("-----BEGIN PRIVATE KEY-----\nMIIBVQIBADANBg\n-----END PRIVATE KEY-----", title: "Private key")
  expectRedacted("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----", title: "Private key")
  expectRedacted("-----BEGIN EC PRIVATE KEY-----", title: "Private key")
}

@Test func jwtsAreRedactedAsAccessTokens() {
  let jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
  expectRedacted(jwt, title: "Access token")
  expectRedacted("Bearer " + jwt, title: "Access token")
  #expect(!SecretParser.containsJWT("eyJ.eyJ.x"))
  #expect(!SecretParser.containsJWT("version 1.2.3"))
}

@Test func linksKeepWorkingButHistoryDropsCredentialParameters() throws {
  let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl"
  let cases: [(raw: String, saved: String)] = [
    ("https://example.com/reset?token=abc123", "https://example.com/reset"),
    ("https://example.com/login#access_token=abc&state=1", "https://example.com/login"),
    ("https://example.com/callback?code=xyz&state=1", "https://example.com/callback"),
    ("https://s3.example.com/f.pdf?X-Amz-Signature=deadbeef&X-Amz-Expires=60", "https://s3.example.com/f.pdf"),
    ("https://example.com/magic/\(jwt)?next=/", "https://example.com"),
    ("https://example.com/?next=\(jwt)", "https://example.com/"),
    ("example.com/verify?sessionId=1", "example.com/verify"),
    ("myapp://login?apiKey=secret", "myapp://login"),
    ("https://example.com/some/path?q=1", "https://example.com/some/path?q=1"),
    ("https://example.com/a#section-2", "https://example.com/a#section-2"),
  ]
  for (raw, saved) in cases {
    let parsed = ScanPayload(raw)
    #expect(!parsed.isSensitive, "\(raw)")
    #expect(parsed.openURL != nil, "\(raw)")
    let event = parsed.historyEvent(at: Date())
    #expect(event.original == saved, "\(raw)")
    #expect(!(event.summary ?? "").contains(jwt), "\(raw)")
  }
  let magic = ScanPayload("https://example.com/magic/\(jwt)")
  #expect(magic.historyEvent(at: Date()).summary == "example.com")
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
