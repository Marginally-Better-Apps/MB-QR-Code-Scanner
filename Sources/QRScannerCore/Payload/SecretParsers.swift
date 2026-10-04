import Foundation

/// One-time-password setup, authenticator exports, and passkey (FIDO) handoffs.
enum AuthParser: PayloadKindParser {
  static let issuerLimit = 80

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    let isExport = input.hasPrefix("otpauth-migration:")
    let isOTP = !isExport && input.hasPrefix("otpauth:")
    let isFIDO = input.hasPrefix("fido:")
    // Keyword heuristics only apply to payloads that are not web links: a site such as
    // https://webauthn.io or https://example.com/passkey-setup is still an ordinary link.
    guard isExport || isOTP || isFIDO || (!input.isWebCandidate && SecretParser.mentionsPasskey(input)) else { return nil }
    if isExport {
      let title = String(localized: "Authenticator export")
      return ParsedPayload(kind: .authExport, title: title,
        details: String(localized: "Authenticator exports cannot be imported."), isSensitive: true)
    }
    var title = isFIDO ? String(localized: "Passkey sign-in") : String(localized: "Authentication code")
    let query = input.components?.queryItems ?? []
    if input.scheme == "otpauth", let issuer = query.first(where: { $0.name.lowercased() == "issuer" })?.value, !issuer.isEmpty {
      let issuer = TextSanitizer.title(issuer, limit: issuerLimit)
      title = String(localized: "Authentication code (\(issuer))")
    }
    let secret = query.first { $0.name.lowercased() == "secret" }?.value ?? ""
    let validOTP = input.scheme == "otpauth" && ["totp", "hotp"].contains(input.components?.host?.lowercased() ?? "")
      && secret.uppercased().range(of: #"^[A-Z2-7]+=*$"#, options: .regularExpression) != nil
    let validFIDO = input.raw.range(of: #"(?i)^FIDO:/[0-9]{10,}$"#, options: .regularExpression) != nil
    let handoff = (validOTP || validFIDO) && !TextSanitizer.containsControls(input.raw) ? input.components?.url : nil
    return ParsedPayload(kind: .auth, title: title, details: title, openURL: handoff, isSensitive: true)
  }
}

/// Private keys, wallet recovery phrases, and bearer tokens. Shown as a redacted label only:
/// never copied, shared, or saved.
enum SecretParser: PayloadKindParser {
  enum Secret: Equatable {
    case privateKey, recoveryPhrase, accessToken

    var title: String {
      switch self {
      case .privateKey: String(localized: "Private key")
      case .recoveryPhrase: String(localized: "Recovery phrase")
      case .accessToken: String(localized: "Access token")
      }
    }
  }

  /// Larger than any 2D symbology's capacity (QR holds at most 7,089 digits), so real codes
  /// are always scanned in full while adversarial input stays bounded.
  static let maxScannedLength = 8_192
  static let recoveryPhraseWordCounts: Set<Int> = [12, 15, 18, 21, 24]
  /// 24 words of at most 8 letters, plus generous whitespace.
  private static let maxRecoveryPhraseLength = 400
  private static let base58 = "[1-9A-HJ-NP-Za-km-z]"

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard let secret = detect(input) else { return nil }
    return ParsedPayload(kind: .auth, title: secret.title, details: secret.title, isSensitive: true)
  }

