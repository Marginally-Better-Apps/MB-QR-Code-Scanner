import Foundation

struct ScanPayload: Identifiable, Equatable {
  enum Kind: String, Codable {
    case url, text, email, phone, sms, geo, contact, calendar, wifi, auth, authExport, customScheme
  }
  struct Wifi: Equatable {
    let ssid: String
    let password: String
    let security: String
    let hidden: Bool
  }
  let original: String
  let kind: Kind
  let title: String
  let details: String
  let openURL: URL?
  let wifi: Wifi?
  let isSensitive: Bool
  var id: String { original }
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
    }
  }

  init(_ original: String) {
    self.original = original
    let raw = original.trimmingCharacters(in: .whitespacesAndNewlines).precomposedStringWithCanonicalMapping
    let lower = raw.lowercased()
    let components = URLComponents(string: raw)
    let scheme = components?.scheme?.lowercased() ?? ""
    let sensitive = lower.hasPrefix("otpauth:") || lower.hasPrefix("otpauth-migration:") || lower.hasPrefix("fido:")
      || raw.range(of: #"(?i)\b(passkey|webauthn|fido2)\b|private\s*key|BEGIN\s+[A-Z0-9 ]*PRIVATE\s+KEY"#, options: .regularExpression) != nil
    isSensitive = sensitive
    var detectedKind: Kind = .text
    var label = raw
    var detail = raw
    var destination: URL?
    var network: Wifi?
    if sensitive {
      detectedKind = lower.hasPrefix("otpauth-migration:") ? .authExport : .auth
      label = detectedKind == .authExport ? "Authenticator export" : lower.hasPrefix("fido:") ? "Passkey sign-in" : "Authentication code"
      if scheme == "otpauth", let issuer = components?.queryItems?.first(where: { $0.name.lowercased() == "issuer" })?.value, !issuer.isEmpty {
        label += " (\(Self.visible(issuer, limit: 80)))"
      }
      detail = detectedKind == .authExport ? "Authenticator exports cannot be imported." : label
      let secret = components?.queryItems?.first(where: { $0.name.lowercased() == "secret" })?.value ?? ""
      let validOTP = scheme == "otpauth" && ["totp", "hotp"].contains(components?.host?.lowercased() ?? "")
        && secret.uppercased().range(of: #"^[A-Z2-7]+=*$"#, options: .regularExpression) != nil
      let validFIDO = raw.range(of: #"(?i)^FIDO:/[0-9]{10,}$"#, options: .regularExpression) != nil
      if (validOTP || validFIDO) && !Self.hasControls(raw) { destination = components?.url }
    } else if lower.hasPrefix("wifi:") {
      let fields = Self.wifiFields(String(raw.dropFirst(5)))
      network = Wifi(ssid: fields["S"] ?? "", password: fields["P"] ?? "", security: fields["T"] ?? "nopass", hidden: fields["H"]?.lowercased() == "true")
      detectedKind = .wifi
      label = network!.ssid.isEmpty ? "Wi-Fi network" : network!.ssid
      detail = "\(Self.visible(label))\n\(Self.visible(network!.security))"
    } else if lower.hasPrefix("matmsg:") {
      let fields = Self.wifiFields(String(raw.dropFirst(7)))
      if let recipient = fields["TO"], recipient.contains("@") {
        detectedKind = .email
        label = recipient
        var mail = URLComponents()
        mail.scheme = "mailto"
        mail.path = recipient
        mail.queryItems = [URLQueryItem(name: "subject", value: fields["SUB"] ?? ""), URLQueryItem(name: "body", value: fields["BODY"] ?? "")]
        destination = mail.url
      }
    } else if lower.hasPrefix("mecard:"), raw.hasSuffix(";;") {
      let fields = Self.wifiFields(String(raw.dropFirst(7)))
      if fields["N"] != nil || fields["TEL"] != nil || fields["EMAIL"] != nil {
        detectedKind = .contact
        label = fields["N"] ?? fields["TEL"] ?? fields["EMAIL"] ?? "Contact"
      }
    } else if raw.uppercased().hasPrefix("BEGIN:VCARD"), raw.uppercased().contains("END:VCARD") {
      detectedKind = .contact
      let fields = Self.lineFields(raw)
      label = [fields["FN"], fields["ORG"], fields["EMAIL"], fields["TEL"]].compactMap { $0 }.first { !$0.isEmpty } ?? "Contact"
    } else if raw.uppercased().hasPrefix("BEGIN:VEVENT") || raw.uppercased().hasPrefix("BEGIN:VCALENDAR") {
      let fields = Self.lineFields(raw)
      if raw.uppercased().components(separatedBy: "BEGIN:VEVENT").count == 2,
         raw.uppercased().contains("END:VEVENT"), CalendarDate.parse(fields["DTSTART"], raw: raw, name: "DTSTART") != nil,
         fields["DTEND"] == nil || CalendarDate.parse(fields["DTEND"], raw: raw, name: "DTEND") != nil {
        detectedKind = .calendar
        label = fields["SUMMARY"] ?? "Calendar event"
      }
    } else if ["http", "https"].contains(scheme) || Self.looksLikeHost(raw) {
      let web = URLComponents(string: scheme.isEmpty ? "https://\(raw)" : raw)
      if let web, let host = web.host, !host.isEmpty, web.user == nil, web.password == nil,
         !raw.contains("\\"), !raw.contains(" "), !Self.hasControls(raw), let url = web.url {
        detectedKind = .url
        destination = url
        label = (web.scheme == "http" ? "http://" : "") + (url.host ?? host) + web.percentEncodedPath
        detail = url.absoluteString
      }
    } else if scheme == "mailto" {
      label = components?.path.removingPercentEncoding ?? String(raw.dropFirst(7))
      if label.contains("@"), !Self.hasControls(raw), !Self.hasControls(label) {
        detectedKind = .email
        destination = components?.url
      }
    } else if scheme == "tel" {
      label = String(raw.dropFirst(4)).removingPercentEncoding ?? String(raw.dropFirst(4))
      if label.range(of: #"^[+0-9() .,*#-]+$"#, options: .regularExpression) != nil, label.contains(where: { $0.isNumber }) {
        detectedKind = .phone
        destination = URL(string: "tel:" + label.filter { "+0123456789*#,".contains($0) })
      }
    } else if scheme == "sms" || scheme == "smsto" {
      detectedKind = .sms
      if scheme == "smsto" {
        let parts = String(raw.dropFirst(6)).split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        label = String(parts.first ?? "")
        var sms = URLComponents()
        sms.scheme = "sms"
        sms.path = label
        sms.queryItems = [URLQueryItem(name: "body", value: parts.count > 1 ? String(parts[1]) : "")]
        destination = sms.url
      } else {
        label = components?.path.removingPercentEncoding ?? raw
        destination = Self.hasControls(raw) ? nil : components?.url
      }
    } else if scheme == "geo" {
      label = components?.path ?? raw
      let coordinates = label.split(separator: ",").compactMap { Double($0) }
      if coordinates.count >= 2, (-90...90).contains(coordinates[0]), (-180...180).contains(coordinates[1]) {
        detectedKind = .geo
        var maps = URLComponents(string: "https://maps.apple.com")!
        maps.queryItems = [URLQueryItem(name: "ll", value: "\(coordinates[0]),\(coordinates[1])")]
        if let query = components?.queryItems?.first(where: { $0.name == "q" })?.value {
          maps.queryItems?.append(URLQueryItem(name: "q", value: query))
          label = query.replacingOccurrences(of: "+", with: " ")
        }
        destination = maps.url
      }
    } else if !scheme.isEmpty {
      let blocked: Set<String> = ["javascript", "data", "file", "about", "blob", "intent", "vbscript", "content", "itms-services", "x-apple.systempreferences", "prefs", "app-prefs"]
      if !blocked.contains(scheme), !Self.hasControls(raw), components?.user == nil, components?.password == nil {
        detectedKind = .customScheme
        destination = components?.url
      }
    }
    kind = detectedKind
    title = Self.visible(label, limit: 120)
    details = Self.visible(detail, limit: 20000, preserveNewlines: true)
    openURL = destination
    wifi = network
  }

  static func visible(_ value: String, limit: Int = 120, preserveNewlines: Bool = false) -> String {
    let scalars = value.unicodeScalars.map { scalar -> String in
      let number = scalar.value
      if preserveNewlines && (number == 10 || number == 13) { return String(scalar) }
      if CharacterSet.controlCharacters.contains(scalar) || (0x200B...0x200F).contains(number)
        || (0x2028...0x202E).contains(number) || (0x2066...0x2069).contains(number) || number == 0xFEFF { return "�" }
      return String(scalar)
    }.joined()
    return scalars.count > limit ? String(scalars.prefix(limit - 1)) + "…" : scalars
  }

  private static func hasControls(_ raw: String) -> Bool {
    raw.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) }
  }

  private static func looksLikeHost(_ raw: String) -> Bool {
    !raw.contains(" ") && !raw.contains("@") && raw.range(of: #"^(?:[A-Za-z0-9\p{L}](?:[A-Za-z0-9\p{L}-]*[A-Za-z0-9\p{L}])?\.)+[A-Za-z\p{L}]{2,}(?::[0-9]+)?(?:[/?#].*)?$"#, options: .regularExpression) != nil
  }

  static func wifiFields(_ raw: String) -> [String: String] {
    var fields: [String] = [], current = "", escaped = false
    for character in raw {
      if escaped { current.append(character); escaped = false }
      else if character == "\\" { escaped = true }
      else if character == ";" { fields.append(current); current = "" }
      else { current.append(character) }
    }
    fields.append(current)
    var result: [String: String] = [:]
    for field in fields {
      guard let colon = field.firstIndex(of: ":") else { continue }
      let key = String(field[..<colon]).uppercased()
      if result[key] == nil { result[key] = String(field[field.index(after: colon)...]) }
    }
    return result
  }

  static func lineFields(_ raw: String) -> [String: String] {
    let unfolded = raw.replacingOccurrences(of: "\r\n ", with: "").replacingOccurrences(of: "\n ", with: "")
    var fields: [String: String] = [:]
    for line in unfolded.components(separatedBy: .newlines) {
      guard let colon = line.firstIndex(of: ":") else { continue }
      let name = String(line[..<colon]).components(separatedBy: ";")[0].uppercased()
      fields[name] = String(line[line.index(after: colon)...]).replacingOccurrences(of: "\\n", with: "\n").replacingOccurrences(of: "\\,", with: ",").replacingOccurrences(of: "\\;", with: ";")
    }
    return fields
  }

  func historyEvent(at date: Date) -> HistoryEvent {
    HistoryEvent(id: UUID().uuidString, acceptedAt: HistoryEvent.timestamp(date),
      kind: isSensitive ? "redacted" : kind.rawValue,
      summary: isSensitive ? nil : kind == .wifi ? "Wi-Fi network" : title,
      original: isSensitive || kind == .wifi ? nil : original, parserVersion: 2)
  }
}
