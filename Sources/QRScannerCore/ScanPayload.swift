import Foundation

struct ScanPayload: Identifiable, Equatable {
  enum Kind: String, Codable {
    case url, text, email, phone, sms, geo, contact, calendar, wifi, auth, authExport, customScheme, product, boardingPass
  }
  struct Wifi: Equatable {
    let ssid: String
    /// Decoded password, also available in the original payload.
    let password: String
    /// The raw `T:` value, for example `WPA` or `nopass`. See `securityType` for display.
    let security: String
    let hidden: Bool
  }

  /// Written to every History event. Older saved payloads are reclassified without changing their data.
  static let historyParserVersion = 5

  let original: String
  let format: CodeFormat
  let productCode: String?
  let kind: Kind
  /// One line, possibly translated. Shown in results.
  let title: String
  /// A readable multi-line description, possibly translated.
  let details: String
  let openURL: URL?
  let wifi: Wifi?
  let isSensitive: Bool
  /// The English, untranslated label History stores. Equals `title` for user content.
  let historySummary: String
  /// Display-safe original data, without truncation. Copy, Share, and History use the exact original.
  var rawData: String { TextSanitizer.details(original, limit: .max) }

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
    HistoryEvent(id: UUID().uuidString, acceptedAt: HistoryEvent.timestamp(date),
      kind: kind.rawValue, summary: historySummary, original: original,
      parserVersion: Self.historyParserVersion, format: format)
  }
}
