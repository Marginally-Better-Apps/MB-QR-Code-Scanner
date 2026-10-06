import Foundation

/// A contact read from a MECARD or vCard, independent of the Contacts framework.
struct ContactDraft: Equatable {
  enum Source: Equatable { case mecard, vCard }

  struct PostalAddress: Equatable {
    var poBox = "", extended = "", street = "", city = "", region = "", postalCode = "", country = ""

    /// MECARD and vCard order: PO box, extended, street, city, region, postal code, country.
    init(components: [String]) {
      let parts = components.map { $0.trimmingCharacters(in: .whitespaces) } + Array(repeating: "", count: 7)
      (poBox, extended, street, city, region, postalCode, country) = (parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6])
    }

    init(street: String) { self.street = street.trimmingCharacters(in: .whitespaces) }

    var isEmpty: Bool { singleLine.isEmpty }
    var singleLine: String {
      [poBox, extended, street, city, region, postalCode, country].filter { !$0.isEmpty }.joined(separator: ", ")
    }
  }

  var source: Source
  var formattedName = ""
  var givenName = "", familyName = "", nickname = ""
  var organization = ""
  var phones: [String] = [], emails: [String] = [], urls: [String] = []
  var note = ""
  var address: PostalAddress?
  var birthday: DateComponents?

  init(source: Source) { self.source = source }

  var hasContent: Bool {
    !displayName.isEmpty || !organization.isEmpty || !phones.isEmpty || !emails.isEmpty
  }

  /// The card's formatted name, or the given and family names in the current locale's order.
  var displayName: String {
    if !formattedName.isEmpty { return formattedName }
    var components = PersonNameComponents()
    components.givenName = givenName.isEmpty ? nil : givenName
    components.familyName = familyName.isEmpty ? nil : familyName
    components.nickname = nickname.isEmpty ? nil : nickname
    return PersonNameComponentsFormatter().string(from: components)
  }

  /// The most identifying non-empty value, in the order a person would look for it.
  var bestTitle: String? {
    [displayName, organization, phones.first.map(PhoneNumberFormatter.display), emails.first].compactMap { $0 }.first { !$0.isEmpty }
  }

  /// A readable summary for the details view. Never the raw card.
  var summary: String {
    var lines: [String] = []
    if !organization.isEmpty, organization != bestTitle { lines.append(organization) }
    lines += phones.map(PhoneNumberFormatter.display)
    lines += emails
    lines += urls
    if let address, !address.isEmpty { lines.append(address.singleLine) }
    if let birthday, let text = Self.format(birthday) { lines.append(String(localized: "Birthday: \(text)")) }
    if !note.isEmpty { lines.append(note) }
    return lines.joined(separator: "\n")
  }

  /// `YYYYMMDD`, `YYYY-MM-DD`, `--MMDD`, or `--MM-DD`. Nil when not a real date.
  static func parseBirthday(_ value: String) -> DateComponents? {
    let digits = value.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "-", with: "")
    let noYear = value.hasPrefix("--")
    guard digits.allSatisfy({ $0.isASCII && $0.isNumber }), digits.count == (noYear ? 4 : 8) else { return nil }
    let numbers = Array(digits)
    let year = noYear ? nil : Int(String(numbers[0..<4]))
    let offset = noYear ? 0 : 4
    guard let month = Int(String(numbers[offset..<offset + 2])), let day = Int(String(numbers[offset + 2..<offset + 4])) else { return nil }
    let components = DateComponents(calendar: Calendar(identifier: .gregorian), year: year, month: month, day: day)
    var check = components
    check.year = year ?? 2000  // A leap year, so --0229 is accepted.
    guard (1...12).contains(month), (1...31).contains(day), check.isValidDate else { return nil }
    return components
  }

  private static func format(_ birthday: DateComponents) -> String? {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    var components = birthday
    components.year = birthday.year ?? 2000
    guard let date = calendar.date(from: components) else { return nil }
    let formatter = DateFormatter()
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    if birthday.year == nil { formatter.setLocalizedDateFormatFromTemplate("MMMMd") } else { formatter.dateStyle = .medium }
    return formatter.string(from: date)
  }
}

