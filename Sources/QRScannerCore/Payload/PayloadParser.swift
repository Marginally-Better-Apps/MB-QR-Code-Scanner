import Foundation

/// What every per-kind parser sees. Computed once per payload.
struct PayloadInput {
  /// The payload exactly as decoded.
  let original: String
  /// Trimmed, NFC-normalized payload used for classification.
  let raw: String
  let lower: String
  let format: CodeFormat
  let productCode: String?
  let components: URLComponents?
  /// The URL scheme, lowercased. Empty when the payload has none.
  let scheme: String

  init(_ original: String, format: CodeFormat) {
    self.original = original
    self.format = format
    productCode = format.productCode(original)
    raw = CodeIdentity.normalize(original)
    lower = raw.lowercased()
    components = URLComponents(string: raw)
    scheme = components?.scheme?.lowercased() ?? ""
  }

  /// True when the payload is, or will be treated as, an http(s) link.
  var isWebCandidate: Bool { scheme == "http" || scheme == "https" || WebURLParser.looksLikeBareHost(raw) }

  func hasPrefix(_ prefix: String) -> Bool { lower.hasPrefix(prefix) }
}

/// The classification a parser produces. `ScanPayload` sanitizes titles and details.
struct ParsedPayload {
  var kind: ScanPayload.Kind
  var title: String
  var details: String
  var openURL: URL?
  var wifi: ScanPayload.Wifi?
  var isSensitive = false
  /// English History summary when `title` is a translated label. Defaults to `title`.
  var summary: String?
  /// What History may store as the payload. Defaults to the original payload.
  var historyOriginal: String?

  init(kind: ScanPayload.Kind, title: String, details: String, openURL: URL? = nil, wifi: ScanPayload.Wifi? = nil,
       isSensitive: Bool = false, summary: String? = nil, historyOriginal: String? = nil) {
    self.kind = kind
    self.title = title
    self.details = details
    self.openURL = openURL
    self.wifi = wifi
    self.isSensitive = isSensitive
    self.summary = summary
    self.historyOriginal = historyOriginal
  }

  /// The non-actionable fallback for anything unrecognized or malformed.
  static func text(_ input: PayloadInput) -> ParsedPayload {
    ParsedPayload(kind: .text, title: input.raw, details: input.raw)
  }
}

/// A parser for one kind of payload. It returns nil when the payload is not its kind, so the
/// next parser runs. A parser that owns a prefix but finds the payload malformed returns
/// `.text(input)` so a broken `WIFI:` or `MECARD:` code never becomes an app link.
protocol PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload?
}

enum PayloadParser {
  /// Tried in order. Sensitive kinds come first so secrets are never shown as plain text.
  static var parsers: [any PayloadKindParser.Type] {
    [
      BoardingPassParser.self, ProductParser.self, AuthParser.self, SecretParser.self,
      WifiParser.self, MATMSGParser.self, MECardParser.self, VCardParser.self, CalendarParser.self,
      WebURLParser.self, MailtoParser.self, TelParser.self, SMSParser.self, GeoParser.self,
      CustomSchemeParser.self,
    ]
  }

  static func parse(_ input: PayloadInput) -> ParsedPayload {
    for parser in parsers {
      if let parsed = parser.parse(input) { return parsed }
    }
    return .text(input)
  }
}

enum ProductParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.productCode != nil else { return nil }
    return ParsedPayload(kind: .product, title: String(localized: "Product \(input.raw)"),
      details: "\(input.format.name)\n\(input.raw)", summary: "Product \(input.raw)")
  }
}
