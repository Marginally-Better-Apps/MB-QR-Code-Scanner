import Foundation

extension ScanPayload.Wifi {
  enum Security: Equatable {
    case open, wep, wpa, enterprise, other(String)

    /// Maps the `T:` value. WPA, WPA2, WPA3, and SAE all share one personal-network label.
    init(_ value: String) {
      switch value.trimmingCharacters(in: .whitespaces).uppercased() {
      case "", "NOPASS", "NONE", "OPEN": self = .open
      case "WEP": self = .wep
      case "WPA", "WPA2", "WPA3", "SAE", "WPA/WPA2", "WPA2/WPA3", "WPA-PSK", "WPA2-PSK": self = .wpa
      case "WPA2-EAP", "WPA-EAP", "WPA3-EAP", "EAP": self = .enterprise
      default: self = .other(value)
      }
    }

    var name: String {
      switch self {
      case .open: String(localized: "Open")
      case .wep: "WEP"
      case .wpa: "WPA/WPA2/WPA3"
      case .enterprise: String(localized: "WPA Enterprise")
      case .other(let value): TextSanitizer.title(value, limit: 40)
      }
    }
  }

  var securityType: Security { Security(security) }
}

/// `WIFI:T:WPA;S:name;P:password;H:true;;` (ZXing convention). Every `WIFI:` code is a Wi-Fi
/// result, even when malformed, so a password is never saved as plain text.
///
/// SSIDs are shown as written. Quoted values are unquoted. An unquoted hex-looking SSID is not
/// decoded: without quotes the convention is ambiguous, and the app never joins networks.
enum WifiParser: PayloadKindParser {
  static let prefix = "wifi:"

  static func parse(_ input: PayloadInput) -> ParsedPayload? {
    guard input.hasPrefix(prefix) else { return nil }
    let fields = SemicolonFields(String(input.raw.dropFirst(prefix.count)))
    let ssid = fields.field("S").map { SemicolonFields.unescape(SemicolonFields.unquote($0.escapedValue)) } ?? ""
    let password = fields.field("P").map { SemicolonFields.unescape(SemicolonFields.unquote($0.escapedValue)) } ?? ""
    var security = fields["T"] ?? "nopass"
    if security.isEmpty { security = "nopass" }
    let hidden = ["true", "1", "yes"].contains(fields["H"]?.lowercased() ?? "")
    let network = ScanPayload.Wifi(ssid: ssid, password: password, security: security, hidden: hidden)
    var details = [String(localized: "Security: \(network.securityType.name)")]
    if hidden { details.append(String(localized: "Hidden network")) }
    details.append(String(localized: "Join this network in Wi-Fi Settings. QR Scanner does not join networks automatically."))
    return ParsedPayload(kind: .wifi, title: ssid.isEmpty ? String(localized: "Wi-Fi network") : ssid,
      details: details.joined(separator: "\n"), wifi: network, summary: "Wi-Fi network")
  }
}