  static func detect(_ input: PayloadInput) -> Secret? {
    let scanned = input.raw.count > maxScannedLength ? String(input.raw.prefix(maxScannedLength)) : input.raw
    let lower = input.raw.count > maxScannedLength ? scanned.lowercased() : input.lower
    if lower.contains("private") {
      // Bounded so "BEGIN BEGIN BEGIN …" cannot trigger quadratic backtracking.
      if scanned.range(of: #"(?i)BEGIN\s{1,16}[A-Z0-9 ]{0,64}PRIVATE\s{1,16}KEY"#, options: .regularExpression) != nil
        || (!input.isWebCandidate && scanned.range(of: #"(?i)private\s{0,16}key"#, options: .regularExpression) != nil) {
        return .privateKey
      }
    }
    if isWalletImportFormat(input.raw) || (lower.contains("prv") && containsExtendedPrivateKey(scanned))
      || isRawPrivateKey(input.raw) { return .privateKey }
    if isRecoveryPhrase(input.raw) || isSeedQR(input.raw) { return .recoveryPhrase }
    // Tokens inside links are handled by History redaction so magic links still open. A bare token
    // whose last segment happens to look like a domain is still a token.
    if containsJWT(scanned), !isLinkCandidate(input) || !input.raw.contains(where: { $0 == "/" || $0 == ":" }) {
      return .accessToken
    }
    return nil
  }

  /// Nostr `nsec1…` keys, and 64 hex digits with or without `0x` (Ethereum and other raw private
  /// keys). A transaction hash has the same shape; hiding one only costs a copy.
  static func isRawPrivateKey(_ raw: String) -> Bool {
    raw.range(of: #"^(?i:nsec1[02-9ac-hj-np-z]{58})$"#, options: .regularExpression) != nil
      || raw.range(of: #"^(?:0[xX])?[0-9a-fA-F]{64}$"#, options: .regularExpression) != nil
  }

  /// SeedSigner Standard SeedQR: 12 or 24 four-digit BIP39 word indexes (each below 2048).
  static func isSeedQR(_ raw: String) -> Bool {
    guard raw.count == 48 || raw.count == 96, raw.allSatisfy({ $0.isASCII && $0.isNumber }) else { return false }
    var digits = Substring(raw)
    while !digits.isEmpty {
      guard let index = Int(digits.prefix(4)), index < 2048 else { return false }
      digits = digits.dropFirst(4)
    }
    return true
  }

  static func mentionsPasskey(_ input: PayloadInput) -> Bool {
    let lower = input.lower
    guard lower.contains("passkey") || lower.contains("webauthn") || lower.contains("fido2") else { return false }
    let scanned = input.raw.prefix(maxScannedLength)
    return scanned.range(of: #"(?i)\b(passkey|webauthn|fido2)\b"#, options: .regularExpression) != nil
  }

  /// Bitcoin WIF: `5H/5J/5K…` (51) or `K/L…` (52) on mainnet, `9…` (51) or `c…` (52) on testnet.
  static func isWalletImportFormat(_ raw: String) -> Bool {
    guard raw.count == 51 || raw.count == 52 else { return false }
    let pattern = "^(?:5[HJK]\(base58){49}|[KL]\(base58){51}|9\(base58){50}|c\(base58){51})$"
    return raw.range(of: pattern, options: .regularExpression) != nil
  }

  /// BIP32 extended private keys: xprv, yprv, zprv, tprv, uprv, vprv, Yprv, Zprv, Uprv, Vprv.
  static func containsExtendedPrivateKey(_ text: String) -> Bool {
    text.range(of: "(?<!\(base58))(?:[xyztuv]|[YZUV])prv\(base58){100,112}", options: .regularExpression) != nil
  }

  /// 12–24 words that are all in the BIP39 English list. The checksum is not verified, so a
  /// rare ordinary sentence of only list words is also hidden, which errs on the safe side.
  static func isRecoveryPhrase(_ raw: String) -> Bool {
    guard raw.count <= maxRecoveryPhraseLength else { return false }
    // Commas, line breaks, and numbering ("1. abandon 2. ability …") are common in exported phrases.
    let words = raw.split { !$0.isLetter }.filter { !$0.isEmpty }
    guard recoveryPhraseWordCounts.contains(words.count),
      raw.allSatisfy({ $0.isLetter || $0.isNumber || $0.isWhitespace || ".,;:)-".contains($0) }) else { return false }
    return words.allSatisfy { BIP39Words.english.contains($0.lowercased()) }
  }

  /// A compact JWS/JWE: dot-separated base64url segments whose first two start with `eyJ`
  /// (base64url for `{"`). Scanned linearly; no regular expression.
  static func containsJWT(_ text: String) -> Bool {
    guard text.contains("eyJ") else { return false }
    let tokens = text.split { !($0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" || $0 == ".")) }
    return tokens.contains { token in
      let segments = token.split(separator: ".", omittingEmptySubsequences: false)
      return segments.count >= 3 && segments[0].hasPrefix("eyJ") && segments[1].hasPrefix("eyJ")
        && segments[0].count > 3 && segments[1].count > 3
    }
  }

  private static func isLinkCandidate(_ input: PayloadInput) -> Bool {
    input.isWebCandidate || (!input.scheme.isEmpty && !input.raw.contains(where: \.isWhitespace))
  }
}
