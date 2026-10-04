import Foundation
import Testing
@testable import QRScannerCore

private func expectPrivate(_ parsed: ScanPayload, sourceLocation: SourceLocation = #_sourceLocation) {
  #expect(parsed.kind == .wifi, sourceLocation: sourceLocation)
  let password = parsed.wifi?.password ?? ""
  if !password.isEmpty {
    #expect(!parsed.details.contains(password), sourceLocation: sourceLocation)
    #expect(!parsed.title.contains(password), sourceLocation: sourceLocation)
  }
  let event = parsed.historyEvent(at: Date())
  #expect(event.original == nil, sourceLocation: sourceLocation)
  #expect(event.summary == "Wi-Fi network", sourceLocation: sourceLocation)
}

@Test func wifiSecurityIsShownInPlainWords() {
  let cases: [(raw: String, type: ScanPayload.Wifi.Security, label: String)] = [
    ("WIFI:T:WPA;S:home;P:supersecret;;", .wpa, "WPA/WPA2/WPA3"),
    ("WIFI:T:SAE;S:home;P:supersecret;;", .wpa, "WPA/WPA2/WPA3"),
    ("WIFI:T:WPA3;S:home;P:supersecret;;", .wpa, "WPA/WPA2/WPA3"),
    ("WIFI:T:WEP;S:old;P:abcde;;", .wep, "WEP"),
    ("WIFI:T:nopass;S:CoffeeShop;;", .open, "Open"),
    ("WIFI:S:CoffeeShop;;", .open, "Open"),
    ("WIFI:T:WPA2-EAP;S:Corp;E:PEAP;I:me;P:pw;;", .enterprise, "WPA Enterprise"),
  ]
  for (raw, type, label) in cases {
    let parsed = ScanPayload(raw)
    expectPrivate(parsed)
    #expect(parsed.wifi?.securityType == type, "\(raw)")
    #expect(parsed.details.contains("Security: \(label)"), "\(raw)")
  }
}

@Test func wifiHiddenFlagQuotesAndEscapes() {
  let hidden = ScanPayload("WIFI:T:WPA;S:Secret Lab;P:pw;H:true;;")
  expectPrivate(hidden)
  #expect(hidden.wifi?.hidden == true)
  #expect(hidden.details.contains("Hidden network"))
  #expect(!ScanPayload("WIFI:T:WPA;S:Lab;P:pw;;").details.contains("Hidden"))

  let quoted = ScanPayload(#"WIFI:T:WPA;S:"My Network";P:"pa\;ss";;"#)
  #expect(quoted.wifi?.ssid == "My Network")
  #expect(quoted.wifi?.password == "pa;ss")
  #expect(quoted.title == "My Network")

  let escaped = ScanPayload(#"WIFI:T:WPA;S:a\;b\,c\:d\\e\"f;P:p\;w\\;;"#)
  expectPrivate(escaped)
  #expect(escaped.wifi?.ssid == #"a;b,c:d\e"f"#)
  #expect(escaped.wifi?.password == #"p;w\"#)

  let escapedQuote = ScanPayload(#"WIFI:S:\"quoted\";;"#)
  #expect(escapedQuote.wifi?.ssid == #""quoted""#)

  // Hex-looking SSIDs are shown as written; the convention is ambiguous without quotes.
  #expect(ScanPayload("WIFI:S:4F6666696365;;").wifi?.ssid == "4F6666696365")
}

@Test func malformedWifiNeverSavesItsPassword() {
  for raw in ["WIFI:P:hunter2;;", "WIFI:", "WIFI:garbage", "WIFI:T:WPA;P:hunter2", "wifi:s:lower;p:hunter2;;"] {
    let parsed = ScanPayload(raw)
    expectPrivate(parsed)
    #expect(!parsed.title.contains("hunter2"), "\(raw)")
  }
  #expect(ScanPayload("WIFI:P:hunter2;;").title == "Wi-Fi network")
}
