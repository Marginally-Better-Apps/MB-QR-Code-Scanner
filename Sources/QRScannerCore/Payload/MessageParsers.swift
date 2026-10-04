import Foundation

/// `MATMSG:TO:a@example.com;SUB:subject;BODY:text;;` (NTT DoCoMo).
enum MATMSGParser: PayloadKindParser {
  static let prefix = "matmsg:"

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.hasPrefix(prefix) else { return nil }
    let fields = SemicolonFields(String(input.raw.dropFirst(prefix.count)))
    guard let recipient = fields["TO"], recipient.contains("@"), !TextSanitizer.containsControls(recipient) else { return .text(input) }
    var mail = URLComponents()
    mail.scheme = "mailto"
    mail.path = recipient
    mail.queryItems = [URLQueryItem(name: "subject", value: fields["SUB"] ?? ""), URLQueryItem(name: "body", value: fields["BODY"] ?? "")]
    return ParsedPayload(kind: .email, title: recipient, details: input.raw, openURL: mail.url)
  }
}

/// `mailto:` links. `URLComponents.path` is already percent-decoded once; decoding again would
/// turn `a%2540b@example.com` into a different address.
enum MailtoParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.hasPrefix("mailto:") else { return nil }
    let recipient = input.components?.path ?? String(input.raw.dropFirst("mailto:".count))
    guard recipient.contains("@"), !TextSanitizer.containsControls(input.raw), !TextSanitizer.containsControls(recipient),
      let url = input.components?.url else {
      return ParsedPayload(kind: .text, title: recipient, details: input.raw)
    }
    return ParsedPayload(kind: .email, title: recipient, details: input.raw, openURL: url)
  }
}

/// `tel:` links. Codes containing `*` or `#` (USSD and carrier codes such as call forwarding)
/// are shown as text and never dialed.
enum TelParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.hasPrefix("tel:") else { return nil }
    var number = String(input.raw.dropFirst("tel:".count))
    if number.hasPrefix("//") { number.removeFirst(2) }
    number = number.removingPercentEncoding ?? number
    guard PhoneNumberFormatter.isDialable(number) else { return ParsedPayload(kind: .text, title: number, details: input.raw) }
    return ParsedPayload(kind: .phone, title: PhoneNumberFormatter.display(number), details: input.raw,
      openURL: URL(string: "tel:" + PhoneNumberFormatter.dialString(number)))
  }
}

/// `SMSTO:number:body` and `sms:number?body=…`. A missing or non-phone recipient is plain text.
enum SMSParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    let isSMSTO = input.hasPrefix("smsto:")
    guard isSMSTO || input.hasPrefix("sms:") else { return nil }
    guard !TextSanitizer.containsControls(input.raw) else { return .text(input) }
    if isSMSTO {
      let parts = String(input.raw.dropFirst("smsto:".count)).split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
      let recipient = String(parts.first ?? "")
      guard PhoneNumberFormatter.isRecipientList(recipient) else { return .text(input) }
      var sms = URLComponents()
      sms.scheme = "sms"
      sms.path = recipient
      sms.queryItems = [URLQueryItem(name: "body", value: parts.count > 1 ? String(parts[1]) : "")]
      return ParsedPayload(kind: .sms, title: PhoneNumberFormatter.display(recipient), details: input.raw, openURL: sms.url)
    }
    let recipient = input.components?.path ?? ""
    guard PhoneNumberFormatter.isRecipientList(recipient), let url = input.components?.url else { return .text(input) }
    return ParsedPayload(kind: .sms, title: PhoneNumberFormatter.display(recipient), details: input.raw, openURL: url)
  }
}

