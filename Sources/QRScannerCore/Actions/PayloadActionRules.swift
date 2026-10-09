import Foundation

/// Something a person can do with a scanned code. Views render these; the rules that pick them live here.
enum PayloadAction: Hashable, CaseIterable {
  case open, lookup, addContact, addEvent, copyPassword, copy, share
}

/// What is known about whether the system can open a payload's destination.
enum OpenAvailability: Equatable {
  /// Not checked or not checkable. Open is offered and a failure is explained after the tap.
  case unknown
  case available
  /// `canOpenURL` said no, or an earlier attempt failed.
  case unavailable
}

/// Where Open hands the code off to, which decides confirmation and failure wording.
enum OpenHandoff: Equatable {
  /// Web, mail, phone, messages, and maps open directly.
  case direct
  /// Any other app's URL scheme. Always confirmed because the destination app is unknown.
  case appLink(scheme: String, target: String, isPayment: Bool)
  /// `otpauth:` setup codes go to whichever app handles authenticator links.
  case authenticator
  /// `FIDO:` passkey sign-in from a nearby device.
  case passkey

  var needsConfirmation: Bool { self != .direct }
}

/// Why Open was hidden or failed, so the person knows what to do instead.
enum OpenUnavailableReason: Equatable {
  case appNotInstalled, passkey, authenticator
}

/// The actions a result offers, in menu order, with the one shown next to it.
struct PayloadActionSet: Equatable {
  let actions: [PayloadAction]
  let primary: PayloadAction?
  /// Set when Open was hidden because nothing on the device can handle it.
  let openUnavailableReason: OpenUnavailableReason?
}

enum PayloadActionRules {
  /// Schemes that move money get payment-specific confirmation wording.
  static let paymentSchemes: Set<String> = [
    "upi", "bitcoin", "ethereum", "litecoin", "lightning", "bitcoincash", "dogecoin", "monero", "solana",
    "venmo", "cashapp", "cash", "paypal", "zelle", "payto",
  ]

  /// Only schemes declared in `LSApplicationQueriesSchemes` can be checked with `canOpenURL`;
  /// iOS reports every other scheme as unopenable.
  static let queryableSchemes: Set<String> = ["otpauth", "fido"]

  static let confirmationTargetLimit = 200

  static func actions(for payload: ScanPayload, availability: OpenAvailability = .unknown) -> PayloadActionSet {
    var actions: [PayloadAction] = []
    var reason: OpenUnavailableReason?
    if payload.openURL != nil {
      if availability == .unavailable { reason = unavailableReason(for: payload) }
      else { actions.append(.open) }
    }
    if payload.productCode != nil { actions.append(.lookup) }
    if payload.kind == .contact { actions.append(.addContact) }
    if payload.kind == .calendar { actions.append(.addEvent) }
    if let wifi = payload.wifi, !wifi.password.isEmpty { actions.append(.copyPassword) }
    actions.append(contentsOf: [.copy, .share])
    return PayloadActionSet(actions: actions, primary: actions.first { $0 != .share }, openUnavailableReason: reason)
  }

  static func handoff(for payload: ScanPayload) -> OpenHandoff? {
    guard let url = payload.openURL else { return nil }
    let scheme = url.scheme?.lowercased() ?? ""
    switch payload.kind {
    case .auth, .authExport:
      return scheme == "fido" ? .passkey : .authenticator
    case .customScheme:
      let target = middleTruncated(ScanPayload.visible(url.absoluteString, limit: .max), limit: confirmationTargetLimit)
      return .appLink(scheme: ScanPayload.visible(scheme, limit: 40), target: target, isPayment: paymentSchemes.contains(scheme))
    default:
      return .direct
    }
  }

  /// Keeps both ends of a long target, so padding cannot push trailing parameters out of view.
  static func middleTruncated(_ text: String, limit: Int) -> String {
    guard text.count > limit else { return text }
    let half = (limit - 1) / 2
    return String(text.prefix(half)) + "…" + String(text.suffix(limit - 1 - half))
  }

  /// The scheme to pass to `canOpenURL` before offering Open, or nil when the check would be meaningless.
  static func queryableScheme(for payload: ScanPayload) -> String? {
    guard let handoff = handoff(for: payload), handoff == .authenticator || handoff == .passkey,
      let scheme = payload.openURL?.scheme?.lowercased(), queryableSchemes.contains(scheme) else { return nil }
    return scheme
  }

  /// Explains a hidden or failed Open. Nil means the generic "unavailable" message fits.
  static func unavailableReason(for payload: ScanPayload) -> OpenUnavailableReason? {
    switch handoff(for: payload) {
    case .appLink: .appNotInstalled
    case .passkey: .passkey
    case .authenticator: .authenticator
    case .direct, nil: nil
    }
  }

  /// Copy exports the exact scanned payload. Copy Password offers the decoded Wi-Fi password too.
  static func clipboardText(for action: PayloadAction, payload: ScanPayload) -> String? {
    switch action {
    case .copyPassword:
      guard let password = payload.wifi?.password, !password.isEmpty else { return nil }
      return password
    case .copy:
      return payload.original
    default:
      return nil
    }
  }
}
