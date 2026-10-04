import SwiftUI

/// Title, subtitle, and symbol for a saved scan, shared by History rows, search, and details.
struct HistoryRowPresentation {
  let event: HistoryEvent
  let category: HistoryEvent.Category

  init(_ event: HistoryEvent) {
    self.event = event
    category = event.category
  }

  var title: String {
    switch category {
    case .redacted: String(localized: "Sensitive scan")
    case .wifi: String(localized: "Wi-Fi network")
    case .boardingPass: String(localized: "Boarding pass")
    case .payload, .unknown: ScanPayload.visible(event.summary ?? "", limit: 120)
    }
  }

  var subtitle: String {
    guard event.original != nil else { return String(localized: "Details not saved") }
    let kind: String
    if case .payload(let payloadKind) = category { kind = ScanPayload.kindName(payloadKind) }
    else { kind = String(localized: "Text") }
    return "\(kind) · \((event.format ?? .qr).name)"
  }

  /// Uses the parsed payload when one is available, so symbols match the scanner's results.
  func symbol(payload: ScanPayload?) -> String {
    switch category {
    case .redacted: "eye.slash"
    case .wifi: "wifi"
    case .boardingPass: "airplane"
    case .payload, .unknown: payload?.symbol ?? "qrcode"
    }
  }

  /// Explains why a row has no details to show.
  var unsavedDetailMessage: String {
    switch category {
    case .wifi: String(localized: "The Wi-Fi network was not saved.")
    case .boardingPass: String(localized: "The boarding pass details were not saved.")
    case .redacted, .payload, .unknown: String(localized: "This sensitive code was not saved.")
    }
  }

  var searchText: String {
    [title, subtitle, event.original].compactMap { $0 }.joined(separator: "\n")
  }
}
