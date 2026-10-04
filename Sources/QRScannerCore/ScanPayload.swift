import Foundation

struct ScanPayload: Identifiable, Equatable {
  enum Kind: String, Codable {
    case url, text, email, phone, sms, geo, contact, calendar, wifi, auth, authExport, customScheme, product, boardingPass
  }
  struct Wifi: Equatable {
    let ssid: String
    /// Never shown, saved, or included in details. Only copied on request.
    let password: String
    /// The raw `T:` value, for example `WPA` or `nopass`. See `securityType` for display.
    let security: String
    let hidden: Bool
  }

  /// Written to every History event. Rows from an older version are re-redacted on load
  /// (`HistoryEvent.applyingCurrentRedaction`); bump it whenever History redaction rules change.
  static let historyParserVersion = 4

  let original: String
  let format: CodeFormat
  let productCode: String?
  let kind: Kind
  /// One line, possibly translated. Shown in results.
  let title: String
  /// A readable multi-line description, possibly translated. Never contains secrets.
  let details: String
  let openURL: URL?
  let wifi: Wifi?
  let isSensitive: Bool
  /// The English, untranslated label History stores. Equals `title` for user content.
  let historySummary: String
  /// What History may store as the payload; links have credential parameters removed.
  let historyOriginal: String

  var id: String { CodeIdentity.id(original, format: format) }

  var symbol: String {
    switch kind {
    case .url, .customScheme: "link"
    case .email: "envelope"
    case .phone: "phone"
    case .sms: "message"
    case .geo: "map"
    case .contact: "person.crop.circle"
    case .calendar: "calendar"
    case .wifi: "wifi"
    case .auth, .authExport: "lock.shield"
    case .text: "text.alignleft"
    case .product: "barcode"
    case .boardingPass: "airplane"
    }
  }

  init(_ original: String, format: CodeFormat = .qr) {
    let input = PayloadInput(original, format: format)
    let parsed = PayloadParser.parse(input)
    self.original = original
    self.format = format
    productCode = input.productCode
    kind = parsed.kind
    title = TextSanitizer.title(parsed.title)
    details = TextSanitizer.details(parsed.details)
    openURL = parsed.openURL
    wifi = parsed.wifi
    isSensitive = parsed.isSensitive
    historySummary = TextSanitizer.title(parsed.summary ?? parsed.title)
    historyOriginal = parsed.historyOriginal ?? original
  }

  /// The event to add to Calendar, read from the payload's first `VEVENT`.
  var calendarEventDraft: CalendarEventDraft? {
    kind == .calendar ? CalendarEventDraft(icalendar: CodeIdentity.normalize(original)) : nil
  }

  /// The contact to add, from a MECARD or vCard payload.
  var contactDraft: ContactDraft? {
    guard kind == .contact else { return nil }
    let raw = CodeIdentity.normalize(original)
    return MECardParser.contact(raw) ?? VCardParser.contact(raw)
  }

  /// Display-safe text. Kept for callers that sanitize stored History summaries.
  static func visible(_ value: String, limit: Int = TextSanitizer.titleLimit, preserveNewlines: Bool = false) -> String {
    preserveNewlines ? TextSanitizer.details(value, limit: limit) : TextSanitizer.title(value, limit: limit)
  }

  func historyEvent(at date: Date) -> HistoryEvent {
    let redacted = isSensitive || kind == .wifi
    return HistoryEvent(id: UUID().uuidString, acceptedAt: HistoryEvent.timestamp(date),
      kind: kind == .boardingPass ? "boardingPass" : isSensitive ? "redacted" : kind.rawValue,
      summary: kind == .boardingPass ? "Boarding pass" : isSensitive ? nil : kind == .wifi ? "Wi-Fi network" : historySummary,
      original: redacted ? nil : historyOriginal, parserVersion: Self.historyParserVersion, format: format)
  }
}