/// `MECARD:N:Doe,John;TEL:…;EMAIL:…;;` (NTT DoCoMo). The trailing `;;` is optional.
enum MECardParser: PayloadKindParser {
  static let prefix = "mecard:"

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.hasPrefix(prefix) else { return nil }
    guard let contact = contact(input.raw), contact.hasContent, let title = contact.bestTitle else { return .text(input) }
    return ContactPayload.make(contact, title: title)
  }

  static func contact(_ raw: String) -> ContactDraft? {
    guard raw.lowercased().hasPrefix(prefix) else { return nil }
    let fields = SemicolonFields(String(raw.dropFirst(prefix.count)))
    var contact = ContactDraft(source: .mecard)
    if let name = fields.field("N") {
      // "Family,Given". Some generators separate with an escaped semicolon instead.
      var parts = SemicolonFields.split(name.escapedValue, on: ",")
      if parts.count == 1 { parts = name.value.split(separator: ";", maxSplits: 1).map(String.init) }
      contact.familyName = parts.first?.trimmingCharacters(in: .whitespaces) ?? ""
      contact.givenName = parts.dropFirst().joined(separator: " ").trimmingCharacters(in: .whitespaces)
      if contact.givenName.isEmpty, contact.familyName.contains(" ") {
        // An unstructured "John Doe" is kept whole as the formatted name.
        contact.formattedName = contact.familyName
        contact.familyName = ""
      }
    }
    contact.nickname = fields["NICKNAME"] ?? ""
    contact.organization = fields["ORG"] ?? ""
    contact.phones = (fields.values("TEL") + fields.values("TEL-AV")).filter { !$0.isEmpty }
    contact.emails = fields.values("EMAIL").filter { !$0.isEmpty }
    contact.urls = fields.values("URL").filter { !$0.isEmpty }
    contact.note = fields.values("NOTE").filter { !$0.isEmpty }.joined(separator: "\n")
    if let address = fields.field("ADR") {
      let parts = SemicolonFields.split(address.escapedValue, on: ",")
      contact.address = parts.count == 7 ? ContactDraft.PostalAddress(components: parts) : ContactDraft.PostalAddress(street: address.value)
    }
    contact.birthday = fields["BDAY"].flatMap(ContactDraft.parseBirthday)
    return contact
  }
}

/// `BEGIN:VCARD … END:VCARD`. Adding to Contacts uses the system vCard parser; this reads
/// only what the result title and details need.
enum VCardParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.raw.uppercased().hasPrefix("BEGIN:VCARD") else { return nil }
    guard input.raw.uppercased().contains("END:VCARD"), let contact = contact(input.raw) else { return .text(input) }
    return ContactPayload.make(contact, title: contact.bestTitle)
  }

  static func contact(_ raw: String) -> ContactDraft? {
    guard let lines = ICalFields.firstComponent("VCARD", in: ICalFields.lines(raw)) else { return nil }
    var contact = ContactDraft(source: .vCard)
    contact.formattedName = lines.property("FN")?.text.trimmingCharacters(in: .whitespaces) ?? ""
    if let name = lines.property("N").map({ ICalFields.components($0.rawValue) }) {
      contact.familyName = name.first ?? ""
      contact.givenName = name.count > 1 ? name[1] : ""
    }
    contact.nickname = lines.property("NICKNAME")?.text ?? ""
    contact.organization = lines.property("ORG").map { ICalFields.components($0.rawValue).filter { !$0.isEmpty }.joined(separator: ", ") } ?? ""
    contact.phones = lines.properties("TEL").map { $0.text.replacingOccurrences(of: "tel:", with: "") }.filter { !$0.isEmpty }
    contact.emails = lines.properties("EMAIL").map(\.text).filter { !$0.isEmpty }
    contact.urls = lines.properties("URL").map(\.text).filter { !$0.isEmpty }
    contact.note = lines.properties("NOTE").map(\.text).filter { !$0.isEmpty }.joined(separator: "\n")
    if let address = lines.property("ADR") {
      contact.address = ContactDraft.PostalAddress(components: ICalFields.components(address.rawValue))
    }
    contact.birthday = lines.property("BDAY").flatMap { ContactDraft.parseBirthday(String($0.text.prefix(10))) }
    return contact
  }
}

enum ContactPayload {
  static func make(_ contact: ContactDraft, title: String?) -> ParsedPayload {
    let summary = contact.summary
    let display = title ?? String(localized: "Contact")
    return ParsedPayload(kind: .contact, title: display, details: summary.isEmpty ? display : summary,
      summary: title ?? "Contact")
  }
}