/// `geo:lat,lon[,alt][;u=uncertainty][?q=label]` (RFC 5870), opened in Apple Maps.
enum GeoParser: PayloadKindParser {
  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.scheme == "geo" else { return nil }
    let path = input.components?.path ?? input.raw
    // Parameters such as `;u=35` or `;crs=wgs84` follow the coordinates.
    let coordinatesText = path.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? path
    let coordinates = coordinatesText.split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) }
    guard coordinates.count >= 2, coordinates.count <= 3, let latitude = coordinates[0], let longitude = coordinates[1],
      (-90...90).contains(latitude), (-180...180).contains(longitude) else {
      return ParsedPayload(kind: .text, title: path, details: input.raw)
    }
    var label = path
    var maps = URLComponents(string: "https://maps.apple.com")!
    maps.queryItems = [URLQueryItem(name: "ll", value: "\(latitude),\(longitude)")]
    if let query = input.components?.queryItems?.first(where: { $0.name == "q" })?.value {
      maps.queryItems?.append(URLQueryItem(name: "q", value: query))
      label = query.replacingOccurrences(of: "+", with: " ")
    }
    return ParsedPayload(kind: .geo, title: label, details: input.raw, openURL: maps.url)
  }
}

/// Phone number checks and display grouping. Display never changes what is dialed.
enum PhoneNumberFormatter {
  /// ITU country codes are prefix-free: 1 and 7 are one digit, these are two, all others three.
  private static let twoDigitCountryCodes: Set<String> = [
    "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49",
    "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66",
    "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
  ]

  /// Digits with optional `+`, spaces, dots, dashes, parentheses, and `,` pauses. No `*` or `#`.
  static func isDialable(_ number: String) -> Bool {
    number.range(of: #"^\+?[0-9() .,-]+$"#, options: .regularExpression) != nil && number.contains(where: \.isNumber)
  }

  /// One or more comma-separated dialable numbers.
  static func isRecipientList(_ recipients: String) -> Bool {
    let numbers = recipients.split(separator: ",", omittingEmptySubsequences: false)
    return !numbers.isEmpty && numbers.allSatisfy { isDialable(String($0)) && $0.contains(where: \.isNumber) }
  }

  static func dialString(_ number: String) -> String { number.filter { "+0123456789,".contains($0) } }

  /// Groups an unformatted number for reading: `+14155552671` → `+1 415-555-2671`,
  /// `+442079460958` → `+44 207 946 0958`. Numbers that already contain spacing or
  /// punctuation are shown as written.
  static func display(_ number: String) -> String {
    let trimmed = number.trimmingCharacters(in: .whitespaces)
    if trimmed.contains(",") {
      return trimmed.split(separator: ",").map { display(String($0)) }.joined(separator: ", ")
    }
    let international = trimmed.hasPrefix("+")
    let digits = international ? String(trimmed.dropFirst()) : trimmed
    guard digits.count >= 7, digits.allSatisfy({ $0.isASCII && $0.isNumber }) else { return trimmed }
    if international {
      let codeLength = digits.hasPrefix("1") || digits.hasPrefix("7") ? 1 : twoDigitCountryCodes.contains(String(digits.prefix(2))) ? 2 : 3
      let code = digits.prefix(codeLength), national = String(digits.dropFirst(codeLength))
      if code == "1", national.count == 10 { return "+1 " + northAmerican(national) }
      return "+\(code) " + grouped(national)
    }
    if digits.count == 10, !digits.hasPrefix("0") { return northAmerican(digits) }
    return grouped(digits)
  }

  private static func northAmerican(_ digits: String) -> String {
    let characters = Array(digits)
    return String(characters[0..<3]) + "-" + String(characters[3..<6]) + "-" + String(characters[6...])
  }

  /// A final group of four, preceded by groups of three; a lone leading digit joins the next group.
  private static func grouped(_ digits: String) -> String {
    var remaining = Substring(digits)
    var groups = [String(remaining.suffix(4))]
    remaining = remaining.dropLast(4)
    while !remaining.isEmpty {
      groups.insert(String(remaining.suffix(3)), at: 0)
      remaining = remaining.dropLast(3)
    }
    if groups.count > 1, groups[0].count == 1 { groups[1] = groups[0] + groups[1]; groups.removeFirst() }
    return groups.joined(separator: " ")
  }
}
